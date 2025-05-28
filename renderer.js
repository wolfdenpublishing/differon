// Document state management
class DocumentState {
    constructor() {
        this.content = '';
        this.filePath = '';
        this.scrollTop = 0;
        this.selectedParagraphs = new Set();
        this.tabId = 'tab-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        this.isModified = false;
    }
}

// Multi-document storage
let documents = {
    left: new Map(),
    right: new Map()
};

let activeTab = {
    left: null,
    right: null
};

// Global settings and state
let currentZoom = 1.0;
let diffMode = 'sentence';
let fuzzLevel = 0.5;
let appConfig = null;

// Store resize observers to prevent memory leaks
const resizeObservers = new Map();

// Store paragraph diff results globally
let paragraphDiffResults = null;
// Store mapping of matched paragraphs between documents
let matchedParagraphs = {
    leftToRight: new Map(),
    rightToLeft: new Map()
};

// Store matched sentences for sentence mode
let matchedSentences = {
    leftToRight: new Map(),
    rightToLeft: new Map()
};

// Store all sentences for current comparison
let currentSentences = {
    left: new Map(),
    right: new Map()
};

// Store fuzzy matched sentence pairs
let fuzzyMatchedPairs = [];

// Track if CTRL is held
let ctrlHeld = false;

// Maximum number of tabs per side
const MAX_TABS = 20;

// Tab management functions
function generateTabTitle(filePath) {
    if (!filePath) return 'Untitled';
    if (filePath.startsWith('Pasted at ')) return filePath;
    const parts = filePath.split(/[/\\]/);
    return parts[parts.length - 1] || 'Untitled';
}

function createNewTab(side, content = '', filePath = '') {
    if (documents[side].size >= MAX_TABS) {
        alert(`Maximum number of tabs (${MAX_TABS}) reached.`);
        return null;
    }
    
    const doc = new DocumentState();
    doc.content = content;
    doc.filePath = filePath;
    
    documents[side].set(doc.tabId, doc);
    
    // Create tab element
    const tabsContainer = document.getElementById(`${side}TabsContainer`);
    const tabElement = document.createElement('div');
    tabElement.className = 'tab';
    tabElement.dataset.tabId = doc.tabId;
    tabElement.innerHTML = `
        <span class="tab-title">${escapeHtml(generateTabTitle(filePath))}</span>
        <button class="tab-close" title="Close tab">×</button>
    `;
    
    // Add event listeners
    tabElement.addEventListener('click', (e) => {
        if (!e.target.classList.contains('tab-close')) {
            switchToTab(side, doc.tabId);
        }
    });
    
    tabElement.querySelector('.tab-close').addEventListener('click', (e) => {
        e.stopPropagation();
        closeTab(side, doc.tabId);
    });
    
    tabsContainer.appendChild(tabElement);
    
    // Switch to the new tab
    switchToTab(side, doc.tabId);
    
    return doc.tabId;
}

function switchToTab(side, tabId) {
    if (activeTab[side] === tabId) return;
    
    // Save current tab state
    if (activeTab[side]) {
        saveCurrentTabState(side);
    }
    
    // Clear current view
    clearComparison();
    
    // Update active tab
    activeTab[side] = tabId;
    
    // Update tab UI
    const tabs = document.querySelectorAll(`#${side}TabsContainer .tab`);
    tabs.forEach(tab => {
        if (tab.dataset.tabId === tabId) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });
    
    // Load new tab content
    const doc = documents[side].get(tabId);
    if (doc) {
        displayDocument(side, doc);
        
        // Re-run paragraph diff if both sides have active documents
        const leftDoc = getActiveDocument('left');
        const rightDoc = getActiveDocument('right');
        if (leftDoc && leftDoc.content && rightDoc && rightDoc.content) {
            runParagraphDiff();
        }
    }
    
    saveState();
}

function closeTab(side, tabId) {
    // Don't close if it's the only tab
    if (documents[side].size <= 1) {
        // Clear the content instead
        const doc = documents[side].get(tabId);
        if (doc) {
            doc.content = '';
            doc.filePath = '';
            doc.scrollTop = 0;
            doc.selectedParagraphs.clear();
            doc.isModified = false;
            displayDocument(side, doc);
        }
        return;
    }
    
    // Find adjacent tab to switch to
    const tabs = Array.from(document.querySelectorAll(`#${side}TabsContainer .tab`));
    const currentIndex = tabs.findIndex(tab => tab.dataset.tabId === tabId);
    let newActiveTab = null;
    
    if (currentIndex > 0) {
        newActiveTab = tabs[currentIndex - 1].dataset.tabId;
    } else if (currentIndex < tabs.length - 1) {
        newActiveTab = tabs[currentIndex + 1].dataset.tabId;
    }
    
    // Remove tab from DOM
    const tabElement = tabs[currentIndex];
    if (tabElement) {
        tabElement.remove();
    }
    
    // Remove document from storage
    documents[side].delete(tabId);
    
    // Clean up resize observer if exists
    if (resizeObservers.has(`${side}-${tabId}`)) {
        resizeObservers.get(`${side}-${tabId}`).disconnect();
        resizeObservers.delete(`${side}-${tabId}`);
    }
    
    // Switch to adjacent tab
    if (newActiveTab) {
        switchToTab(side, newActiveTab);
    }
    
    saveState();
}

function moveTabToOtherSide(fromSide) {
    // Don't move if it's the only tab
    if (documents[fromSide].size <= 1) {
        // Instead of moving, clear the current tab and create a new one on the other side
        const doc = getActiveDocument(fromSide);
        if (!doc || !doc.content) {
            // No content to move
            return;
        }
        
        // Save the document state
        const content = doc.content;
        const filePath = doc.filePath;
        const scrollTop = doc.scrollTop;
        const selectedParagraphs = new Set(doc.selectedParagraphs);
        const isModified = doc.isModified;
        
        // Clear the current tab
        doc.content = '';
        doc.filePath = '';
        doc.scrollTop = 0;
        doc.selectedParagraphs.clear();
        doc.isModified = false;
        displayDocument(fromSide, doc);
        
        // Create new tab on the other side
        const toSide = fromSide === 'left' ? 'right' : 'left';
        const newTabId = createNewTab(toSide, content, filePath);
        
        if (newTabId) {
            const newDoc = documents[toSide].get(newTabId);
            if (newDoc) {
                newDoc.scrollTop = scrollTop;
                newDoc.selectedParagraphs = selectedParagraphs;
                newDoc.isModified = isModified;
                
                // Update tab title to reflect modified state
                updateTabTitle(toSide, newTabId, generateTabTitle(filePath), isModified);
                
                // Restore scroll and selections after display
                setTimeout(() => {
                    const contentElement = document.getElementById(`${toSide}Content`);
                    if (contentElement) {
                        contentElement.scrollTop = scrollTop;
                    }
                    
                    selectedParagraphs.forEach(paragraphNum => {
                        const checkbox = document.querySelector(`#${toSide}-paragraph-${paragraphNum}`);
                        if (checkbox) {
                            checkbox.checked = true;
                        }
                    });
                }, 0);
            }
        }
    } else {
        // Multiple tabs exist, can safely move
        const doc = getActiveDocument(fromSide);
        if (!doc) return;
        
        // Save the current tab state
        saveCurrentTabState(fromSide);
        
        // Save the document state
        const content = doc.content;
        const filePath = doc.filePath;
        const scrollTop = doc.scrollTop;
        const selectedParagraphs = new Set(doc.selectedParagraphs);
        const isModified = doc.isModified;
        const currentTabId = activeTab[fromSide];
        
        // Create new tab on the other side
        const toSide = fromSide === 'left' ? 'right' : 'left';
        const newTabId = createNewTab(toSide, content, filePath);
        
        if (newTabId) {
            const newDoc = documents[toSide].get(newTabId);
            if (newDoc) {
                newDoc.scrollTop = scrollTop;
                newDoc.selectedParagraphs = selectedParagraphs;
                newDoc.isModified = isModified;
                
                // Update tab title to reflect modified state
                updateTabTitle(toSide, newTabId, generateTabTitle(filePath), isModified);
                
                // Restore scroll and selections after display
                setTimeout(() => {
                    const contentElement = document.getElementById(`${toSide}Content`);
                    if (contentElement) {
                        contentElement.scrollTop = scrollTop;
                    }
                    
                    selectedParagraphs.forEach(paragraphNum => {
                        const checkbox = document.querySelector(`#${toSide}-paragraph-${paragraphNum}`);
                        if (checkbox) {
                            checkbox.checked = true;
                        }
                    });
                }, 0);
            }
            
            // Close the original tab
            closeTab(fromSide, currentTabId);
        }
    }
    
    // Clear any comparison since documents have changed sides
    clearComparison();
    
    // Re-run paragraph diff if both sides have content
    const leftDoc = getActiveDocument('left');
    const rightDoc = getActiveDocument('right');
    if (leftDoc && leftDoc.content && rightDoc && rightDoc.content) {
        runParagraphDiff();
    }
    
    saveState();
}

function getActiveDocument(side) {
    if (!activeTab[side]) return null;
    return documents[side].get(activeTab[side]);
}

