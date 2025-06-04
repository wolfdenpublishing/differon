// Custom tooltip system for scalable tooltips
let customTooltip = null;
let tooltipTimeout = null;

function showCustomTooltip(element, text) {
    hideCustomTooltip();
    
    customTooltip = document.createElement('div');
    customTooltip.className = 'custom-tooltip';
    customTooltip.textContent = text;
    document.body.appendChild(customTooltip);
    
    const rect = element.getBoundingClientRect();
    customTooltip.style.left = rect.left + (rect.width / 2) + 'px';
    customTooltip.style.top = (rect.top - 10) + 'px';
    
    // Position tooltip with boundary checking
    setTimeout(() => {
        const tooltipRect = customTooltip.getBoundingClientRect();
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        
        // Calculate ideal position (centered above element)
        let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
        let top = rect.top - tooltipRect.height - 8;
        
        // Check right boundary
        if (left + tooltipRect.width > windowWidth - 5) {
            left = windowWidth - tooltipRect.width - 5;
        }
        
        // Check left boundary
        if (left < 5) {
            left = 5;
        }
        
        // Check top boundary (if tooltip would go above window, show below instead)
        if (top < 5) {
            top = rect.bottom + 8;
        }
        
        // Check bottom boundary (shouldn't happen often, but just in case)
        if (top + tooltipRect.height > windowHeight - 5) {
            top = windowHeight - tooltipRect.height - 5;
        }
        
        customTooltip.style.left = left + 'px';
        customTooltip.style.top = top + 'px';
        customTooltip.classList.add('visible');
    }, 0);
}

function hideCustomTooltip() {
    if (customTooltip) {
        customTooltip.remove();
        customTooltip = null;
    }
    if (tooltipTimeout) {
        clearTimeout(tooltipTimeout);
        tooltipTimeout = null;
    }
}

function addCustomTooltip(element, text) {
    // Store the original title as custom tooltip text
    if (!text && element.hasAttribute('title')) {
        text = element.getAttribute('title');
        element.setAttribute('data-tooltip', text);
        element.removeAttribute('title');
    }
    
    element.addEventListener('mouseenter', () => {
        const tooltipText = text || element.getAttribute('data-tooltip');
        if (tooltipText) {
            tooltipTimeout = setTimeout(() => {
                showCustomTooltip(element, tooltipText);
            }, 500); // Show after 500ms hover
        }
    });
    
    element.addEventListener('mouseleave', hideCustomTooltip);
    element.addEventListener('mousedown', hideCustomTooltip);
}

// Function to convert all title attributes to custom tooltips
function convertAllTooltips() {
    // Convert all elements with title attribute
    document.querySelectorAll('[title]').forEach(element => {
        addCustomTooltip(element);
    });
    
    // Monitor for new elements with title attributes
    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === 1) { // Element node
                    if (node.hasAttribute && node.hasAttribute('title')) {
                        addCustomTooltip(node);
                    }
                    // Check children too
                    if (node.querySelectorAll) {
                        node.querySelectorAll('[title]').forEach(element => {
                            addCustomTooltip(element);
                        });
                    }
                }
            });
        });
    });
    
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