function updateTabTitle(side, tabId, title, isModified = false) {
    const tab = document.querySelector(`#${side}TabsContainer .tab[data-tab-id="${tabId}"]`);
    if (tab) {
        const titleElement = tab.querySelector('.tab-title');
        titleElement.textContent = title;
        if (isModified) {
            titleElement.classList.add('modified');
        } else {
            titleElement.classList.remove('modified');
        }
    }
}

function saveCurrentTabState(side) {
    const doc = getActiveDocument(side);
    if (!doc) return;
    
    // Save scroll position
    const contentElement = document.getElementById(`${side}Content`);
    if (contentElement) {
        doc.scrollTop = contentElement.scrollTop;
    }
    
    // Save selected paragraphs
    doc.selectedParagraphs.clear();
    const checkboxes = document.querySelectorAll(`#${side}ParagraphNumbers input[type="checkbox"]:checked`);
    checkboxes.forEach(cb => {
        doc.selectedParagraphs.add(parseInt(cb.dataset.paragraph));
    });
}

// Initialize event listeners
document.addEventListener('DOMContentLoaded', async () => {
    // Check if API is available
    if (!window.api) {
        console.error('Electron API not available. Make sure preload script is loaded correctly.');
        return;
    }
    
    // Load configuration
    try {
        appConfig = await window.api.getConfig();
    } catch (error) {
        console.warn('Failed to load config, using defaults');
        appConfig = {
            fuzzyMatching: {
                minMatchPercent: 10,
                maxMatchPercent: 100
            }
        };
    }
    
    // Set up all UI components first
    setupDropZones();
    setupButtons();
    setupFileOpenListener();
    setupPasteListener();
    setupZoomControls();
    setupColorControls();
    setupDiffModeControls();
    setupCopyTooltip();
    setupPaneClearButtons();
    setupSelectAllControls();
    setupStatusBar();
    setupCtrlTracking();
    setupKeyboardShortcuts();
    setupTabControls();
    
    // Load saved state or create default tabs
    window.api.onRestoreState(async () => {
        const loaded = await loadSavedState();
        // If no state was loaded, create default empty tabs
        if (!loaded) {
            createNewTab('left');
            createNewTab('right');
        }
    });
    
    // Also attempt to load state immediately in case the event doesn't fire
    setTimeout(async () => {
        // Only load if we haven't already (no tabs exist)
        if (documents.left.size === 0 && documents.right.size === 0) {
            const loaded = await loadSavedState();
            if (!loaded) {
                createNewTab('left');
                createNewTab('right');
            }
        }
    }, 100);
});

// Add beforeunload to save state
window.addEventListener('beforeunload', () => {
    saveState();
});

function setupTabControls() {
    // New tab buttons
    document.getElementById('leftNewTab').addEventListener('click', () => {
        createNewTab('left');
    });
    
    document.getElementById('rightNewTab').addEventListener('click', () => {
        createNewTab('right');
    });
    
    // Move tab buttons
    document.getElementById('leftMoveTab').addEventListener('click', () => {
        moveTabToOtherSide('left');
    });
    
    document.getElementById('rightMoveTab').addEventListener('click', () => {
        moveTabToOtherSide('right');
    });
}

function setupDropZones() {
    const leftDrop = document.getElementById('leftDrop');
    const rightDrop = document.getElementById('rightDrop');

    setupDropZone(leftDrop, 'left');
    setupDropZone(rightDrop, 'right');

    // Set up browse buttons
    document.getElementById('leftBrowseBtn').addEventListener('click', () => openFileDialog('left'));
    document.getElementById('rightBrowseBtn').addEventListener('click', () => openFileDialog('right'));

    // Set up paste buttons
    document.getElementById('leftPasteBtn').addEventListener('click', () => pasteFromClipboard('left'));
    document.getElementById('rightPasteBtn').addEventListener('click', () => pasteFromClipboard('right'));
}

function setupDropZone(dropZone, side) {
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', async (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');

        const file = e.dataTransfer.files[0];
        if (file) {
            loadFile(file.path, side);
        }
    });
}

async function loadFile(filePath, side) {
    const result = await window.api.readFile(filePath);
    
    if (result.success) {
        const doc = getActiveDocument(side);
        if (doc) {
            doc.content = result.content;
            doc.filePath = filePath;
            doc.isModified = false;
            updateTabTitle(side, doc.tabId, generateTabTitle(filePath), false);
            displayDocument(side, doc);
            
            // Run paragraph diff if both files are loaded
            const leftDoc = getActiveDocument('left');
            const rightDoc = getActiveDocument('right');
            if (leftDoc && leftDoc.content && rightDoc && rightDoc.content) {
                await runParagraphDiff();
            }
            
            saveState();
        }
    } else {
        alert(`Error reading file: ${result.error}`);
    }
}

function loadContent(content, side) {
    // Generate timestamp for pasted content
    const now = new Date();
    const timestamp = now.getFullYear() + '-' +
        String(now.getMonth() + 1).padStart(2, '0') + '-' +
        String(now.getDate()).padStart(2, '0') + ' ' +
        String(now.getHours()).padStart(2, '0') + ':' +
        String(now.getMinutes()).padStart(2, '0') + ':' +
        String(now.getSeconds()).padStart(2, '0');
    const filename = `Pasted at ${timestamp}`;
    
    const doc = getActiveDocument(side);
    if (doc) {
        doc.content = content;
        doc.filePath = filename;
        doc.isModified = false;
        updateTabTitle(side, doc.tabId, filename, false);
        displayDocument(side, doc);
        
        // Run paragraph diff if both files are loaded
        const leftDoc = getActiveDocument('left');
        const rightDoc = getActiveDocument('right');
        if (leftDoc && leftDoc.content && rightDoc && rightDoc.content) {
            runParagraphDiff();
        }
        
        saveState();
    }
}

// Run paragraph-level diff and mark changed paragraphs
async function runParagraphDiff() {
    const leftDoc = getActiveDocument('left');
    const rightDoc = getActiveDocument('right');
    
    if (!leftDoc || !rightDoc || !leftDoc.content || !rightDoc.content) {
        clearParagraphMarkers();
        return;
    }
    
    // Get the paragraph diff
    const diff = await window.api.diffParagraph(leftDoc.content, rightDoc.content);
    paragraphDiffResults = diff;
    
    // Clear existing paragraph markers and mappings
    clearParagraphMarkers();
    matchedParagraphs.leftToRight.clear();
    matchedParagraphs.rightToLeft.clear();
    
    // Split content into paragraphs
    const leftParagraphs = leftDoc.content.split(/\r\n|\r|\n/);
    const rightParagraphs = rightDoc.content.split(/\r\n|\r|\n/);
    
    // Build maps of paragraph content to indices for faster lookup
    const leftParagraphMap = new Map();
    const rightParagraphMap = new Map();
    
    leftParagraphs.forEach((paragraph, index) => {
        if (!leftParagraphMap.has(paragraph)) {
            leftParagraphMap.set(paragraph, []);
        }
        leftParagraphMap.get(paragraph).push(index);
    });
    
    rightParagraphs.forEach((paragraph, index) => {
        if (!rightParagraphMap.has(paragraph)) {
            rightParagraphMap.set(paragraph, []);
        }
        rightParagraphMap.get(paragraph).push(index);
    });
    
    // Process diff results to build mappings
    diff.forEach(part => {
        if (!part.added && !part.removed && part.value.trim()) {
            // This is a matched paragraph (non-empty)
            const leftIndices = leftParagraphMap.get(part.value) || [];
            const rightIndices = rightParagraphMap.get(part.value) || [];
            
            // For each occurrence in left, map to corresponding occurrence in right
            const minLen = Math.min(leftIndices.length, rightIndices.length);
            for (let i = 0; i < minLen; i++) {
                const leftIdx = leftIndices[i];
                const rightIdx = rightIndices[i];
                
                if (leftIdx === -1 || rightIdx === -1) continue; // Skip already used indices
                
                // Store the mapping
                matchedParagraphs.leftToRight.set(leftIdx, rightIdx);
                matchedParagraphs.rightToLeft.set(rightIdx, leftIdx);
                
                // Mark as matched and add click handlers
                const leftParagraphElement = document.getElementById(`left-content-paragraph-${leftIdx}`);
                const rightParagraphElement = document.getElementById(`right-content-paragraph-${rightIdx}`);
                
                if (leftParagraphElement) {
                    leftParagraphElement.classList.add('paragraph-matched');
                    leftParagraphElement.style.cursor = 'pointer';
                    leftParagraphElement.title = 'Click to sync with matching paragraph';
                    // Store both indices as data attributes
                    leftParagraphElement.dataset.paragraphIndex = leftIdx;
                    leftParagraphElement.dataset.matchedIndex = rightIdx;
                    
                    // Remove any existing click handlers first
                    const newLeftElement = leftParagraphElement.cloneNode(true);
                    leftParagraphElement.parentNode.replaceChild(newLeftElement, leftParagraphElement);
                    
                    // Add new click handler to the cloned element
                    newLeftElement.addEventListener('click', function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        const idx = parseInt(this.dataset.paragraphIndex);
                        if (!isNaN(idx)) {
                            scrollToMatchingParagraph('left', idx);
                        }
                    }, true); // Use capture phase
                }
                
                if (rightParagraphElement) {
                    rightParagraphElement.classList.add('paragraph-matched');
                    rightParagraphElement.style.cursor = 'pointer';
                    rightParagraphElement.title = 'Click to sync with matching paragraph';
                    // Store both indices as data attributes
                    rightParagraphElement.dataset.paragraphIndex = rightIdx;
                    rightParagraphElement.dataset.matchedIndex = leftIdx;
                    
                    // Remove any existing click handlers first
                    const newRightElement = rightParagraphElement.cloneNode(true);
                    rightParagraphElement.parentNode.replaceChild(newRightElement, rightParagraphElement);
                    
                    // Add new click handler to the cloned element
                    newRightElement.addEventListener('click', function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        const idx = parseInt(this.dataset.paragraphIndex);
                        if (!isNaN(idx)) {
                            scrollToMatchingParagraph('right', idx);
                        }
                    }, true); // Use capture phase
                }
                
                // Mark these as used
                leftIndices[i] = -1;
                rightIndices[i] = -1;
            }
        } else if (part.removed && part.value.trim()) {
            // Mark deleted paragraphs
            const indices = leftParagraphMap.get(part.value) || [];
            indices.forEach(idx => {
                if (idx !== -1) {
                    const paragraphElement = document.getElementById(`left-content-paragraph-${idx}`);
                    if (paragraphElement) {
                        paragraphElement.classList.add('paragraph-changed', 'paragraph-deleted');
                    }
                }
            });
        } else if (part.added && part.value.trim()) {
            // Mark added paragraphs
            const indices = rightParagraphMap.get(part.value) || [];
            indices.forEach(idx => {
                if (idx !== -1) {
                    const paragraphElement = document.getElementById(`right-content-paragraph-${idx}`);
                    if (paragraphElement) {
                        paragraphElement.classList.add('paragraph-changed', 'paragraph-added');
                    }
                }
            });
        }
    });
}

// Scroll to matching paragraph in the other pane
function scrollToMatchingParagraph(fromSide, fromParagraphNum) {
    let targetParagraphNum;
    let targetSide;
    
    if (fromSide === 'left') {
        targetParagraphNum = matchedParagraphs.leftToRight.get(fromParagraphNum);
        targetSide = 'right';
    } else {
        targetParagraphNum = matchedParagraphs.rightToLeft.get(fromParagraphNum);
        targetSide = 'left';
    }
    
    if (targetParagraphNum !== undefined) {
        const sourceElement = document.getElementById(`${fromSide}-content-paragraph-${fromParagraphNum}`);
        const targetElement = document.getElementById(`${targetSide}-content-paragraph-${targetParagraphNum}`);
        // Try scrolling the paragraph numbers container, which should sync with content
        const targetParagraphNumbers = document.getElementById(`${targetSide}ParagraphNumbers`);
        
        if (sourceElement && targetElement && targetParagraphNumbers) {
            // Get the source's position relative to viewport
            const sourceRect = sourceElement.getBoundingClientRect();
            
            // Get the source editor container for reference
            const sourceEditor = document.getElementById(`${fromSide}Editor`);
            const sourceEditorRect = sourceEditor.getBoundingClientRect();
            
            // Calculate how far down from the top of the editor the source paragraph is
            const sourceOffsetFromTop = sourceRect.top - sourceEditorRect.top;
            
            // Get target's current position
            const targetRect = targetElement.getBoundingClientRect();
            const targetEditor = document.getElementById(`${targetSide}Editor`);
            const targetEditorRect = targetEditor.getBoundingClientRect();
            
            // Calculate current offset of target from its editor top
            const targetCurrentOffset = targetRect.top - targetEditorRect.top;
            
            // Calculate scroll adjustment needed
            const scrollAdjustment = targetCurrentOffset - sourceOffsetFromTop;
            
            // Apply the scroll to paragraph numbers (which syncs with content)
            targetParagraphNumbers.scrollTop += scrollAdjustment;
            
            // Briefly highlight the target paragraph
            targetElement.style.transition = 'background-color 0.3s ease-in-out';
            targetElement.style.backgroundColor = 'rgba(100, 100, 255, 0.3)';
            
            setTimeout(() => {
                targetElement.style.backgroundColor = '';
                setTimeout(() => {
                    targetElement.style.transition = '';
                }, 300);
            }, 600);
        }
    }
}

// Scroll to matching sentence in the other pane
function scrollToMatchingSentence(fromSide, sentenceKey) {
    let targetKey;
    let targetSide;
    
    if (fromSide === 'left') {
        targetKey = matchedSentences.leftToRight.get(sentenceKey);
        targetSide = 'right';
    } else {
        targetKey = matchedSentences.rightToLeft.get(sentenceKey);
        targetSide = 'left';
    }
    
    if (targetKey) {
        // Find the sentence element by its key
        // Use querySelectorAll and find the matching one to handle special characters
        const allMatchedSentences = document.querySelectorAll('.sentence-matched, .fuzzy-matched-sentence');
        let targetElement = null;
        for (const el of allMatchedSentences) {
            if (el.dataset.sentenceKey === targetKey) {
                targetElement = el;
                break;
            }
        }
        if (targetElement) {
            // Get the paragraph containing this sentence
            const targetParagraph = targetElement.closest('.paragraph');
            const targetEditor = document.getElementById(`${targetSide}Editor`);
            const targetContent = document.getElementById(`${targetSide}Content`);
            
            if (targetParagraph && targetEditor && targetContent) {
                // Calculate the position to scroll to
                const targetRect = targetElement.getBoundingClientRect();
                const editorRect = targetEditor.getBoundingClientRect();
                const contentRect = targetContent.getBoundingClientRect();
                
                // Calculate the offset from the top of the content area
                const offsetFromTop = targetRect.top - contentRect.top + targetContent.scrollTop;
                
                // Scroll to center the sentence in view
                const scrollPosition = offsetFromTop - (editorRect.height / 2) + (targetRect.height / 2);
                targetContent.scrollTop = scrollPosition;
                
                // Briefly highlight the target sentence
                targetElement.style.transition = 'background-color 0.3s ease-in-out';
                const originalBg = targetElement.style.backgroundColor;
                targetElement.style.backgroundColor = 'rgba(100, 100, 255, 0.5)';
                
                setTimeout(() => {
                    targetElement.style.backgroundColor = originalBg;
                    setTimeout(() => {
                        targetElement.style.transition = '';
                    }, 300);
                }, 600);
            }
        }
    }
}

// Clear all paragraph change markers
function clearParagraphMarkers() {
    document.querySelectorAll('.paragraph-changed').forEach(el => {
        el.classList.remove('paragraph-changed', 'paragraph-deleted', 'paragraph-added');
    });
    document.querySelectorAll('.paragraph-matched').forEach(el => {
        el.classList.remove('paragraph-matched');
        el.style.cursor = '';
        el.title = '';
        // Remove all click event listeners
        const newEl = el.cloneNode(true);
        if (el.parentNode) {
            el.parentNode.replaceChild(newEl, el);
        }
    });
    paragraphDiffResults = null;
    matchedParagraphs.leftToRight.clear();
    matchedParagraphs.rightToLeft.clear();
}

function displayDocument(side, doc) {
    displayFile(side, doc.content, doc.filePath);
    
    // Restore scroll position
    setTimeout(() => {
        const contentElement = document.getElementById(`${side}Content`);
        if (contentElement) {
            contentElement.scrollTop = doc.scrollTop;
        }
    }, 0);
    
    // Restore selected paragraphs
    doc.selectedParagraphs.forEach(paragraphNum => {
        const checkbox = document.querySelector(`#${side}-paragraph-${paragraphNum}`);
        if (checkbox) {
            checkbox.checked = true;
        }
    });
}

function displayFile(side, content, filePath) {
    const dropZone = document.getElementById(`${side}Drop`);
    const editor = document.getElementById(`${side}Editor`);
    const pathElement = document.getElementById(`${side}Path`);
    const contentElement = document.getElementById(`${side}Content`);
    const paragraphNumbersElement = document.getElementById(`${side}ParagraphNumbers`);
    
    const doc = getActiveDocument(side);
    if (!doc) return;

    // Clean up any existing resize observer
    const observerKey = `${side}-${doc.tabId}`;
    if (resizeObservers.has(observerKey)) {
        resizeObservers.get(observerKey).disconnect();
        resizeObservers.delete(observerKey);
    }

    // Update UI
    if (content) {
        dropZone.style.display = 'none';
        editor.style.display = 'flex';
    } else {
        dropZone.style.display = 'flex';
        editor.style.display = 'none';
    }
    
    pathElement.textContent = filePath;
    pathElement.title = filePath;

    // Split content into paragraphs (handle different line endings)
    const paragraphs = content.split(/\r\n|\r|\n/);

    // Clear paragraph numbers
    paragraphNumbersElement.innerHTML = '';

    // Create paragraph numbers with checkboxes (skip blank paragraphs)
    const paragraphMapping = [];
    
    paragraphs.forEach((paragraph, index) => {
        const paragraphDiv = document.createElement('div');
        const isBlank = paragraph.trim() === '';
        
        if (isBlank) {
            paragraphDiv.className = 'paragraph-number blank-paragraph';
            paragraphDiv.innerHTML = '&nbsp;';
        } else {
            paragraphMapping.push(index);
            paragraphDiv.className = 'paragraph-number';
            paragraphDiv.id = `${side}-paragraph-number-${index}`;
            paragraphDiv.innerHTML = `
                <input type="checkbox" id="${side}-paragraph-${index}" data-paragraph="${index}">
                <label for="${side}-paragraph-${index}">${paragraphMapping.length}</label>
            `;
        }
        paragraphNumbersElement.appendChild(paragraphDiv);
    });

    // Display content
    contentElement.innerHTML = '';
    paragraphs.forEach((paragraph, index) => {
        const paragraphDiv = document.createElement('div');
        paragraphDiv.className = 'paragraph';
        paragraphDiv.id = `${side}-content-paragraph-${index}`;
        paragraphDiv.dataset.paragraphIndex = index; // Add data attribute for easier access
        paragraphDiv.textContent = paragraph || '\n'; // Empty paragraphs need content for proper height
        contentElement.appendChild(paragraphDiv);
    });

    // After rendering, sync paragraph number heights with content paragraph heights
    requestAnimationFrame(() => {
        syncParagraphHeights(side);
    });

    // Sync scrolling between paragraph numbers and content
    contentElement.addEventListener('scroll', () => {
        paragraphNumbersElement.scrollTop = contentElement.scrollTop;
    });

    paragraphNumbersElement.addEventListener('scroll', () => {
        contentElement.scrollTop = paragraphNumbersElement.scrollTop;
    });

    // Re-sync heights when window resizes (as wrapping may change)
    const resizeObserver = new ResizeObserver(() => {
        requestAnimationFrame(() => {
            syncParagraphHeights(side);
        });
    });
    resizeObserver.observe(contentElement);
    resizeObservers.set(observerKey, resizeObserver);
}