// Document state management
class DocumentState {
    constructor() {
        this.content = '';
        this.filePath = '';
        this.scrollTop = 0;
        this.selectedParagraphs = new Set();
        this.tabId = 'tab-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        this.isModified = false;
        this.pastedTimestamp = null; // Store timestamp for pasted documents
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

// Toolbar scaling manager to prevent control overflow at high zoom levels
class ToolbarScaler {
    constructor() {
        this.toolbars = new Map();
        this.resizeObserver = null;
        this.checkTimeout = null;
        this.MIN_SCALE = 0.7;
        this.BUFFER_FACTOR = 0.95; // Less aggressive buffer for tighter fit
    }
    
    init() {
        // Set up observers for both toolbars
        this.observeToolbar('left');
        this.observeToolbar('right');
        
        // Set up global resize observer
        this.setupResizeObserver();
        
        // Initial check
        this.checkAllToolbars();
    }
    
    observeToolbar(side) {
        const wrapper = document.querySelector(`#${side}Pane .pane-controls-wrapper`);
        if (wrapper) {
            this.toolbars.set(side, wrapper);
        }
    }
    
    setupResizeObserver() {
        this.resizeObserver = new ResizeObserver(() => {
            // Debounce resize events
            clearTimeout(this.checkTimeout);
            this.checkTimeout = setTimeout(() => {
                this.checkAllToolbars();
            }, 100);
        });
        
        // Observe the main container for size changes
        const container = document.querySelector('.container');
        if (container) {
            this.resizeObserver.observe(container);
        }
    }
    
    checkAllToolbars() {
        for (const [side, toolbar] of this.toolbars) {
            this.checkAndScale(side);
        }
    }
    
    checkAndScale(side) {
        const toolbar = this.toolbars.get(side);
        if (!toolbar) return;
        
        const scale = this.calculateScale(toolbar);
        this.applyScale(toolbar, scale);
    }
    
    calculateScale(wrapper) {
        // Get the parent pane-controls width
        const container = wrapper.parentElement;
        if (!container) return 1.0;
        
        // Account for padding in the container
        const containerPadding = 36; // 16px padding + 2px buffer on each side
        const availableWidth = container.clientWidth - containerPadding;
        
        // Get the natural width of all controls
        // Remove any existing transform to measure natural size
        const currentTransform = wrapper.style.transform;
        wrapper.style.transform = '';
        
        const controlsWidth = wrapper.scrollWidth;
        
        // Restore transform
        wrapper.style.transform = currentTransform;
        
        // Calculate scale needed to fit
        if (controlsWidth > availableWidth) {
            // Calculate scale with buffer
            const scale = (availableWidth / controlsWidth) * this.BUFFER_FACTOR;
            // Enforce minimum scale
            return Math.max(scale, this.MIN_SCALE);
        }
        
        return 1.0; // No scaling needed
    }
    
    applyScale(wrapper, scale) {
        if (scale < 1.0) {
            // Apply transform origin to keep controls left-aligned
            wrapper.style.transformOrigin = 'left center';
            wrapper.style.transform = `scale(${scale})`;
        } else {
            // Reset to normal
            wrapper.style.transform = '';
            wrapper.style.transformOrigin = '';
        }
    }
    
    destroy() {
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }
        clearTimeout(this.checkTimeout);
    }
}

// Create global instance
const toolbarScaler = new ToolbarScaler();

// Global settings and state
let currentZoom = 1.0;
let appConfig = null;

// Paragraph matching settings
let paragraphMatchingEnabled = true;
let paragraphAlgorithm = 'thomas';  // 'thomas' or 'patience'
let paragraphFuzziness = 0.0;  // 0.0-1.0

// Sentence matching settings
let sentenceMatchingEnabled = true;
let sentenceAlgorithm = 'thomas';  // 'thomas', 'levenshtein', 'character'
let sentenceFuzziness = 0.0;  // 0.0-1.0

// Strikethrough setting (left side only)
let strikethroughEnabled = true;  // Default enabled

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

// Store character diff pairs
let characterDiffPairs = [];

// Track if CTRL is held
let ctrlHeld = false;

// Store change bar data for paragraphs
let paragraphChangeBars = {
    left: new Map(),
    right: new Map()
};

// Maximum number of tabs per side
const MAX_TABS = 20;

// Tab management functions
function generateTabTitle(filePath) {
    if (!filePath) return '(empty)';
    if (filePath.startsWith('Pasted at ')) return filePath;
    const parts = filePath.split(/[/\\]/);
    return parts[parts.length - 1] || '(empty)';
}

async function createNewTab(side, content = '', filePath = '') {
    if (documents[side].size >= MAX_TABS) {
        await showInfo(`Maximum number of tabs (${MAX_TABS}) reached.`, 'Tab Limit');
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
    tabElement.draggable = true;
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
    
    // Add drag and drop functionality
    setupTabDragAndDrop(tabElement, side);
    
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
            // Automatic paragraph diff removed - now handled by Compare button
            // runParagraphDiff();
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
            doc.pastedTimestamp = null; // Clear timestamp too
            displayDocument(side, doc);
            updateTabTitle(side, tabId, '(empty)', false); // Update tab title
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

async function moveTabToOtherSide(fromSide) {
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
        
        // Update tab title to reflect cleared state
        updateTabTitle(fromSide, doc.tabId, '(empty)', false);
        
        // Create new tab on the other side
        const toSide = fromSide === 'left' ? 'right' : 'left';
        
        // Check if the destination side has only a single empty tab
        let singleEmptyTabId = null;
        if (documents[toSide].size === 1) {
            const [tabId, doc] = documents[toSide].entries().next().value;
            if (!doc.content && !doc.filePath) {
                singleEmptyTabId = tabId;
            }
        }
        
        const newTabId = await createNewTab(toSide, content, filePath);
        
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
            
            // If destination had a single empty tab, close it
            if (singleEmptyTabId) {
                closeTab(toSide, singleEmptyTabId);
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
        
        // Check if the destination side has only a single empty tab
        let singleEmptyTabId = null;
        if (documents[toSide].size === 1) {
            const [tabId, doc] = documents[toSide].entries().next().value;
            if (!doc.content && !doc.filePath) {
                singleEmptyTabId = tabId;
            }
        }
        
        const newTabId = await createNewTab(toSide, content, filePath);
        
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
            
            // If destination had a single empty tab, close it
            if (singleEmptyTabId) {
                closeTab(toSide, singleEmptyTabId);
            }
        }
    }
    
    // Clear any comparison since documents have changed sides
    clearComparison();
    
    // Re-run paragraph diff if both sides have content
    const leftDoc = getActiveDocument('left');
    const rightDoc = getActiveDocument('right');
    if (leftDoc && leftDoc.content && rightDoc && rightDoc.content) {
        // Automatic paragraph diff removed - now handled by Compare button
        // runParagraphDiff();
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

// Tab drag and drop functionality
let draggedTab = null;
let draggedSide = null;

function setupTabDragAndDrop(tabElement, side) {
    tabElement.addEventListener('dragstart', (e) => {
        draggedTab = tabElement;
        draggedSide = side;
        tabElement.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
    });
    
    tabElement.addEventListener('dragend', (e) => {
        tabElement.classList.remove('dragging');
        // Clean up any drag-over indicators
        document.querySelectorAll('.tab').forEach(tab => {
            tab.classList.remove('drag-over-left', 'drag-over-right');
        });
        draggedTab = null;
        draggedSide = null;
    });
    
    tabElement.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (!draggedTab || draggedSide !== side || draggedTab === tabElement) return;
        
        const rect = tabElement.getBoundingClientRect();
        const midpoint = rect.left + rect.width / 2;
        
        // Remove other indicators
        document.querySelectorAll(`#${side}TabsContainer .tab`).forEach(tab => {
            if (tab !== tabElement) {
                tab.classList.remove('drag-over-left', 'drag-over-right');
            }
        });
        
        if (e.clientX < midpoint) {
            tabElement.classList.add('drag-over-left');
            tabElement.classList.remove('drag-over-right');
        } else {
            tabElement.classList.add('drag-over-right');
            tabElement.classList.remove('drag-over-left');
        }
    });
    
    tabElement.addEventListener('dragleave', (e) => {
        tabElement.classList.remove('drag-over-left', 'drag-over-right');
    });
    
    tabElement.addEventListener('drop', (e) => {
        e.preventDefault();
        if (!draggedTab || draggedSide !== side || draggedTab === tabElement) return;
        
        const rect = tabElement.getBoundingClientRect();
        const midpoint = rect.left + rect.width / 2;
        const insertBefore = e.clientX < midpoint;
        
        const container = document.getElementById(`${side}TabsContainer`);
        
        if (insertBefore) {
            container.insertBefore(draggedTab, tabElement);
        } else {
            container.insertBefore(draggedTab, tabElement.nextSibling);
        }
        
        tabElement.classList.remove('drag-over-left', 'drag-over-right');
        
        // Save the new tab order
        saveState();
    });
}

// Initialize event listeners
document.addEventListener('DOMContentLoaded', async () => {
    // Check if API is available
    if (!window.api) {
        console.error('Electron API not available. Make sure preload script is loaded correctly.');
        return;
    }
    
    // Override console methods to log to stdout
    const originalConsole = {
        log: console.log,
        warn: console.warn,
        error: console.error
    };
    
    // Helper to serialize objects for IPC
    const serializeForIPC = (obj) => {
        try {
            // Try to clone the object to test if it's serializable
            structuredClone(obj);
            return obj;
        } catch (e) {
            // If not serializable, convert to string representation
            if (obj instanceof Element) {
                return `[DOM Element: ${obj.tagName}${obj.id ? '#' + obj.id : ''}${obj.className ? '.' + obj.className : ''}]`;
            } else if (obj instanceof Event) {
                return `[Event: ${obj.type} on ${obj.target?.tagName || 'unknown'}]`;
            } else if (typeof obj === 'object' && obj !== null) {
                // For other objects, create a safe representation
                try {
                    const safeObj = {};
                    for (const key in obj) {
                        if (obj.hasOwnProperty(key)) {
                            const value = obj[key];
                            if (value instanceof Element) {
                                safeObj[key] = `[DOM Element: ${value.tagName}]`;
                            } else if (value instanceof Event) {
                                safeObj[key] = `[Event: ${value.type}]`;
                            } else if (typeof value === 'function') {
                                safeObj[key] = '[Function]';
                            } else {
                                try {
                                    structuredClone(value);
                                    safeObj[key] = value;
                                } catch {
                                    safeObj[key] = String(value);
                                }
                            }
                        }
                    }
                    return safeObj;
                } catch {
                    return String(obj);
                }
            }
            return obj;
        }
    };
    
    console.log = (...args) => {
        originalConsole.log(...args);  // Still log to DevTools
        const serializedArgs = args.map(serializeForIPC);
        window.api.consoleLog(...serializedArgs);  // Log serialized version to stdout
    };
    
    console.warn = (...args) => {
        originalConsole.warn(...args);
        const serializedArgs = args.map(serializeForIPC);
        window.api.consoleWarn(...serializedArgs);
    };
    
    console.error = (...args) => {
        originalConsole.error(...args);
        const serializedArgs = args.map(serializeForIPC);
        window.api.consoleError(...serializedArgs);
    };
    
    // Convert all native tooltips to custom scalable tooltips
    convertAllTooltips();
    
    // Icons don't need tooltips - removed due to visual conflicts
    
    // Load configuration
    try {
        appConfig = await window.api.getConfig();
    } catch (error) {
        // Failed to load config, using defaults
        appConfig = {
            fuzzySentenceMatching: {
                minMatchPercent: 10,
                maxMatchPercent: 100
            },
            fuzzyParagraphMatching: {
                minMatchPercent: 30,
                maxMatchPercent: 100
            }
        };
    }
    
    // Apply min/max values from config to intensity sliders
    const bgIntensityMin = appConfig?.colors?.bgIntensityMin ?? 5;
    const bgIntensityMax = appConfig?.colors?.bgIntensityMax ?? 40;
    const hlIntensityMin = appConfig?.colors?.hlIntensityMin ?? 20;
    const hlIntensityMax = appConfig?.colors?.hlIntensityMax ?? 60;
    
    // Set min/max for background intensity sliders
    document.getElementById('leftBgIntensity').min = bgIntensityMin;
    document.getElementById('leftBgIntensity').max = bgIntensityMax;
    document.getElementById('rightBgIntensity').min = bgIntensityMin;
    document.getElementById('rightBgIntensity').max = bgIntensityMax;
    
    // Set min/max for highlight intensity sliders
    document.getElementById('leftHlIntensity').min = hlIntensityMin;
    document.getElementById('leftHlIntensity').max = hlIntensityMax;
    document.getElementById('rightHlIntensity').min = hlIntensityMin;
    document.getElementById('rightHlIntensity').max = hlIntensityMax;
    
    // Set up all UI components first
    setupDropZones();
    setupButtons();
    setupFileOpenListener();
    setupPasteListener();
    setupZoomControls();
    setupColorControls();
    setupStrikethroughControl();
    await populateAlgorithms();
    setupDiffModeControls();
    setupCopyTooltip();
    setupSelectAllControls();
    setupStatusBar();
    setupCtrlTracking();
    setupKeyboardShortcuts();
    setupTabControls();
    
    // Initialize toolbar scaling
    toolbarScaler.init();
    
    // Add copy event listener to deselect text after copy
    document.addEventListener('copy', (e) => {
        // Clear selection after copy
        setTimeout(() => {
            window.getSelection().removeAllRanges();
        }, 10);
    });
    
    // Load saved state or create default tabs
    window.api.onRestoreState(async () => {
        const loaded = await loadSavedState();
        // If no state was loaded, create default empty tabs
        if (!loaded) {
            await createNewTab('left');
            await createNewTab('right');
        }
    });
    
    // Also attempt to load state immediately in case the event doesn't fire
    setTimeout(async () => {
        // Only load if we haven't already (no tabs exist)
        if (documents.left.size === 0 && documents.right.size === 0) {
            const loaded = await loadSavedState();
            if (!loaded) {
                await createNewTab('left');
                await createNewTab('right');
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
    document.getElementById('leftNewTab').addEventListener('click', async () => {
        await createNewTab('left');
    });
    
    document.getElementById('rightNewTab').addEventListener('click', async () => {
        await createNewTab('right');
    });
    
    // Move tab buttons
    document.getElementById('leftMoveTab').addEventListener('click', async () => {
        await moveTabToOtherSide('left');
    });
    
    document.getElementById('rightMoveTab').addEventListener('click', async () => {
        await moveTabToOtherSide('right');
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
    document.getElementById('leftPasteBtn').addEventListener('click', async () => await pasteFromClipboard('left'));
    document.getElementById('rightPasteBtn').addEventListener('click', async () => await pasteFromClipboard('right'));
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
                // Automatic paragraph diff removed - now handled by Compare button
                // await runParagraphDiff();
            }
            
            saveState();
        }
    } else {
        await showInfo(`Error reading file: ${result.error}`, 'File Error');
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
        doc.pastedTimestamp = timestamp; // Store timestamp for tooltip
        updateTabTitle(side, doc.tabId, filename, false);
        displayDocument(side, doc);
        
        // Run paragraph diff if both files are loaded
        const leftDoc = getActiveDocument('left');
        const rightDoc = getActiveDocument('right');
        if (leftDoc && leftDoc.content && rightDoc && rightDoc.content) {
            // Automatic paragraph diff removed - now handled by Compare button
            // runParagraphDiff();
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
                    // Store both indices as data attributes
                    leftParagraphElement.dataset.paragraphIndex = leftIdx;
                    leftParagraphElement.dataset.matchedIndex = rightIdx;
                    
                    // Remove any existing click handlers first
                    const newLeftElement = leftParagraphElement.cloneNode(true);
                    leftParagraphElement.parentNode.replaceChild(newLeftElement, leftParagraphElement);
                    
                    // Add custom tooltip
                    addCustomTooltip(newLeftElement, 'Click to sync with matching paragraph');
                    
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
                    // Store both indices as data attributes
                    rightParagraphElement.dataset.paragraphIndex = rightIdx;
                    rightParagraphElement.dataset.matchedIndex = leftIdx;
                    
                    // Remove any existing click handlers first
                    const newRightElement = rightParagraphElement.cloneNode(true);
                    rightParagraphElement.parentNode.replaceChild(newRightElement, rightParagraphElement);
                    
                    // Add custom tooltip
                    addCustomTooltip(newRightElement, 'Click to sync with matching paragraph');
                    
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

// Add clickable change bar to fuzzy matched paragraph
function addChangeBar(paragraphElement, side, matchData) {
    // Store change bar data for this paragraph
    paragraphChangeBars[side].set(matchData.fromIndex, matchData);
    
    // Remove any existing change bar
    const existingBar = paragraphElement.querySelector('.change-bar');
    if (existingBar) {
        existingBar.remove();
    }
    
    // Create change bar element
    const changeBar = document.createElement('div');
    changeBar.className = 'change-bar';
    changeBar.dataset.side = side;
    changeBar.dataset.paragraphIndex = matchData.fromIndex;
    changeBar.dataset.matchedIndex = matchData.toIndex;
    changeBar.dataset.similarity = matchData.similarity;
    
    // Apply the same alpha value as the paragraph
    changeBar.style.setProperty('--paragraph-match-alpha', matchData.similarity);
    
    // Add tooltip
    const tooltipText = `Fuzzy match (${Math.round(matchData.similarity * 100)}% similar) - Click to sync`;
    addCustomTooltip(changeBar, tooltipText);
    
    // Add click handler
    changeBar.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        const idx = parseInt(this.dataset.paragraphIndex);
        if (!isNaN(idx)) {
            scrollToMatchingParagraph(side, idx);
        }
    });
    
    // Add to paragraph
    paragraphElement.style.position = 'relative';
    paragraphElement.appendChild(changeBar);
}

// Restore change bar after innerHTML is replaced
function restoreChangeBar(paragraphElement, side, paragraphIndex) {
    const changeBarData = paragraphChangeBars[side].get(paragraphIndex);
    if (changeBarData) {
        addChangeBar(paragraphElement, side, changeBarData);
    }
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
        const allMatchedSentences = document.querySelectorAll('.sentence-matched, .fuzzy-matched-sentence, .character-diff-sentence');
        
        
        let targetElement = null;
        // Find the element with the correct side
        for (const el of allMatchedSentences) {
            if (el.dataset.sentenceKey === targetKey && el.dataset.side === targetSide) {
                targetElement = el;
                break;
            }
        }
        
        // If no element found with correct side, fall back to first occurrence
        if (!targetElement) {
            // Fall back to first occurrence (old behavior)
            for (const el of allMatchedSentences) {
                if (el.dataset.sentenceKey === targetKey) {
                    targetElement = el;
                    break;
                }
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
    // Clear stored change bar data
    paragraphChangeBars.left.clear();
    paragraphChangeBars.right.clear();
    
    // Remove all change bar elements
    document.querySelectorAll('.change-bar').forEach(bar => bar.remove());
    
    document.querySelectorAll('.paragraph-changed').forEach(el => {
        el.classList.remove('paragraph-changed', 'paragraph-deleted', 'paragraph-added');
    });
    document.querySelectorAll('.paragraph-matched').forEach(el => {
        el.classList.remove('paragraph-matched', 'paragraph-fuzzy-matched');
        el.style.cursor = '';
        el.title = '';
        // Remove the alpha CSS variable for fuzzy matches
        el.style.removeProperty('--paragraph-match-alpha');
        // Remove all click event listeners
        const newEl = el.cloneNode(true);
        if (el.parentNode) {
            el.parentNode.replaceChild(newEl, el);
        }
    });
    // Also clear fuzzy matched paragraphs that might not have paragraph-matched class
    document.querySelectorAll('.paragraph-fuzzy-matched').forEach(el => {
        el.classList.remove('paragraph-fuzzy-matched');
        el.style.removeProperty('--paragraph-match-alpha');
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
    
    // Apply paragraph backgrounds after restoring checkboxes
    applyParagraphBackgrounds();
}

function displayFile(side, content, filePath) {
    const dropZone = document.getElementById(`${side}Drop`);
    const editor = document.getElementById(`${side}Editor`);
    let pathElement = document.getElementById(`${side}Path`);
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
    
    // Update document name and icon
    const iconElement = document.getElementById(`${side}DocIcon`);
    const isPasted = doc.pastedTimestamp !== null; // Check for pastedTimestamp instead of filename
    
    // Remove all existing event listeners by cloning the path element
    const newPathElement = pathElement.cloneNode(true);
    pathElement.parentNode.replaceChild(newPathElement, pathElement);
    pathElement = newPathElement;
    
    pathElement.textContent = filePath;
    
    // Set up icon
    if (filePath) {
        iconElement.style.display = '';
        if (isPasted) {
            iconElement.src = 'icons/fluent--clipboard-text-ltr-16-regular.svg';
            // Check if this is a renamed pasted document
            const timestamp = doc.pastedTimestamp || (filePath.startsWith('Pasted at ') ? filePath.substring(10) : '');
            
            // Remove tooltip - visual conflict with tab titles
            iconElement.removeAttribute('data-tooltip');
            
            // Make pasted document names editable
            pathElement.classList.add('editable');
            pathElement.contentEditable = 'true';
            
            // Save changes when editing finishes
            pathElement.addEventListener('blur', () => {
                const newName = pathElement.textContent.trim();
                if (newName && newName !== doc.filePath) {
                    doc.filePath = newName;
                    updateTabTitle(side, doc.tabId, generateTabTitle(newName), doc.isModified);
                    saveState();
                } else if (!newName) {
                    // Restore original name if empty
                    pathElement.textContent = doc.filePath;
                }
            });
            
            // Handle Enter key to finish editing
            pathElement.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    pathElement.blur();
                }
            });
            
            // Select all text when editing starts
            pathElement.addEventListener('focus', () => {
                const range = document.createRange();
                range.selectNodeContents(pathElement);
                const selection = window.getSelection();
                selection.removeAllRanges();
                selection.addRange(range);
            });
        } else {
            iconElement.src = 'icons/fluent--document-text-16-regular.svg';
            // Remove tooltip - visual conflict with tab titles
            iconElement.removeAttribute('data-tooltip');
            
            // File names are not editable
            pathElement.classList.remove('editable');
            pathElement.contentEditable = 'false';
        }
    } else {
        iconElement.style.display = 'none';
        pathElement.classList.remove('editable');
        pathElement.contentEditable = 'false';
        // Clear tooltip when no file
        iconElement.removeAttribute('data-tooltip');
    }

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
        
        // Add checkbox event listeners for immediate background coloring
        const checkboxes = paragraphNumbersElement.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            // Store shift key state on click for use in change handler
            let wasShiftPressed = false;
            
            // Capture shift key state on click event
            checkbox.addEventListener('click', (e) => {
                wasShiftPressed = e.shiftKey;
            });
            
            // Handle checkbox state change
            checkbox.addEventListener('change', (e) => {
                if (wasShiftPressed && checkbox.checked) {
                    // Shift+Click: Select range between this and nearest selected paragraphs
                    const currentIndex = parseInt(checkbox.dataset.paragraph);
                    const allCheckboxes = Array.from(paragraphNumbersElement.querySelectorAll('input[type="checkbox"]'));
                    
                    // Find all currently checked paragraphs (excluding the current one)
                    const checkedIndices = [];
                    allCheckboxes.forEach(cb => {
                        const idx = parseInt(cb.dataset.paragraph);
                        if (cb.checked && idx !== currentIndex) {
                            checkedIndices.push(idx);
                        }
                    });
                    
                    if (checkedIndices.length > 0) {
                        // Search backward for nearest selected paragraph
                        let backwardNearest = -1;
                        for (let i = currentIndex - 1; i >= 0; i--) {
                            if (checkedIndices.includes(i)) {
                                backwardNearest = i;
                                break;
                            }
                        }
                        
                        // Search forward for nearest selected paragraph
                        let forwardNearest = -1;
                        const maxIndex = allCheckboxes.length - 1;
                        for (let i = currentIndex + 1; i <= maxIndex; i++) {
                            if (checkedIndices.includes(i)) {
                                forwardNearest = i;
                                break;
                            }
                        }
                        
                        // Select all paragraphs in the backward range
                        if (backwardNearest >= 0) {
                            for (let i = backwardNearest + 1; i < currentIndex; i++) {
                                const cb = document.getElementById(`${side}-paragraph-${i}`);
                                if (cb) cb.checked = true;
                            }
                        }
                        
                        // Select all paragraphs in the forward range
                        if (forwardNearest >= 0) {
                            for (let i = currentIndex + 1; i < forwardNearest; i++) {
                                const cb = document.getElementById(`${side}-paragraph-${i}`);
                                if (cb) cb.checked = true;
                            }
                        }
                    }
                }
                
                // Reset shift state
                wasShiftPressed = false;
                
                // Always apply backgrounds based on checkbox state
                applyParagraphBackgrounds();
            });
            
            // Right-click for exclusive selection
            checkbox.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                
                // Deselect all other checkboxes on this side
                const allCheckboxes = paragraphNumbersElement.querySelectorAll('input[type="checkbox"]');
                allCheckboxes.forEach(cb => {
                    cb.checked = (cb === checkbox);
                });
                
                // Apply backgrounds based on new state
                applyParagraphBackgrounds();
            });
        });
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
        
        // Always apply backgrounds based on checkbox state
        applyParagraphBackgrounds();
    });

    document.getElementById('rightSelectAll').addEventListener('change', (e) => {
        const checkboxes = document.querySelectorAll('#rightParagraphNumbers input[type="checkbox"]');
        checkboxes.forEach(cb => cb.checked = e.target.checked);
        
        // Always apply backgrounds based on checkbox state
        applyParagraphBackgrounds();
    });
}

function setupStrikethroughControl() {
    const checkbox = document.getElementById('leftStrikethrough');
    const leftContent = document.getElementById('leftContent');
    
    // Set initial state
    checkbox.checked = strikethroughEnabled;
    if (strikethroughEnabled) {
        leftContent.classList.add('strikethrough-enabled');
    }
    
    // Add event listener
    checkbox.addEventListener('change', (e) => {
        strikethroughEnabled = e.target.checked;
        
        // Toggle class on left content container
        if (strikethroughEnabled) {
            leftContent.classList.add('strikethrough-enabled');
        } else {
            leftContent.classList.remove('strikethrough-enabled');
        }
        
        saveState();
    });
}


function clearAll() {
    // Clear highlighting
    clearComparison();
    
    // Clear paragraph markers (change bars)
    clearParagraphMarkers();
    
    // Uncheck only paragraph selection checkboxes (not algorithm checkboxes)
    document.querySelectorAll('.paragraph-number input[type="checkbox"]').forEach(cb => {
        cb.checked = false;
    });
    
    // Also uncheck select all checkboxes
    document.getElementById('leftSelectAll').checked = false;
    document.getElementById('rightSelectAll').checked = false;
    
    // Remove paragraph backgrounds
    removeParagraphBackgrounds();
}

async function performComparison() {
    
    const leftDoc = getActiveDocument('left');
    const rightDoc = getActiveDocument('right');
    
    if (!leftDoc || !rightDoc || !leftDoc.content || !rightDoc.content) {
        await showInfo('Please load both files before comparing.', 'Missing Files');
        return;
    }

    // Get selected paragraphs
    const leftSelectedParagraphs = getSelectedParagraphs('left');
    const rightSelectedParagraphs = getSelectedParagraphs('right');

    if (leftSelectedParagraphs.length === 0 || rightSelectedParagraphs.length === 0) {
        await showInfo('Please select paragraphs to compare in both documents.', 'No Selection');
        return;
    }

    // Show progress dialog
    const progressDialog = showProgressDialog({
        message: 'Compare algorithms processing... please wait.'
    });

    try {
        // Clear previous comparison highlights (but keep backgrounds)
        clearComparison();
        
        // Reapply paragraph backgrounds after clearing
        applyParagraphBackgrounds();
        
        // Initialize current sentences and fuzzy pairs
        currentSentences = { left: new Map(), right: new Map() };
        fuzzyMatchedPairs = [];
        characterDiffPairs = [];

        // Get content of selected paragraphs (handle different line endings)
        const leftParagraphs = leftDoc.content.split(/\r\n|\r|\n/);
        const rightParagraphs = rightDoc.content.split(/\r\n|\r|\n/);

        const leftSelectedContent = leftSelectedParagraphs.map(i => leftParagraphs[i] || '').join('\n');
        const rightSelectedContent = rightSelectedParagraphs.map(i => rightParagraphs[i] || '').join('\n');
        
        let paragraphResult = null;
        let sentenceResult = null;
        
        // Step 1: Run paragraph-level matching if enabled
        if (paragraphMatchingEnabled) {
            const paragraphMinMatch = appConfig?.fuzzyParagraphMatching?.minMatchPercent || 30;
            const paragraphMaxMatch = appConfig?.fuzzyParagraphMatching?.maxMatchPercent || 100;
            const paragraphMatchThreshold = (paragraphMaxMatch - (paragraphFuzziness * (paragraphMaxMatch - paragraphMinMatch))) / 100;
            
            // Call modular paragraph matching API
            try {
                const options = {
                    fuzziness: paragraphFuzziness,
                    minMatch: paragraphMinMatch / 100,
                    maxMatch: paragraphMaxMatch / 100
                };
                const result = await window.api.diffParagraphModular(
                    leftDoc.content,
                    rightDoc.content,
                    paragraphAlgorithm,
                    options
                );
                paragraphResult = result.matches || result;
            } catch (error) {
                // Fallback to legacy API
                if (paragraphAlgorithm === 'thomas') {
                    paragraphResult = await window.api.matchParagraphsThomas(leftDoc.content, rightDoc.content, paragraphMatchThreshold);
                } else if (paragraphAlgorithm === 'patience') {
                    paragraphResult = await window.api.matchParagraphsPatience(leftDoc.content, rightDoc.content, paragraphMatchThreshold);
                }
            }
            
            // Apply change bars based on paragraph result
            applyParagraphChangeBars(paragraphResult, leftSelectedParagraphs, rightSelectedParagraphs, paragraphFuzziness > 0.01);
        }
        
        // Step 2: Run sentence-level matching if enabled
        if (sentenceMatchingEnabled) {
            const sentenceMinMatch = appConfig?.fuzzySentenceMatching?.minMatchPercent || 10;
            const sentenceMaxMatch = appConfig?.fuzzySentenceMatching?.maxMatchPercent || 100;
            const sentenceMatchThreshold = (sentenceMaxMatch - (sentenceFuzziness * (sentenceMaxMatch - sentenceMinMatch))) / 100;
            
            let diff;
            
            // Determine which paragraphs to process at sentence level
            let paragraphsToProcess = {
                left: leftSelectedParagraphs,
                right: rightSelectedParagraphs
            };
            
            if (paragraphMatchingEnabled && paragraphResult) {
                // Filter out exact matched paragraphs from sentence processing
                const exactMatchedLeft = new Set();
                const exactMatchedRight = new Set();
                
                // Collect all exact matched paragraph indices
                if (paragraphResult.exactMatches) {
                    paragraphResult.exactMatches.forEach(match => {
                        exactMatchedLeft.add(match.left);
                        exactMatchedRight.add(match.right);
                    });
                }
                
                // Filter out exact matched paragraphs
                paragraphsToProcess.left = leftSelectedParagraphs.filter(idx => !exactMatchedLeft.has(idx));
                paragraphsToProcess.right = rightSelectedParagraphs.filter(idx => !exactMatchedRight.has(idx));
            }
            
            // Call modular sentence matching API
            try {
                const options = {
                    fuzziness: sentenceFuzziness,
                    minMatch: sentenceMinMatch / 100,
                    maxMatch: sentenceMaxMatch / 100,
                    leftSelectedParagraphs: paragraphsToProcess.left,
                    rightSelectedParagraphs: paragraphsToProcess.right,
                    leftFullParagraphs: leftDoc.content.split(/\r\n|\r|\n/),
                    rightFullParagraphs: rightDoc.content.split(/\r\n|\r|\n/)
                };
                
                const result = await window.api.diffSentenceModular(
                    leftSelectedContent,
                    rightSelectedContent,
                    sentenceAlgorithm,
                    options
                );
                
                diff = result.diff;
                matchedSentences = result.matchedSentences || result.matches;
                currentSentences = result.sentenceInfo || { left: new Map(), right: new Map() };
                fuzzyMatchedPairs = result.fuzzyMatchedPairs || [];
                characterDiffPairs = result.characterDiffPairs || [];
            } catch (error) {
                // Fallback to legacy API
                switch (sentenceAlgorithm) {
                    case 'thomas':
                        if (sentenceFuzziness < 0.01) {
                            const result = await window.api.diffSentence(leftSelectedContent, rightSelectedContent, paragraphsToProcess.left, paragraphsToProcess.right, leftDoc.content, rightDoc.content);
                            diff = result.diff;
                            matchedSentences = result.matchedSentences;
                            currentSentences = result.sentenceInfo || { left: new Map(), right: new Map() };
                            fuzzyMatchedPairs = [];
                        } else {
                            const fuzzyResult = await window.api.diffFuzzySentence(leftSelectedContent, rightSelectedContent, paragraphsToProcess.left, paragraphsToProcess.right, leftDoc.content, rightDoc.content, sentenceMatchThreshold);
                            diff = fuzzyResult.diff;
                            matchedSentences = fuzzyResult.matchedSentences;
                            currentSentences = fuzzyResult.sentenceInfo || { left: new Map(), right: new Map() };
                            fuzzyMatchedPairs = fuzzyResult.fuzzyMatchedPairs || [];
                        }
                        break;
                    case 'levenshtein':
                        // TODO: Implement when available
                        await showInfo('Levenshtein algorithm not yet implemented', 'Not Implemented');
                        return;
                    case 'character':
                    // TODO: Implement when available
                    await showInfo('Character algorithm not yet implemented', 'Not Implemented');
                    return;
                default:
                    // Invalid sentence algorithm
                    return;
            }
            }
            
            // Apply sentence-level highlighting
            applyDiffHighlighting(diff, paragraphsToProcess.left, paragraphsToProcess.right);
        }
    } catch (error) {
        progressDialog.close();
        await showInfo(`Error performing comparison: ${error.message}`, 'Comparison Error');
    } finally {
        // Ensure dialog is closed
        progressDialog.close();
    }
}

function getSelectedParagraphs(side) {
    const checkboxes = document.querySelectorAll(`#${side}ParagraphNumbers .paragraph-number input[type="checkbox"]:checked`);
    return Array.from(checkboxes).map(cb => parseInt(cb.dataset.paragraph));
}

function applyParagraphBackgrounds() {
    // Apply background colors to all checked paragraphs
    ['left', 'right'].forEach(side => {
        const checkboxes = document.querySelectorAll(`#${side}ParagraphNumbers .paragraph-number input[type="checkbox"]`);
        checkboxes.forEach(cb => {
            const paragraphNum = parseInt(cb.dataset.paragraph);
            const paragraphElement = document.getElementById(`${side}-content-paragraph-${paragraphNum}`);
            if (paragraphElement) {
                if (cb.checked) {
                    paragraphElement.classList.add(side === 'left' ? 'deleted' : 'added');
                } else {
                    paragraphElement.classList.remove('deleted', 'added');
                }
            }
        });
    });
}

function removeParagraphBackgrounds() {
    // Remove all paragraph background colors
    document.querySelectorAll('.paragraph').forEach(paragraph => {
        paragraph.classList.remove('deleted', 'added');
    });
}

function applyParagraphChangeBars(paragraphResult, leftSelectedParagraphs, rightSelectedParagraphs, isFuzzy = false) {
    // Clear existing change bars
    clearParagraphMarkers();
    
    if (!paragraphResult) return;
    
    // Process exact matches
    paragraphResult.exactMatches.forEach(match => {
        // Store the mapping
        matchedParagraphs.leftToRight.set(match.left, match.right);
        matchedParagraphs.rightToLeft.set(match.right, match.left);
        
        // Mark as matched if included in selection
        if (leftSelectedParagraphs.includes(match.left)) {
            const leftElement = document.getElementById(`left-content-paragraph-${match.left}`);
            if (leftElement) {
                leftElement.classList.add('paragraph-matched');
                // Add click handler for syncing
                leftElement.style.cursor = 'pointer';
                leftElement.dataset.paragraphIndex = match.left;
                leftElement.dataset.matchedIndex = match.right;
                
                // Remove any existing click handlers first
                const newLeftElement = leftElement.cloneNode(true);
                leftElement.parentNode.replaceChild(newLeftElement, leftElement);
                
                // Add custom tooltip
                addCustomTooltip(newLeftElement, 'Click to sync with matching paragraph');
                
                newLeftElement.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    const idx = parseInt(this.dataset.paragraphIndex);
                    if (!isNaN(idx)) {
                        scrollToMatchingParagraph('left', idx);
                    }
                }, true);
            }
        }
        
        if (rightSelectedParagraphs.includes(match.right)) {
            const rightElement = document.getElementById(`right-content-paragraph-${match.right}`);
            if (rightElement) {
                rightElement.classList.add('paragraph-matched');
                // Add click handler for syncing
                rightElement.style.cursor = 'pointer';
                rightElement.dataset.paragraphIndex = match.right;
                rightElement.dataset.matchedIndex = match.left;
                
                // Remove any existing click handlers first
                const newRightElement = rightElement.cloneNode(true);
                rightElement.parentNode.replaceChild(newRightElement, rightElement);
                
                // Add custom tooltip
                addCustomTooltip(newRightElement, 'Click to sync with matching paragraph');
                
                newRightElement.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    const idx = parseInt(this.dataset.paragraphIndex);
                    if (!isNaN(idx)) {
                        scrollToMatchingParagraph('right', idx);
                    }
                }, true);
            }
        }
    });
    
    // Process fuzzy matches with variable alpha
    paragraphResult.fuzzyMatches.forEach(match => {
        // Store the mapping
        matchedParagraphs.leftToRight.set(match.left, match.right);
        matchedParagraphs.rightToLeft.set(match.right, match.left);
        
        // Calculate alpha based on similarity
        const alpha = match.similarity;
        
        // Mark as fuzzy matched if included in selection
        if (leftSelectedParagraphs.includes(match.left)) {
            const leftElement = document.getElementById(`left-content-paragraph-${match.left}`);
            if (leftElement) {
                leftElement.classList.add('paragraph-matched', 'paragraph-fuzzy-matched', 'paragraph-changed', 'paragraph-deleted');
                // Apply variable alpha to change bar
                leftElement.style.setProperty('--paragraph-match-alpha', alpha);
                
                let currentElement = leftElement;
                
                // Only make clickable if sentence matching is disabled
                if (!sentenceMatchingEnabled) {
                    leftElement.style.cursor = 'pointer';
                    leftElement.dataset.paragraphIndex = match.left;
                    leftElement.dataset.matchedIndex = match.right;
                    
                    const newLeftElement = leftElement.cloneNode(true);
                    leftElement.parentNode.replaceChild(newLeftElement, leftElement);
                    currentElement = newLeftElement;
                    
                    // Add custom tooltip
                    addCustomTooltip(newLeftElement, `Fuzzy match (${Math.round(match.similarity * 100)}% similar) - Click to sync`);
                    
                    newLeftElement.addEventListener('click', function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        const idx = parseInt(this.dataset.paragraphIndex);
                        if (!isNaN(idx)) {
                            scrollToMatchingParagraph('left', idx);
                        }
                    }, true);
                }
                
                // Always add clickable change bar for fuzzy matches (even when sentence matching is enabled)
                addChangeBar(currentElement, 'left', {
                    fromIndex: match.left,
                    toIndex: match.right,
                    similarity: match.similarity
                });
            }
        }
        
        if (rightSelectedParagraphs.includes(match.right)) {
            const rightElement = document.getElementById(`right-content-paragraph-${match.right}`);
            if (rightElement) {
                rightElement.classList.add('paragraph-matched', 'paragraph-fuzzy-matched', 'paragraph-changed', 'paragraph-added');
                // Apply variable alpha to change bar
                rightElement.style.setProperty('--paragraph-match-alpha', alpha);
                
                let currentElement = rightElement;
                
                // Only make clickable if sentence matching is disabled
                if (!sentenceMatchingEnabled) {
                    rightElement.style.cursor = 'pointer';
                    rightElement.dataset.paragraphIndex = match.right;
                    rightElement.dataset.matchedIndex = match.left;
                    
                    const newRightElement = rightElement.cloneNode(true);
                    rightElement.parentNode.replaceChild(newRightElement, rightElement);
                    currentElement = newRightElement;
                    
                    // Add custom tooltip
                    addCustomTooltip(newRightElement, `Fuzzy match (${Math.round(match.similarity * 100)}% similar) - Click to sync`);
                    
                    newRightElement.addEventListener('click', function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        const idx = parseInt(this.dataset.paragraphIndex);
                        if (!isNaN(idx)) {
                            scrollToMatchingParagraph('right', idx);
                        }
                    }, true);
                }
                
                // Always add clickable change bar for fuzzy matches (even when sentence matching is enabled)
                addChangeBar(currentElement, 'right', {
                    fromIndex: match.right,
                    toIndex: match.left,
                    similarity: match.similarity
                });
            }
        }
    });
    
    // Mark unmatched paragraphs
    paragraphResult.unmatchedLeft.forEach(idx => {
        if (leftSelectedParagraphs.includes(idx)) {
            const element = document.getElementById(`left-content-paragraph-${idx}`);
            if (element) {
                element.classList.add('paragraph-changed', 'paragraph-deleted');
            }
        }
    });
    
    paragraphResult.unmatchedRight.forEach(idx => {
        if (rightSelectedParagraphs.includes(idx)) {
            const element = document.getElementById(`right-content-paragraph-${idx}`);
            if (element) {
                element.classList.add('paragraph-changed', 'paragraph-added');
            }
        }
    });
}