function syncParagraphHeights(side) {
    const paragraphNumberElements = document.querySelectorAll(`#${side}ParagraphNumbers .paragraph-number`);
    const contentParagraphElements = document.querySelectorAll(`#${side}Content .paragraph`);

    if (paragraphNumberElements.length !== contentParagraphElements.length) {
        console.warn('Paragraph number mismatch for side:', side);
        return;
    }

    paragraphNumberElements.forEach((paragraphNumEl, index) => {
        const contentParagraphEl = contentParagraphElements[index];
        if (contentParagraphEl && paragraphNumEl) {
            // Get the actual rendered height of the content paragraph (including wrapping)
            const contentHeight = contentParagraphEl.getBoundingClientRect().height;
            // Set the paragraph number element to match that height
            if (contentHeight > 0) {
                paragraphNumEl.style.height = contentHeight + 'px';
            }
        }
    });
}

function setupButtons() {
    document.getElementById('compareBtn').addEventListener('click', performComparison);
    document.getElementById('clearBtn').addEventListener('click', clearAll);
}

function setupSelectAllControls() {
    document.getElementById('leftSelectAll').addEventListener('change', (e) => {
        const checkboxes = document.querySelectorAll('#leftParagraphNumbers input[type="checkbox"]');
        checkboxes.forEach(cb => cb.checked = e.target.checked);
    });

    document.getElementById('rightSelectAll').addEventListener('change', (e) => {
        const checkboxes = document.querySelectorAll('#rightParagraphNumbers input[type="checkbox"]');
        checkboxes.forEach(cb => cb.checked = e.target.checked);
    });
}

function setupPaneClearButtons() {
    document.getElementById('leftClearBtn').addEventListener('click', () => clearPane('left'));
    document.getElementById('rightClearBtn').addEventListener('click', () => clearPane('right'));
}

function clearPane(side) {
    const doc = getActiveDocument(side);
    if (!doc) return;
    
    // Clear document content
    doc.content = '';
    doc.filePath = '';
    doc.scrollTop = 0;
    doc.selectedParagraphs.clear();
    doc.isModified = false;
    
    // Update tab title
    updateTabTitle(side, doc.tabId, 'Untitled', false);
    
    // Update display
    displayDocument(side, doc);
    
    // Clear any highlights
    clearComparison();
    
    // Clear paragraph markers since we may no longer have two documents
    clearParagraphMarkers();
    
    // Uncheck select all
    document.getElementById(`${side}SelectAll`).checked = false;
    
    saveState();
}

function clearAll() {
    // Clear highlighting
    clearComparison();
    
    // Uncheck all checkboxes
    document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.checked = false;
    });
}

async function performComparison() {
    const leftDoc = getActiveDocument('left');
    const rightDoc = getActiveDocument('right');
    
    if (!leftDoc || !rightDoc || !leftDoc.content || !rightDoc.content) {
        alert('Please load both files before comparing.');
        return;
    }

    // Get selected paragraphs
    const leftSelectedParagraphs = getSelectedParagraphs('left');
    const rightSelectedParagraphs = getSelectedParagraphs('right');

    if (leftSelectedParagraphs.length === 0 || rightSelectedParagraphs.length === 0) {
        alert('Please select paragraphs to compare in both documents.');
        return;
    }

    // Clear previous comparison highlights
    clearComparison();
    
    // Initialize current sentences and fuzzy pairs
    currentSentences = { left: new Map(), right: new Map() };
    fuzzyMatchedPairs = [];

    // Get content of selected paragraphs (handle different line endings)
    const leftParagraphs = leftDoc.content.split(/\r\n|\r|\n/);
    const rightParagraphs = rightDoc.content.split(/\r\n|\r|\n/);

    const leftSelectedContent = leftSelectedParagraphs.map(i => leftParagraphs[i] || '').join('\n');
    const rightSelectedContent = rightSelectedParagraphs.map(i => rightParagraphs[i] || '').join('\n');

    try {
        // Perform diff based on selected mode
        let diff;
        switch (diffMode) {
            case 'sentence':
                // Pass the selected paragraph indices and full text to help with mapping
                const result = await window.api.diffSentence(leftSelectedContent, rightSelectedContent, leftSelectedParagraphs, rightSelectedParagraphs, leftDoc.content, rightDoc.content);
                diff = result.diff;
                matchedSentences = result.matchedSentences;
                currentSentences = result.sentenceInfo || { left: new Map(), right: new Map() };
                fuzzyMatchedPairs = []; // No fuzzy pairs in whole sentence mode
                break;
            case 'fuzzy':
                // Calculate match threshold from fuzz level using config values
                const minMatch = appConfig?.fuzzyMatching?.minMatchPercent || 10;
                const maxMatch = appConfig?.fuzzyMatching?.maxMatchPercent || 100;
                const range = (maxMatch - minMatch) / 100;
                // fuzzLevel 0.00 = maxMatch%, fuzzLevel 1.00 = minMatch%
                const matchThreshold = (maxMatch - (fuzzLevel * (maxMatch - minMatch))) / 100;
                const fuzzyResult = await window.api.diffFuzzySentence(leftSelectedContent, rightSelectedContent, leftSelectedParagraphs, rightSelectedParagraphs, leftDoc.content, rightDoc.content, matchThreshold);
                diff = fuzzyResult.diff;
                matchedSentences = fuzzyResult.matchedSentences;
                currentSentences = fuzzyResult.sentenceInfo || { left: new Map(), right: new Map() };
                fuzzyMatchedPairs = fuzzyResult.fuzzyMatchedPairs || [];
                break;
            default:
                console.error('Invalid diff mode:', diffMode);
                return;
        }

        // Apply highlighting with the enhanced diff results
        applyDiffHighlighting(diff, leftSelectedParagraphs, rightSelectedParagraphs);
    } catch (error) {
        console.error('Error performing comparison:', error);
        alert('Error performing comparison. Please try selecting fewer paragraphs.');
    }
}

function getSelectedParagraphs(side) {
    const checkboxes = document.querySelectorAll(`#${side}ParagraphNumbers .paragraph-number input[type="checkbox"]:checked`);
    return Array.from(checkboxes).map(cb => parseInt(cb.dataset.paragraph));
}

function applyDiffHighlighting(diff, leftSelectedParagraphs, rightSelectedParagraphs) {
    const leftDoc = getActiveDocument('left');
    const rightDoc = getActiveDocument('right');
    
    if (!leftDoc || !rightDoc) return;
    
    const leftParagraphs = leftDoc.content.split(/\r\n|\r|\n/);
    const rightParagraphs = rightDoc.content.split(/\r\n|\r|\n/);
    
    // Build a map of selected paragraph content and their starting positions
    const leftParagraphMap = new Map();
    const rightParagraphMap = new Map();
    
    let leftPos = 0;
    let rightPos = 0;
    
    leftSelectedParagraphs.forEach(paragraphNum => {
        const paragraphText = leftParagraphs[paragraphNum] || '';
        leftParagraphMap.set(paragraphNum, {
            text: paragraphText,
            start: leftPos,
            end: leftPos + paragraphText.length
        });
        leftPos += paragraphText.length + 1; // +1 for newline
    });
    
    rightSelectedParagraphs.forEach(paragraphNum => {
        const paragraphText = rightParagraphs[paragraphNum] || '';
        rightParagraphMap.set(paragraphNum, {
            text: paragraphText,
            start: rightPos,
            end: rightPos + paragraphText.length
        });
        rightPos += paragraphText.length + 1; // +1 for newline
    });
    
    // Apply background to all selected paragraphs
    leftSelectedParagraphs.forEach(paragraphNum => {
        const paragraphElement = document.getElementById(`left-content-paragraph-${paragraphNum}`);
        if (paragraphElement) {
            paragraphElement.classList.add('deleted');
        }
    });
    
    rightSelectedParagraphs.forEach(paragraphNum => {
        const paragraphElement = document.getElementById(`right-content-paragraph-${paragraphNum}`);
        if (paragraphElement) {
            paragraphElement.classList.add('added');
        }
    });
    
    // First, collect all highlights for each paragraph
    const leftParagraphHighlights = new Map(); // paragraphNum -> array of highlights
    const rightParagraphHighlights = new Map(); // paragraphNum -> array of highlights
    
    // Process diff parts to collect highlights
    diff.forEach((part, index) => {
        if (part.side === 'left' && (part.removed || part.added)) {
            // Find which paragraphs this change affects
            leftSelectedParagraphs.forEach(paragraphNum => {
                const paragraphInfo = leftParagraphMap.get(paragraphNum);
                if (!paragraphInfo) return;
                
                // Check if this change overlaps with this paragraph
                if ((part.start >= paragraphInfo.start && part.start < paragraphInfo.end) ||
                    (part.end > paragraphInfo.start && part.end <= paragraphInfo.end) ||
                    (part.start <= paragraphInfo.start && part.end >= paragraphInfo.end)) {
                    
                    // Calculate relative positions within the paragraph
                    const relativeStart = Math.max(0, part.start - paragraphInfo.start);
                    const relativeEnd = Math.min(paragraphInfo.text.length, part.end - paragraphInfo.start);
                    
                    // Validate positions
                    if (relativeStart < relativeEnd && relativeEnd <= paragraphInfo.text.length) {
                        // Store highlight info for this paragraph
                        if (!leftParagraphHighlights.has(paragraphNum)) {
                            leftParagraphHighlights.set(paragraphNum, []);
                        }
                        leftParagraphHighlights.get(paragraphNum).push({
                            start: relativeStart,
                            end: relativeEnd,
                            text: part.value,
                            type: 'deleted'
                        });
                    }
                }
            });
        } else if (part.side === 'right' && (part.removed || part.added)) {
            // Find which paragraphs this change affects
            rightSelectedParagraphs.forEach(paragraphNum => {
                const paragraphInfo = rightParagraphMap.get(paragraphNum);
                if (!paragraphInfo) return;
                
                // Check if this change overlaps with this paragraph
                if ((part.start >= paragraphInfo.start && part.start < paragraphInfo.end) ||
                    (part.end > paragraphInfo.start && part.end <= paragraphInfo.end) ||
                    (part.start <= paragraphInfo.start && part.end >= paragraphInfo.end)) {
                    
                    // Calculate relative positions within the paragraph
                    const relativeStart = Math.max(0, part.start - paragraphInfo.start);
                    const relativeEnd = Math.min(paragraphInfo.text.length, part.end - paragraphInfo.start);
                    
                    // Validate positions
                    if (relativeStart < relativeEnd && relativeEnd <= paragraphInfo.text.length) {
                        // Store highlight info for this paragraph
                        if (!rightParagraphHighlights.has(paragraphNum)) {
                            rightParagraphHighlights.set(paragraphNum, []);
                        }
                        rightParagraphHighlights.get(paragraphNum).push({
                            start: relativeStart,
                            end: relativeEnd,
                            text: part.value,
                            type: 'added'
                        });
                    }
                }
            });
        }
    });
    
    // Now apply all highlights to each paragraph
    // Apply left highlights
    leftSelectedParagraphs.forEach(paragraphNum => {
        const paragraphInfo = leftParagraphMap.get(paragraphNum);
        const paragraphElement = document.getElementById(`left-content-paragraph-${paragraphNum}`);
        if (!paragraphElement || !paragraphInfo) return;
        
        const highlights = leftParagraphHighlights.get(paragraphNum) || [];
        
        // Sort highlights by start position
        highlights.sort((a, b) => a.start - b.start);
        
        // Merge overlapping highlights
        const mergedHighlights = [];
        highlights.forEach(highlight => {
            if (mergedHighlights.length === 0) {
                mergedHighlights.push(highlight);
            } else {
                const last = mergedHighlights[mergedHighlights.length - 1];
                if (highlight.start <= last.end) {
                    // Overlapping or adjacent - merge them
                    last.end = Math.max(last.end, highlight.end);
                    last.text = paragraphInfo.text.slice(last.start, last.end);
                } else {
                    mergedHighlights.push(highlight);
                }
            }
        });
        
        // Build the HTML with all highlights
        let html = '';
        let lastPos = 0;
        
        // Get sentence info for this paragraph
        const sentences = (diffMode === 'sentence' || diffMode === 'fuzzy') && currentSentences.left.has(paragraphNum) 
            ? currentSentences.left.get(paragraphNum) : [];
        
        if (mergedHighlights.length === 0 && sentences.length > 0) {
            // No highlights, but we may have matched sentences
            html = processTextForSentences(paragraphInfo.text, 0, paragraphNum, 'left', sentences);
        } else {
            mergedHighlights.forEach(highlight => {
                // Add text before this highlight
                if (highlight.start > lastPos) {
                    const beforeText = paragraphInfo.text.slice(lastPos, highlight.start);
                    html += processTextForSentences(beforeText, lastPos, paragraphNum, 'left', sentences);
                }
                
                // Add the highlighted text
                const highlightText = paragraphInfo.text.slice(highlight.start, highlight.end);
                const className = `diff-part ${diffMode}-${highlight.type}`;
                html += `<span class="${className}" data-text="${escapeHtml(highlight.text)}">${escapeHtml(highlightText)}</span>`;
                
                lastPos = highlight.end;
            });
            
            // Add any remaining text
            if (lastPos < paragraphInfo.text.length) {
                const remainingText = paragraphInfo.text.slice(lastPos);
                html += processTextForSentences(remainingText, lastPos, paragraphNum, 'left', sentences);
            }
        }
        
        paragraphElement.innerHTML = html || '&nbsp;';
        
        // Add click handlers to all diff parts
        paragraphElement.querySelectorAll('.diff-part').forEach(part => {
            part.addEventListener('click', handleDiffPartClick);
        });
        
        // Add click handlers to matched sentences
        paragraphElement.querySelectorAll('.sentence-matched, .fuzzy-matched-sentence').forEach(sentence => {
            sentence.addEventListener('click', handleSentenceClick);
        });
    });
    
    // Apply right highlights
    rightSelectedParagraphs.forEach(paragraphNum => {
        const paragraphInfo = rightParagraphMap.get(paragraphNum);
        const paragraphElement = document.getElementById(`right-content-paragraph-${paragraphNum}`);
        if (!paragraphElement || !paragraphInfo) return;
        
        const highlights = rightParagraphHighlights.get(paragraphNum) || [];
        
        // Sort highlights by start position
        highlights.sort((a, b) => a.start - b.start);
        
        // Merge overlapping highlights
        const mergedHighlights = [];
        highlights.forEach(highlight => {
            if (mergedHighlights.length === 0) {
                mergedHighlights.push(highlight);
            } else {
                const last = mergedHighlights[mergedHighlights.length - 1];
                if (highlight.start <= last.end) {
                    // Overlapping or adjacent - merge them
                    last.end = Math.max(last.end, highlight.end);
                    last.text = paragraphInfo.text.slice(last.start, last.end);
                } else {
                    mergedHighlights.push(highlight);
                }
            }
        });
        
        // Build the HTML with all highlights
        let html = '';
        let lastPos = 0;
        
        // Get sentence info for this paragraph
        const sentences = (diffMode === 'sentence' || diffMode === 'fuzzy') && currentSentences.right.has(paragraphNum) 
            ? currentSentences.right.get(paragraphNum) : [];
        
        if (mergedHighlights.length === 0 && sentences.length > 0) {
            // No highlights, but we may have matched sentences
            html = processTextForSentences(paragraphInfo.text, 0, paragraphNum, 'right', sentences);
        } else {
            mergedHighlights.forEach(highlight => {
                // Add text before this highlight
                if (highlight.start > lastPos) {
                    const beforeText = paragraphInfo.text.slice(lastPos, highlight.start);
                    html += processTextForSentences(beforeText, lastPos, paragraphNum, 'right', sentences);
                }
                
                // Add the highlighted text
                const highlightText = paragraphInfo.text.slice(highlight.start, highlight.end);
                const className = `diff-part ${diffMode}-${highlight.type}`;
                html += `<span class="${className}" data-text="${escapeHtml(highlight.text)}">${escapeHtml(highlightText)}</span>`;
                
                lastPos = highlight.end;
            });
            
            // Add any remaining text
            if (lastPos < paragraphInfo.text.length) {
                const remainingText = paragraphInfo.text.slice(lastPos);
                html += processTextForSentences(remainingText, lastPos, paragraphNum, 'right', sentences);
            }
        }
        
        paragraphElement.innerHTML = html || '&nbsp;';
        
        // Add click handlers to all diff parts
        paragraphElement.querySelectorAll('.diff-part').forEach(part => {
            part.addEventListener('click', handleDiffPartClick);
        });
        
        // Add click handlers to matched sentences
        paragraphElement.querySelectorAll('.sentence-matched').forEach(sentence => {
            sentence.addEventListener('click', handleSentenceClick);
        });
    });
}