function applyDiffHighlighting(diff, leftSelectedParagraphs, rightSelectedParagraphs) {
    const leftDoc = getActiveDocument('left');
    const rightDoc = getActiveDocument('right');
    
    if (!leftDoc || !rightDoc) return;
    
    const leftParagraphs = leftDoc.content.split(/\r\n|\r|\n/);
    const rightParagraphs = rightDoc.content.split(/\r\n|\r|\n/);
    
    // Get the current sentence algorithm for proper CSS class naming
    const algorithm = sentenceAlgorithm === 'thomas' ? 'sentence' : 
                     sentenceAlgorithm === 'patience' ? 'patience' : 
                     sentenceAlgorithm;
    
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
        if (part.side === 'left' && part.removed) {
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
        } else if (part.side === 'right' && part.added) {
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
        const sentences = currentSentences.left.has(paragraphNum) 
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
                const className = `diff-part ${algorithm}-${highlight.type}`;
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
        
        // Restore change bar if it existed
        restoreChangeBar(paragraphElement, 'left', paragraphNum);
        
        // Add click handlers to all diff parts
        paragraphElement.querySelectorAll('.diff-part').forEach(part => {
            part.addEventListener('click', handleDiffPartClick);
        });
        
        // Add click handlers to matched sentences
        paragraphElement.querySelectorAll('.sentence-matched, .fuzzy-matched-sentence, .character-diff-sentence').forEach(sentence => {
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
        const sentences = currentSentences.right.has(paragraphNum) 
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
                const className = `diff-part ${algorithm}-${highlight.type}`;
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
        
        // Restore change bar if it existed
        restoreChangeBar(paragraphElement, 'right', paragraphNum);
        
        // Add click handlers to all diff parts
        paragraphElement.querySelectorAll('.diff-part').forEach(part => {
            part.addEventListener('click', handleDiffPartClick);
        });
        
        // Add click handlers to matched sentences
        paragraphElement.querySelectorAll('.sentence-matched, .fuzzy-matched-sentence, .character-diff-sentence').forEach(sentence => {
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
    if (!text) {
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
                
                // Check if this is a character diff sentence
                const charDiffPair = characterDiffPairs.find(pair => 
                    (side === 'left' && pair.left.paragraphIndex === paragraphNum && pair.left.sentence === sentence.text) ||
                    (side === 'right' && pair.right.paragraphIndex === paragraphNum && pair.right.sentence === sentence.text)
                );
                
                if (charDiffPair) {
                    // This is a character diff sentence - show inline character diff
                    result += `<span class="character-diff-sentence" data-sentence-key="${sentenceKey.replace(/"/g, '&quot;')}" data-side="${side}">`;
                    
                    charDiffPair.charDiff.forEach((part) => {
                        if (part.added) {
                            if (side === 'right') {
                                result += `<span class="inline-char-added diff-part" data-text="${escapeHtml(part.value)}">${escapeHtml(part.value)}</span>`;
                            }
                            // Skip added parts on left side
                        } else if (part.removed) {
                            if (side === 'left') {
                                result += `<span class="inline-char-deleted diff-part" data-text="${escapeHtml(part.value)}">${escapeHtml(part.value)}</span>`;
                            }
                            // Skip removed parts on right side
                        } else {
                            // Unchanged text
                            result += escapeHtml(part.value);
                        }
                    });
                    
                    result += `</span>`;
                } else if (fuzzyPair) {
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

// Clear only paragraph-level diff results
function clearParagraphDiff() {
    // Clear paragraph change bars
    clearParagraphMarkers();
    
    // Clear matched paragraphs
    matchedParagraphs.leftToRight.clear();
    matchedParagraphs.rightToLeft.clear();
    
    // Remove paragraph-level visual changes
    document.querySelectorAll('.paragraph-matched').forEach(el => {
        el.classList.remove('paragraph-matched');
        el.style.cursor = '';
        // Remove click handlers by cloning
        const newEl = el.cloneNode(true);
        el.parentNode.replaceChild(newEl, el);
    });
    
    document.querySelectorAll('.paragraph-changed').forEach(el => {
        el.classList.remove('paragraph-changed', 'paragraph-deleted', 'paragraph-added');
    });
}

// Clear only sentence-level diff results
function clearSentenceDiff() {
    // Clear matched sentences
    matchedSentences.leftToRight.clear();
    matchedSentences.rightToLeft.clear();
    if (currentSentences && currentSentences.left) {
        currentSentences.left.clear();
        currentSentences.right.clear();
    }
    fuzzyMatchedPairs = [];
    characterDiffPairs = [];
    
    // Remove sentence-level highlighting
    ['left', 'right'].forEach(side => {
        const doc = getActiveDocument(side);
        if (!doc) return;
        
        const paragraphs = doc.content.split(/\r\n|\r|\n/);
        paragraphs.forEach((paragraph, index) => {
            const paragraphElement = document.getElementById(`${side}-content-paragraph-${index}`);
            if (paragraphElement) {
                // Remove only sentence-level spans while preserving paragraph structure
                const wasMatched = paragraphElement.classList.contains('paragraph-matched');
                const dataParagraphIndex = paragraphElement.dataset.paragraphIndex;
                const hasDeleted = paragraphElement.classList.contains('deleted');
                const hasAdded = paragraphElement.classList.contains('added');
                
                paragraphElement.textContent = paragraph || '\n';
                
                // Restore paragraph-level classes
                if (wasMatched) paragraphElement.classList.add('paragraph-matched');
                if (hasDeleted) paragraphElement.classList.add('deleted');
                if (hasAdded) paragraphElement.classList.add('added');
                
                // Restore data attribute
                if (dataParagraphIndex !== undefined) {
                    paragraphElement.dataset.paragraphIndex = dataParagraphIndex;
                }
            }
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
    
    window.api.onFileOpenedNewTab(async (data) => {
        await createNewTab(data.side);
        loadFile(data.path, data.side);
    });
    
    window.api.onNewTab(async () => {
        // Determine which pane is focused or default to left
        const focusedElement = document.activeElement;
        const leftPane = document.getElementById('leftPane');
        const rightPane = document.getElementById('rightPane');
        
        if (rightPane.contains(focusedElement)) {
            await createNewTab('right');
        } else {
            await createNewTab('left');
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
        await showInfo('Clipboard is empty or does not contain text.', 'Empty Clipboard');
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
        
        // Update toolbar scaling after zoom change
        setTimeout(() => {
            toolbarScaler.checkAllToolbars();
        }, 50);
        
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
        // Reset left colors to defaults from config
        const defaultBgHue = appConfig?.colors?.left?.defaultBgHue ?? 0;
        const defaultBgIntensity = appConfig?.colors?.left?.defaultBgIntensity ?? 20;
        const defaultHlHue = appConfig?.colors?.left?.defaultHlHue ?? 0;
        const defaultHlIntensity = appConfig?.colors?.left?.defaultHlIntensity ?? 40;
        
        document.getElementById('leftBgColor').value = defaultBgHue;
        document.getElementById('leftBgIntensity').value = defaultBgIntensity;
        document.getElementById('leftHlColor').value = defaultHlHue;
        document.getElementById('leftHlIntensity').value = defaultHlIntensity;
        
        // Apply the defaults
        document.documentElement.style.setProperty('--left-bg-hue', defaultBgHue);
        document.documentElement.style.setProperty('--left-bg-intensity', defaultBgIntensity / 100);
        document.documentElement.style.setProperty('--left-hl-hue', defaultHlHue);
        document.documentElement.style.setProperty('--left-hl-intensity', defaultHlIntensity / 100);
        
        saveState();
    });

    document.getElementById('rightColorReset').addEventListener('click', () => {
        // Reset right colors to defaults from config
        const defaultBgHue = appConfig?.colors?.right?.defaultBgHue ?? 120;
        const defaultBgIntensity = appConfig?.colors?.right?.defaultBgIntensity ?? 20;
        const defaultHlHue = appConfig?.colors?.right?.defaultHlHue ?? 120;
        const defaultHlIntensity = appConfig?.colors?.right?.defaultHlIntensity ?? 40;
        
        document.getElementById('rightBgColor').value = defaultBgHue;
        document.getElementById('rightBgIntensity').value = defaultBgIntensity;
        document.getElementById('rightHlColor').value = defaultHlHue;
        document.getElementById('rightHlIntensity').value = defaultHlIntensity;
        
        // Apply the defaults
        document.documentElement.style.setProperty('--right-bg-hue', defaultBgHue);
        document.documentElement.style.setProperty('--right-bg-intensity', defaultBgIntensity / 100);
        document.documentElement.style.setProperty('--right-hl-hue', defaultHlHue);
        document.documentElement.style.setProperty('--right-hl-intensity', defaultHlIntensity / 100);
        
        saveState();
    });
}

async function populateAlgorithms() {
    try {
        // Get available algorithms from main process
        const paragraphAlgorithms = await window.api.getAlgorithms('paragraph');
        const sentenceAlgorithms = await window.api.getAlgorithms('sentence');
        
        // Populate paragraph algorithms
        const paragraphRadioGroup = document.querySelector('#paragraphEnabled').closest('.algorithm-toolbar').querySelector('.radio-group');
        if (paragraphRadioGroup && paragraphAlgorithms.length > 0) {
            paragraphRadioGroup.innerHTML = '';
            paragraphAlgorithms.forEach((algo, index) => {
                const label = document.createElement('label');
                label.className = 'radio-label';
                label.innerHTML = `
                    <input type="radio" name="paragraphAlgorithm" value="${algo.name}" ${index === 0 ? 'checked' : ''}>
                    <span>${algo.displayName}</span>
                `;
                paragraphRadioGroup.appendChild(label);
            });
        }
        
        // Populate sentence algorithms
        const sentenceRadioGroup = document.querySelector('#sentenceEnabled').closest('.algorithm-toolbar').querySelector('.radio-group');
        if (sentenceRadioGroup && sentenceAlgorithms.length > 0) {
            sentenceRadioGroup.innerHTML = '';
            sentenceAlgorithms.forEach((algo, index) => {
                const label = document.createElement('label');
                label.className = 'radio-label';
                const input = document.createElement('input');
                input.type = 'radio';
                input.name = 'sentenceAlgorithm';
                input.value = algo.name;
                if (index === 0) input.checked = true;
                
                // Disable placeholder algorithms
                if (algo.description && algo.description.includes('not yet implemented')) {
                    input.disabled = true;
                }
                
                const span = document.createElement('span');
                span.textContent = algo.displayName;
                
                label.appendChild(input);
                label.appendChild(span);
                sentenceRadioGroup.appendChild(label);
            });
        }
    } catch (error) {
        // Keep default HTML as fallback
    }
}

function setupDiffModeControls() {
    // Paragraph controls
    const paragraphCheckbox = document.getElementById('paragraphEnabled');
    const paragraphAlgorithmRadios = document.querySelectorAll('input[name="paragraphAlgorithm"]');
    const paragraphFuzzSlider = document.getElementById('paragraphFuzzSlider');
    const paragraphFuzzValue = document.getElementById('paragraphFuzzValue');
    
    // Sentence controls
    const sentenceCheckbox = document.getElementById('sentenceEnabled');
    const sentenceAlgorithmRadios = document.querySelectorAll('input[name="sentenceAlgorithm"]');
    const sentenceFuzzSlider = document.getElementById('sentenceFuzzSlider');
    const sentenceFuzzValue = document.getElementById('sentenceFuzzValue');
    
    // Compare button
    const compareBtn = document.getElementById('compareBtn');
    
    // Update compare button state
    function updateCompareButtonState() {
        compareBtn.disabled = !paragraphMatchingEnabled && !sentenceMatchingEnabled;
    }
    
    // Paragraph checkbox
    paragraphCheckbox.addEventListener('change', (e) => {
        paragraphMatchingEnabled = e.target.checked;
        updateCompareButtonState();
        
        // Clear paragraph diff when toggling off
        if (!e.target.checked) {
            clearParagraphDiff();
        }
        
        // Don't change backgrounds when toggling paragraph matching
        // Backgrounds should only depend on checkbox state
        
        saveState();
    });
    
    // Sentence checkbox
    sentenceCheckbox.addEventListener('change', (e) => {
        sentenceMatchingEnabled = e.target.checked;
        updateCompareButtonState();
        
        // Clear sentence diff when toggling off
        if (!e.target.checked) {
            clearSentenceDiff();
        }
        
        saveState();
    });
    
    // Paragraph algorithm selection
    paragraphAlgorithmRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            paragraphAlgorithm = e.target.value;
            
            // Clear only paragraph diff, preserve sentence diff
            clearParagraphDiff();
            applyParagraphBackgrounds();
            
            saveState();
        });
    });
    
    // Sentence algorithm selection
    sentenceAlgorithmRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            sentenceAlgorithm = e.target.value;
            
            // Disable fuzzy slider for character algorithm
            if (sentenceAlgorithm === 'character') {
                sentenceFuzzSlider.disabled = true;
                sentenceFuzzSlider.title = 'Character algorithm does not support fuzzy matching';
                sentenceFuzzValue.style.opacity = '0.5';
            } else {
                sentenceFuzzSlider.disabled = false;
                sentenceFuzzSlider.title = '';
                sentenceFuzzValue.style.opacity = '1';
            }
            
            // Clear only sentence diff, preserve paragraph diff
            clearSentenceDiff();
            applyParagraphBackgrounds();
            
            saveState();
        });
    });
    
    // Paragraph fuzziness slider
    paragraphFuzzSlider.addEventListener('input', (e) => {
        const sliderValue = parseInt(e.target.value);
        const convertedValue = sliderValue / 10;
        paragraphFuzziness = convertedValue;
        paragraphFuzzValue.textContent = convertedValue.toFixed(1);
        
        // Clear only paragraph diff, preserve sentence diff
        clearParagraphDiff();
        applyParagraphBackgrounds();
        
        saveState();
    });
    
    // Sentence fuzziness slider
    sentenceFuzzSlider.addEventListener('input', (e) => {
        const sliderValue = parseInt(e.target.value);
        const convertedValue = sliderValue / 10;
        sentenceFuzziness = convertedValue;
        sentenceFuzzValue.textContent = convertedValue.toFixed(1);
        
        // Clear only sentence diff, preserve paragraph diff
        clearSentenceDiff();
        applyParagraphBackgrounds();
        
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
    document.addEventListener('keydown', async (e) => {
        // Handle Ctrl+V for left pane
        if ((e.ctrlKey || e.metaKey) && e.key === 'v' && !e.shiftKey) {
            e.preventDefault();
            await pasteFromClipboard('left');
        }
        // Handle Ctrl+Shift+V for right pane
        else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'V') {
            e.preventDefault();
            await pasteFromClipboard('right');
        }
        // Handle Ctrl+T for new tab
        else if ((e.ctrlKey || e.metaKey) && e.key === 't' && !e.shiftKey) {
            e.preventDefault();
            // Determine which pane is focused or default to left
            const focusedElement = document.activeElement;
            const leftPane = document.getElementById('leftPane');
            const rightPane = document.getElementById('rightPane');
            
            if (rightPane.contains(focusedElement)) {
                await createNewTab('right');
            } else {
                await createNewTab('left');
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
        // Handle Escape key to clear text selection
        else if (e.key === 'Escape') {
            e.preventDefault();
            window.getSelection().removeAllRanges();
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
    
    // Convert documents Map to array for serialization, preserving DOM order
    const documentsArray = {
        left: [],
        right: []
    };
    
    // Get tabs in DOM order for each side
    ['left', 'right'].forEach(side => {
        const tabsContainer = document.getElementById(`${side}TabsContainer`);
        const tabs = tabsContainer.querySelectorAll('.tab');
        
        tabs.forEach(tab => {
            const tabId = tab.dataset.tabId;
            const doc = documents[side].get(tabId);
            if (doc) {
                documentsArray[side].push({
                    tabId: tabId,
                    content: doc.content,
                    filePath: doc.filePath,
                    scrollTop: doc.scrollTop,
                    selectedParagraphs: Array.from(doc.selectedParagraphs),
                    isActive: tabId === activeTab[side],
                    isModified: doc.isModified,
                    pastedTimestamp: doc.pastedTimestamp
                });
            }
        });
    });
    
    const state = {
        documents: documentsArray,
        activeTab: activeTab,
        // New algorithm settings
        paragraphMatchingEnabled: paragraphMatchingEnabled,
        paragraphAlgorithm: paragraphAlgorithm,
        paragraphFuzziness: paragraphFuzziness,
        sentenceMatchingEnabled: sentenceMatchingEnabled,
        sentenceAlgorithm: sentenceAlgorithm,
        sentenceFuzziness: sentenceFuzziness,
        strikethroughEnabled: strikethroughEnabled,
        // Legacy fields for backward compatibility
        algorithm: sentenceAlgorithm === 'thomas' ? 'sentence' : 'patience',
        fuzziness: sentenceFuzziness,
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

    // Restore algorithm settings with backwards compatibility
    if (state.paragraphMatchingEnabled !== undefined) {
        // New state format
        paragraphMatchingEnabled = state.paragraphMatchingEnabled;
        paragraphAlgorithm = state.paragraphAlgorithm || 'thomas';
        paragraphFuzziness = state.paragraphFuzziness || 0.0;
        sentenceMatchingEnabled = state.sentenceMatchingEnabled;
        sentenceAlgorithm = state.sentenceAlgorithm || 'thomas';
        sentenceFuzziness = state.sentenceFuzziness || 0.0;
        strikethroughEnabled = state.strikethroughEnabled !== false;  // Default true
    } else if (state.algorithm) {
        // Intermediate state format - has algorithm but not new fields
        paragraphMatchingEnabled = true;
        paragraphAlgorithm = state.algorithm === 'patience' ? 'patience' : 'thomas';
        paragraphFuzziness = 0.0;
        sentenceMatchingEnabled = true;
        sentenceAlgorithm = 'thomas';
        sentenceFuzziness = state.fuzziness || 0.0;
    } else if (state.diffMode) {
        // Old state format - migrate to new format
        paragraphMatchingEnabled = true;
        paragraphAlgorithm = 'thomas';
        paragraphFuzziness = 0.0;
        sentenceMatchingEnabled = true;
        sentenceAlgorithm = 'thomas';
        if (state.diffMode === 'sentence') {
            sentenceFuzziness = 0.0;
        } else if (state.diffMode === 'fuzzy') {
            sentenceFuzziness = state.fuzzLevel || 0.5;
        }
    }
    
    // Set paragraph controls
    document.getElementById('paragraphEnabled').checked = paragraphMatchingEnabled;
    const paragraphRadio = document.querySelector(`input[name="paragraphAlgorithm"][value="${paragraphAlgorithm}"]`);
    if (paragraphRadio) paragraphRadio.checked = true;
    document.getElementById('paragraphFuzzSlider').value = paragraphFuzziness * 10;
    document.getElementById('paragraphFuzzValue').textContent = paragraphFuzziness.toFixed(1);
    
    // Set sentence controls
    document.getElementById('sentenceEnabled').checked = sentenceMatchingEnabled;
    const sentenceRadio = document.querySelector(`input[name="sentenceAlgorithm"][value="${sentenceAlgorithm}"]`);
    if (sentenceRadio) sentenceRadio.checked = true;
    document.getElementById('sentenceFuzzSlider').value = sentenceFuzziness * 10;
    document.getElementById('sentenceFuzzValue').textContent = sentenceFuzziness.toFixed(1);
    
    // Disable fuzzy slider for character algorithm
    if (sentenceAlgorithm === 'character') {
        document.getElementById('sentenceFuzzSlider').disabled = true;
        document.getElementById('sentenceFuzzSlider').title = 'Character algorithm does not support fuzzy matching';
        document.getElementById('sentenceFuzzValue').style.opacity = '0.5';
    }
    
    // Set strikethrough control
    const strikethroughCheckbox = document.getElementById('leftStrikethrough');
    if (strikethroughCheckbox) {
        strikethroughCheckbox.checked = strikethroughEnabled;
        const leftContent = document.getElementById('leftContent');
        if (strikethroughEnabled) {
            leftContent.classList.add('strikethrough-enabled');
        } else {
            leftContent.classList.remove('strikethrough-enabled');
        }
    }
    
    // Update Compare button state
    const compareBtn = document.getElementById('compareBtn');
    compareBtn.disabled = !paragraphMatchingEnabled && !sentenceMatchingEnabled;

    // Restore zoom
    if (state.zoom) {
        currentZoom = state.zoom;
        window.api.setZoom(currentZoom);
        document.getElementById('zoomLevel').textContent = Math.round(currentZoom * 100) + '%';
        
        // Update toolbar scaling after zoom restoration
        setTimeout(() => {
            toolbarScaler.checkAllToolbars();
        }, 100);
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
                doc.pastedTimestamp = docData.pastedTimestamp || null;
                
                documents.left.set(doc.tabId, doc);
                
                // Create tab element
                const tabsContainer = document.getElementById('leftTabsContainer');
                const tabElement = document.createElement('div');
                tabElement.className = 'tab';
                tabElement.dataset.tabId = doc.tabId;
                tabElement.draggable = true;
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
                
                // Add drag and drop functionality
                setupTabDragAndDrop(tabElement, 'left');
                
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
                doc.pastedTimestamp = docData.pastedTimestamp || null;
                
                documents.right.set(doc.tabId, doc);
                
                // Create tab element
                const tabsContainer = document.getElementById('rightTabsContainer');
                const tabElement = document.createElement('div');
                tabElement.className = 'tab';
                tabElement.dataset.tabId = doc.tabId;
                tabElement.draggable = true;
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
                
                // Add drag and drop functionality
                setupTabDragAndDrop(tabElement, 'right');
                
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
            await createNewTab('left');
        }
        
        if (rightActiveTabId) {
            switchToTab('right', rightActiveTabId);
        } else if (documents.right.size === 0) {
            // Create empty tab if no documents
            await createNewTab('right');
        }
    } else {
        // Legacy single-document support
        if (state.leftFile && state.leftFile.content) {
            hasDocuments = true;
            const tabId = await createNewTab('left', state.leftFile.content, state.leftFile.path);
            if (tabId) {
                const doc = documents.left.get(tabId);
                if (doc) {
                    doc.scrollTop = state.leftFile.scrollTop;
                }
            }
        }

        if (state.rightFile && state.rightFile.content) {
            hasDocuments = true;
            const tabId = await createNewTab('right', state.rightFile.content, state.rightFile.path);
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