function handleDiffPartClick(event) {
    const text = event.target.dataset.text;
    if (text) {
        if (ctrlHeld) {
            window.api.appendToClipboard(text);
        } else {
            window.api.copyToClipboard(text);
        }
        showCopyTooltip(event.pageX, event.pageY, ctrlHeld ? 'Added to clipboard!' : 'Copied to clipboard!');
    }
}

function handleSentenceClick(event) {
    // Don't handle sentence click if clicking on an inline diff part
    if (event.target.classList.contains('inline-diff-deleted') || 
        event.target.classList.contains('inline-diff-added')) {
        return;
    }
    
    event.stopPropagation();
    const sentenceKey = event.currentTarget.dataset.sentenceKey;
    const side = event.currentTarget.dataset.side;
    if (sentenceKey && side) {
        scrollToMatchingSentence(side, sentenceKey);
    }
}

function showCopyTooltip(x, y, message = 'Copied to clipboard!') {
    const tooltip = document.querySelector('.copy-tooltip') || createCopyTooltip();
    tooltip.textContent = message;
    tooltip.style.left = x + 'px';
    tooltip.style.top = (y - 30) + 'px';
    tooltip.classList.add('visible');
    
    setTimeout(() => {
        tooltip.classList.remove('visible');
    }, 1500);
}

function createCopyTooltip() {
    const tooltip = document.createElement('div');
    tooltip.className = 'copy-tooltip';
    tooltip.textContent = 'Copied to clipboard!';
    document.body.appendChild(tooltip);
    return tooltip;
}

function setupCopyTooltip() {
    // Create tooltip element if it doesn't exist
    if (!document.querySelector('.copy-tooltip')) {
        createCopyTooltip();
    }
}

// Helper function to process text and mark matched sentences
function processTextForSentences(text, startOffset, paragraphNum, side, sentences) {
    if (!text || (diffMode !== 'sentence' && diffMode !== 'fuzzy')) {
        return escapeHtml(text);
    }
    
    let result = '';
    let lastEnd = 0;
    
    // Find which sentences overlap with this text segment
    sentences.forEach(sentence => {
        const sentStart = sentence.start - startOffset;
        const sentEnd = sentence.end - startOffset;
        
        // Check if this sentence overlaps with our text segment
        if (sentEnd > 0 && sentStart < text.length) {
            // Add text before sentence
            if (sentStart > lastEnd) {
                result += escapeHtml(text.slice(lastEnd, Math.max(0, sentStart)));
            }
            
            // Get the actual sentence text within our segment
            const actualStart = Math.max(0, sentStart);
            const actualEnd = Math.min(text.length, sentEnd);
            const sentenceText = text.slice(actualStart, actualEnd);
            
            // Check if this is a matched sentence
            const sentenceKey = `${paragraphNum}:${sentence.text}`;
            const matchMap = side === 'left' ? matchedSentences.leftToRight : matchedSentences.rightToLeft;
            
            if (matchMap.has(sentenceKey)) {
                // Check if this is a fuzzy matched sentence
                const fuzzyPair = fuzzyMatchedPairs.find(pair => 
                    (side === 'left' && pair.left.paragraphIndex === paragraphNum && pair.left.sentence === sentence.text) ||
                    (side === 'right' && pair.right.paragraphIndex === paragraphNum && pair.right.sentence === sentence.text)
                );
                
                if (fuzzyPair) {
                    // This is a fuzzy matched sentence - show inline diff
                    result += `<span class="fuzzy-matched-sentence" data-sentence-key="${sentenceKey.replace(/"/g, '&quot;')}" data-side="${side}">`;
                    
                    if (side === 'left') {
                        // Show original text with deletions highlighted
                        let processedText = '';
                        fuzzyPair.wordDiff.forEach((part, index) => {
                            if (part.type === 'unchanged') {
                                processedText += escapeHtml(part.value);
                            } else if (part.type === 'deleted') {
                                processedText += `<span class="inline-diff-deleted diff-part" data-text="${escapeHtml(part.value)}">${escapeHtml(part.value)}</span>`;
                            }
                            // Add space between parts if not the last one
                            if (index < fuzzyPair.wordDiff.length - 1 && 
                                fuzzyPair.wordDiff[index + 1].type !== 'added') {
                                processedText += ' ';
                            }
                        });
                        result += processedText.trim();
                    } else {
                        // Show revised text with additions highlighted
                        let processedText = '';
                        fuzzyPair.wordDiff.forEach((part, index) => {
                            if (part.type === 'unchanged') {
                                processedText += escapeHtml(part.value);
                            } else if (part.type === 'added') {
                                processedText += `<span class="inline-diff-added diff-part" data-text="${escapeHtml(part.value)}">${escapeHtml(part.value)}</span>`;
                            }
                            // Add space between parts if not the last one
                            if (index < fuzzyPair.wordDiff.length - 1 && 
                                fuzzyPair.wordDiff[index + 1].type !== 'deleted') {
                                processedText += ' ';
                            }
                        });
                        result += processedText.trim();
                    }
                    
                    result += `</span>`;
                } else {
                    // Exact match
                    result += `<span class="sentence-matched" data-sentence-key="${sentenceKey.replace(/"/g, '&quot;')}" data-side="${side}">${escapeHtml(sentenceText)}</span>`;
                }
            } else {
                result += escapeHtml(sentenceText);
            }
            
            lastEnd = actualEnd;
        }
    });
    
    // Add any remaining text
    if (lastEnd < text.length) {
        result += escapeHtml(text.slice(lastEnd));
    }
    
    return result || escapeHtml(text);
}

function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function clearComparison() {
    // Remove all highlighting (but preserve paragraph markers)
    document.querySelectorAll('.paragraph').forEach(paragraph => {
        paragraph.classList.remove('deleted', 'added');
    });

    // Clear matched sentences
    matchedSentences.leftToRight.clear();
    matchedSentences.rightToLeft.clear();
    if (currentSentences && currentSentences.left) {
        currentSentences.left.clear();
        currentSentences.right.clear();
    }
    fuzzyMatchedPairs = [];

    // Restore original text content (remove span highlights)
    ['left', 'right'].forEach(side => {
        const doc = getActiveDocument(side);
        if (!doc) return;
        
        const paragraphs = doc.content.split(/\r\n|\r|\n/);
        paragraphs.forEach((paragraph, index) => {
            const paragraphElement = document.getElementById(`${side}-content-paragraph-${index}`);
            if (paragraphElement) {
                // Preserve data attributes and event handlers
                const wasMatched = paragraphElement.classList.contains('paragraph-matched');
                const dataParagraphIndex = paragraphElement.dataset.paragraphIndex;
                
                paragraphElement.textContent = paragraph || '\n';
                
                // Restore data attribute
                if (dataParagraphIndex !== undefined) {
                    paragraphElement.dataset.paragraphIndex = dataParagraphIndex;
                }
            }
        });
        
        // Re-sync paragraph heights after clearing
        requestAnimationFrame(() => {
            syncParagraphHeights(side);
        });
    });
}

function cycleTab(reverse = false) {
    const focusedElement = document.activeElement;
    const leftPane = document.getElementById('leftPane');
    const rightPane = document.getElementById('rightPane');
    
    let side = null;
    if (rightPane.contains(focusedElement)) {
        side = 'right';
    } else if (leftPane.contains(focusedElement)) {
        side = 'left';
    }
    
    if (side) {
        const tabs = Array.from(document.querySelectorAll(`#${side}TabsContainer .tab`));
        const currentIndex = tabs.findIndex(tab => tab.classList.contains('active'));
        
        if (currentIndex !== -1) {
            let newIndex;
            if (reverse) {
                // Previous tab
                newIndex = currentIndex > 0 ? currentIndex - 1 : tabs.length - 1;
            } else {
                // Next tab
                newIndex = currentIndex < tabs.length - 1 ? currentIndex + 1 : 0;
            }
            
            const newTabId = tabs[newIndex].dataset.tabId;
            if (newTabId) {
                switchToTab(side, newTabId);
            }
        }
    }
}

function setupFileOpenListener() {
    window.api.onFileOpened((data) => {
        loadFile(data.path, data.side);
    });
    
    window.api.onFileOpenedNewTab((data) => {
        createNewTab(data.side);
        loadFile(data.path, data.side);
    });
    
    window.api.onNewTab(() => {
        // Determine which pane is focused or default to left
        const focusedElement = document.activeElement;
        const leftPane = document.getElementById('leftPane');
        const rightPane = document.getElementById('rightPane');
        
        if (rightPane.contains(focusedElement)) {
            createNewTab('right');
        } else {
            createNewTab('left');
        }
    });
    
    window.api.onCloseTab(() => {
        // Determine which pane is focused
        const focusedElement = document.activeElement;
        const leftPane = document.getElementById('leftPane');
        const rightPane = document.getElementById('rightPane');
        
        if (rightPane.contains(focusedElement) && activeTab.right) {
            closeTab('right', activeTab.right);
        } else if (leftPane.contains(focusedElement) && activeTab.left) {
            closeTab('left', activeTab.left);
        }
    });
    
    window.api.onNextTab(() => {
        cycleTab(false);
    });
    
    window.api.onPreviousTab(() => {
        cycleTab(true);
    });
}

function setupPasteListener() {
    window.api.onPasteContent(async (data) => {
        const text = await window.api.getClipboardText();
        if (text) {
            loadContent(text, data.side);
        }
    });
}

function openFileDialog(side) {
    // Send message to main process to open file dialog
    window.api.openFileDialog(side);
}

async function pasteFromClipboard(side) {
    const text = await window.api.getClipboardText();
    if (text) {
        loadContent(text, side);
    } else {
        alert('Clipboard is empty or does not contain text.');
    }
}

function setupZoomControls() {
    const zoomInBtn = document.getElementById('zoomInBtn');
    const zoomOutBtn = document.getElementById('zoomOutBtn');
    const zoomResetBtn = document.getElementById('zoomResetBtn');
    const zoomLevel = document.getElementById('zoomLevel');

    zoomInBtn.addEventListener('click', () => {
        currentZoom = Math.min(currentZoom + 0.25, 3.0);
        updateZoom();
    });

    zoomOutBtn.addEventListener('click', () => {
        currentZoom = Math.max(currentZoom - 0.25, 0.5);
        updateZoom();
    });

    zoomResetBtn.addEventListener('click', () => {
        currentZoom = 1.0;
        updateZoom();
    });

    function updateZoom() {
        window.api.setZoom(currentZoom);
        zoomLevel.textContent = Math.round(currentZoom * 100) + '%';
        saveState();
    }
}

function setupColorControls() {
    // Left pane color controls
    document.getElementById('leftBgColor').addEventListener('input', (e) => {
        document.documentElement.style.setProperty('--left-bg-hue', e.target.value);
        saveState();
    });

    document.getElementById('leftBgIntensity').addEventListener('input', (e) => {
        const value = e.target.value / 100;
        document.documentElement.style.setProperty('--left-bg-intensity', value);
        saveState();
    });

    document.getElementById('leftHlColor').addEventListener('input', (e) => {
        document.documentElement.style.setProperty('--left-hl-hue', e.target.value);
        saveState();
    });

    document.getElementById('leftHlIntensity').addEventListener('input', (e) => {
        const value = e.target.value / 100;
        document.documentElement.style.setProperty('--left-hl-intensity', value);
        saveState();
    });

    // Right pane color controls
    document.getElementById('rightBgColor').addEventListener('input', (e) => {
        document.documentElement.style.setProperty('--right-bg-hue', e.target.value);
        saveState();
    });

    document.getElementById('rightBgIntensity').addEventListener('input', (e) => {
        const value = e.target.value / 100;
        document.documentElement.style.setProperty('--right-bg-intensity', value);
        saveState();
    });

    document.getElementById('rightHlColor').addEventListener('input', (e) => {
        document.documentElement.style.setProperty('--right-hl-hue', e.target.value);
        saveState();
    });

    document.getElementById('rightHlIntensity').addEventListener('input', (e) => {
        const value = e.target.value / 100;
        document.documentElement.style.setProperty('--right-hl-intensity', value);
        saveState();
    });

    // Reset buttons
    document.getElementById('leftColorReset').addEventListener('click', () => {
        // Reset left colors to defaults
        document.getElementById('leftBgColor').value = 0;
        document.getElementById('leftBgIntensity').value = 20;
        document.getElementById('leftHlColor').value = 0;
        document.getElementById('leftHlIntensity').value = 40;
        
        // Apply the defaults
        document.documentElement.style.setProperty('--left-bg-hue', 0);
        document.documentElement.style.setProperty('--left-bg-intensity', 0.2);
        document.documentElement.style.setProperty('--left-hl-hue', 0);
        document.documentElement.style.setProperty('--left-hl-intensity', 0.4);
        
        saveState();
    });

    document.getElementById('rightColorReset').addEventListener('click', () => {
        // Reset right colors to defaults
        document.getElementById('rightBgColor').value = 120;
        document.getElementById('rightBgIntensity').value = 20;
        document.getElementById('rightHlColor').value = 120;
        document.getElementById('rightHlIntensity').value = 40;
        
        // Apply the defaults
        document.documentElement.style.setProperty('--right-bg-hue', 120);
        document.documentElement.style.setProperty('--right-bg-intensity', 0.2);
        document.documentElement.style.setProperty('--right-hl-hue', 120);
        document.documentElement.style.setProperty('--right-hl-intensity', 0.4);
        
        saveState();
    });
}

function setupDiffModeControls() {
    const diffModeRadios = document.querySelectorAll('input[name="diffMode"]');
    const fuzzControls = document.getElementById('fuzzControls');
    const fuzzSlider = document.getElementById('fuzzSlider');
    const fuzzValue = document.getElementById('fuzzValue');
    
    diffModeRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            diffMode = e.target.value;
            
            // Show/hide fuzz controls
            if (diffMode === 'fuzzy') {
                fuzzControls.style.display = 'flex';
            } else {
                fuzzControls.style.display = 'none';
            }
            
            // If there's an active comparison, clear it
            if (document.querySelector('.paragraph.deleted, .paragraph.added')) {
                clearComparison();
            }
            saveState();
        });
    });
    
    // Set up fuzz slider
    fuzzSlider.addEventListener('input', (e) => {
        const sliderValue = parseInt(e.target.value); // Raw slider value (0-10)
        const convertedValue = sliderValue / 10; // Convert to 0.0-1.0
        fuzzLevel = convertedValue;
        fuzzValue.textContent = convertedValue.toFixed(1);
        
        // If there's an active comparison in fuzzy mode, clear it to force re-comparison
        if (diffMode === 'fuzzy' && document.querySelector('.paragraph.deleted, .paragraph.added')) {
            clearComparison();
        }
        saveState();
    });
}

async function setupStatusBar() {
    // Set app info
    const appInfo = document.getElementById('appInfo');
    const appData = await window.api.getAppInfo();
    appInfo.textContent = `${appData.name} ${appData.version}`;
    
    // Set and update date/time
    updateDateTime();
    setInterval(updateDateTime, 60000); // Update every minute
}

function updateDateTime() {
    const dateTime = document.getElementById('dateTime');
    const now = new Date();
    
    const options = {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    };
    
    dateTime.textContent = now.toLocaleDateString('en-US', options).replace(',', '').replace(' at', '');
}

function setupCtrlTracking() {
    // Track CTRL key state
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey) {
            ctrlHeld = true;
            document.querySelectorAll('.diff-part').forEach(el => {
                el.classList.add('ctrl-held');
            });
        }
    });
    
    document.addEventListener('keyup', (e) => {
        if (!e.ctrlKey && !e.metaKey) {
            ctrlHeld = false;
            document.querySelectorAll('.diff-part').forEach(el => {
                el.classList.remove('ctrl-held');
            });
        }
    });
    
    // Also clear on window blur to handle case where key is released outside window
    window.addEventListener('blur', () => {
        ctrlHeld = false;
        document.querySelectorAll('.diff-part').forEach(el => {
            el.classList.remove('ctrl-held');
        });
    });
}

function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Handle Ctrl+V for left pane
        if ((e.ctrlKey || e.metaKey) && e.key === 'v' && !e.shiftKey) {
            e.preventDefault();
            pasteFromClipboard('left');
        }
        // Handle Ctrl+Shift+V for right pane
        else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'V') {
            e.preventDefault();
            pasteFromClipboard('right');
        }
        // Handle Ctrl+T for new tab
        else if ((e.ctrlKey || e.metaKey) && e.key === 't' && !e.shiftKey) {
            e.preventDefault();
            // Determine which pane is focused or default to left
            const focusedElement = document.activeElement;
            const leftPane = document.getElementById('leftPane');
            const rightPane = document.getElementById('rightPane');
            
            if (rightPane.contains(focusedElement)) {
                createNewTab('right');
            } else {
                createNewTab('left');
            }
        }
        // Handle Ctrl+W to close current tab
        else if ((e.ctrlKey || e.metaKey) && e.key === 'w' && !e.shiftKey) {
            e.preventDefault();
            // Determine which pane is focused
            const focusedElement = document.activeElement;
            const leftPane = document.getElementById('leftPane');
            const rightPane = document.getElementById('rightPane');
            
            if (rightPane.contains(focusedElement) && activeTab.right) {
                closeTab('right', activeTab.right);
            } else if (leftPane.contains(focusedElement) && activeTab.left) {
                closeTab('left', activeTab.left);
            }
        }
        // Handle Ctrl+Tab / Ctrl+Shift+Tab for tab cycling
        else if ((e.ctrlKey || e.metaKey) && e.key === 'Tab') {
            e.preventDefault();
            const focusedElement = document.activeElement;
            const leftPane = document.getElementById('leftPane');
            const rightPane = document.getElementById('rightPane');
            
            let side = null;
            if (rightPane.contains(focusedElement)) {
                side = 'right';
            } else if (leftPane.contains(focusedElement)) {
                side = 'left';
            }
            
            if (side) {
                const tabs = Array.from(document.querySelectorAll(`#${side}TabsContainer .tab`));
                const currentIndex = tabs.findIndex(tab => tab.classList.contains('active'));
                
                if (currentIndex !== -1) {
                    let newIndex;
                    if (e.shiftKey) {
                        // Previous tab
                        newIndex = currentIndex > 0 ? currentIndex - 1 : tabs.length - 1;
                    } else {
                        // Next tab
                        newIndex = currentIndex < tabs.length - 1 ? currentIndex + 1 : 0;
                    }
                    
                    const newTabId = tabs[newIndex].dataset.tabId;
                    if (newTabId) {
                        switchToTab(side, newTabId);
                    }
                }
            }
        }
    });
}

function saveState() {
    // Save current tab state first
    ['left', 'right'].forEach(side => {
        if (activeTab[side]) {
            saveCurrentTabState(side);
        }
    });
    
    // Convert documents Map to array for serialization
    const documentsArray = {
        left: Array.from(documents.left.entries()).map(([tabId, doc]) => ({
            tabId: tabId,
            content: doc.content,
            filePath: doc.filePath,
            scrollTop: doc.scrollTop,
            selectedParagraphs: Array.from(doc.selectedParagraphs),
            isActive: tabId === activeTab.left,
            isModified: doc.isModified
        })),
        right: Array.from(documents.right.entries()).map(([tabId, doc]) => ({
            tabId: tabId,
            content: doc.content,
            filePath: doc.filePath,
            scrollTop: doc.scrollTop,
            selectedParagraphs: Array.from(doc.selectedParagraphs),
            isActive: tabId === activeTab.right,
            isModified: doc.isModified
        }))
    };
    
    const state = {
        documents: documentsArray,
        activeTab: activeTab,
        diffMode: diffMode,
        fuzzLevel: fuzzLevel,
        zoom: currentZoom,
        colors: {
            leftBgHue: document.getElementById('leftBgColor').value,
            leftBgIntensity: document.getElementById('leftBgIntensity').value,
            leftHlHue: document.getElementById('leftHlColor').value,
            leftHlIntensity: document.getElementById('leftHlIntensity').value,
            rightBgHue: document.getElementById('rightBgColor').value,
            rightBgIntensity: document.getElementById('rightBgIntensity').value,
            rightHlHue: document.getElementById('rightHlColor').value,
            rightHlIntensity: document.getElementById('rightHlIntensity').value
        }
    };
    
    window.api.saveState(state);
}

async function loadSavedState() {
    const state = await window.api.loadState();
    if (!state) return false;

    // Clear existing tabs
    documents.left.clear();
    documents.right.clear();
    document.getElementById('leftTabsContainer').innerHTML = '';
    document.getElementById('rightTabsContainer').innerHTML = '';

    // Restore diff mode
    if (state.diffMode) {
        diffMode = state.diffMode;
        const modeRadio = document.querySelector(`input[name="diffMode"][value="${diffMode}"]`);
        if (modeRadio) {
            modeRadio.checked = true;
        } else {
            // Default to sentence if saved mode doesn't exist
            diffMode = 'sentence';
            document.querySelector(`input[name="diffMode"][value="sentence"]`).checked = true;
        }
        
        // Show/hide fuzz controls
        const fuzzControls = document.getElementById('fuzzControls');
        if (diffMode === 'fuzzy') {
            fuzzControls.style.display = 'flex';
        } else {
            fuzzControls.style.display = 'none';
        }
    }
    
    // Restore fuzz level
    if (state.fuzzLevel !== undefined) {
        fuzzLevel = state.fuzzLevel;
        const fuzzSlider = document.getElementById('fuzzSlider');
        const fuzzValue = document.getElementById('fuzzValue');
        fuzzSlider.value = fuzzLevel * 10;
        fuzzValue.textContent = fuzzLevel.toFixed(1);
    }

    // Restore zoom
    if (state.zoom) {
        currentZoom = state.zoom;
        window.api.setZoom(currentZoom);
        document.getElementById('zoomLevel').textContent = Math.round(currentZoom * 100) + '%';
    }

    // Restore colors
    if (state.colors) {
        const colors = state.colors;
        document.getElementById('leftBgColor').value = colors.leftBgHue;
        document.getElementById('leftBgIntensity').value = colors.leftBgIntensity;
        document.getElementById('leftHlColor').value = colors.leftHlHue;
        document.getElementById('leftHlIntensity').value = colors.leftHlIntensity;
        document.getElementById('rightBgColor').value = colors.rightBgHue;
        document.getElementById('rightBgIntensity').value = colors.rightBgIntensity;
        document.getElementById('rightHlColor').value = colors.rightHlHue;
        document.getElementById('rightHlIntensity').value = colors.rightHlIntensity;

        // Apply color values
        document.documentElement.style.setProperty('--left-bg-hue', colors.leftBgHue);
        document.documentElement.style.setProperty('--left-bg-intensity', colors.leftBgIntensity / 100);
        document.documentElement.style.setProperty('--left-hl-hue', colors.leftHlHue);
        document.documentElement.style.setProperty('--left-hl-intensity', colors.leftHlIntensity / 100);
        document.documentElement.style.setProperty('--right-bg-hue', colors.rightBgHue);
        document.documentElement.style.setProperty('--right-bg-intensity', colors.rightBgIntensity / 100);
        document.documentElement.style.setProperty('--right-hl-hue', colors.rightHlHue);
        document.documentElement.style.setProperty('--right-hl-intensity', colors.rightHlIntensity / 100);
    }

    // Restore documents
    let hasDocuments = false;
    if (state.documents) {
        let leftActiveTabId = null;
        let rightActiveTabId = null;
        
        // Restore left documents
        if (state.documents.left && state.documents.left.length > 0) {
            hasDocuments = true;
            state.documents.left.forEach(docData => {
                const doc = new DocumentState();
                doc.tabId = docData.tabId;
                doc.content = docData.content;
                doc.filePath = docData.filePath;
                doc.scrollTop = docData.scrollTop;
                doc.selectedParagraphs = new Set(docData.selectedParagraphs || []);
                doc.isModified = docData.isModified || false;
                
                documents.left.set(doc.tabId, doc);
                
                // Create tab element
                const tabsContainer = document.getElementById('leftTabsContainer');
                const tabElement = document.createElement('div');
                tabElement.className = 'tab';
                tabElement.dataset.tabId = doc.tabId;
                tabElement.innerHTML = `
                    <span class="tab-title${doc.isModified ? ' modified' : ''}">${escapeHtml(generateTabTitle(doc.filePath))}</span>
                    <button class="tab-close" title="Close tab">×</button>
                `;
                
                // Add event listeners
                tabElement.addEventListener('click', (e) => {
                    if (!e.target.classList.contains('tab-close')) {
                        switchToTab('left', doc.tabId);
                    }
                });
                
                tabElement.querySelector('.tab-close').addEventListener('click', (e) => {
                    e.stopPropagation();
                    closeTab('left', doc.tabId);
                });
                
                tabsContainer.appendChild(tabElement);
                
                if (docData.isActive) {
                    leftActiveTabId = doc.tabId;
                }
            });
        }
        
        // Restore right documents
        if (state.documents.right && state.documents.right.length > 0) {
            hasDocuments = true;
            state.documents.right.forEach(docData => {
                const doc = new DocumentState();
                doc.tabId = docData.tabId;
                doc.content = docData.content;
                doc.filePath = docData.filePath;
                doc.scrollTop = docData.scrollTop;
                doc.selectedParagraphs = new Set(docData.selectedParagraphs || []);
                doc.isModified = docData.isModified || false;
                
                documents.right.set(doc.tabId, doc);
                
                // Create tab element
                const tabsContainer = document.getElementById('rightTabsContainer');
                const tabElement = document.createElement('div');
                tabElement.className = 'tab';
                tabElement.dataset.tabId = doc.tabId;
                tabElement.innerHTML = `
                    <span class="tab-title${doc.isModified ? ' modified' : ''}">${escapeHtml(generateTabTitle(doc.filePath))}</span>
                    <button class="tab-close" title="Close tab">×</button>
                `;
                
                // Add event listeners
                tabElement.addEventListener('click', (e) => {
                    if (!e.target.classList.contains('tab-close')) {
                        switchToTab('right', doc.tabId);
                    }
                });
                
                tabElement.querySelector('.tab-close').addEventListener('click', (e) => {
                    e.stopPropagation();
                    closeTab('right', doc.tabId);
                });
                
                tabsContainer.appendChild(tabElement);
                
                if (docData.isActive) {
                    rightActiveTabId = doc.tabId;
                }
            });
        }
        
        // Restore active tabs
        if (leftActiveTabId) {
            switchToTab('left', leftActiveTabId);
        } else if (documents.left.size === 0) {
            // Create empty tab if no documents
            createNewTab('left');
        }
        
        if (rightActiveTabId) {
            switchToTab('right', rightActiveTabId);
        } else if (documents.right.size === 0) {
            // Create empty tab if no documents
            createNewTab('right');
        }
    } else {
        // Legacy single-document support
        if (state.leftFile && state.leftFile.content) {
            hasDocuments = true;
            const tabId = createNewTab('left', state.leftFile.content, state.leftFile.path);
            if (tabId) {
                const doc = documents.left.get(tabId);
                if (doc) {
                    doc.scrollTop = state.leftFile.scrollTop;
                }
            }
        }

        if (state.rightFile && state.rightFile.content) {
            hasDocuments = true;
            const tabId = createNewTab('right', state.rightFile.content, state.rightFile.path);
            if (tabId) {
                const doc = documents.right.get(tabId);
                if (doc) {
                    doc.scrollTop = state.rightFile.scrollTop;
                }
            }
        }
    }
    
    return true; // State was loaded
}