const { app, BrowserWindow, Menu, ipcMain, dialog, clipboard, screen } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const packageInfo = require('./package.json');
const Diff = require('diff');

let mainWindow;
let currentZoom = 1.0;
let config = {};
let windowState = null;

async function loadConfig() {
  try {
    const configPath = path.join(__dirname, 'config.json');
    const configData = await fs.readFile(configPath, 'utf-8');
    config = JSON.parse(configData);
  } catch (error) {
    console.warn('Config file not found or invalid, using defaults');
    config = {
      window: {
        defaultWidth: 1400,
        defaultHeight: 800,
        minWidth: 800,
        minHeight: 600
      },
      zoom: {
        default: 1.0,
        min: 0.5,
        max: 3.0,
        increment: 0.25
      },
      colors: {
        left: {
          defaultBgHue: 0,
          defaultBgIntensity: 20,
          defaultHlHue: 0,
          defaultHlIntensity: 40
        },
        right: {
          defaultBgHue: 120,
          defaultBgIntensity: 20,
          defaultHlHue: 120,
          defaultHlIntensity: 40
        },
        bgIntensityMin: 5,
        bgIntensityMax: 40,
        hlIntensityMin: 20,
        hlIntensityMax: 60
      },
      fuzzySentenceMatching: {
        minMatchPercent: 10,
        maxMatchPercent: 100,
        defaultFuzzLevel: 0.00,
        wordLookAheadLimit: 5
      },
      fuzzyParagraphMatching: {
        minMatchPercent: 30,
        maxMatchPercent: 100,
        defaultFuzzLevel: 0.00
      },
      ui: {
        statusBarUpdateIntervalMs: 60000,
        paragraphSyncHighlightDurationMs: 600,
        paragraphSyncHighlightColor: "rgba(100, 100, 255, 0.3)",
        sentenceSyncHighlightColor: "rgba(100, 100, 255, 0.5)",
        tooltipDisplayDurationMs: 1500
      },
      toolbar: {
        defaultParagraphAlgorithm: "thomas",
        defaultSentenceAlgorithm: "thomas",
        defaultParagraphMatchingEnabled: true,
        defaultSentenceMatchingEnabled: true
      }
    };
  }
}

async function loadWindowState() {
  try {
    const userDataPath = app.getPath('userData');
    const windowStatePath = path.join(userDataPath, 'differon-window-state.json');
    const data = await fs.readFile(windowStatePath, 'utf-8');
    windowState = JSON.parse(data);
    
    // Validate that the window position is still valid (e.g., not off-screen)
    const displays = screen.getAllDisplays();
    const displayBounds = displays.map(d => d.bounds);
    
    // Check if the saved position is within any display
    let isValidPosition = false;
    for (const display of displayBounds) {
      if (windowState.x >= display.x - 100 && 
          windowState.x <= display.x + display.width - 100 &&
          windowState.y >= display.y - 100 && 
          windowState.y <= display.y + display.height - 100) {
        isValidPosition = true;
        break;
      }
    }
    
    if (!isValidPosition) {
      // Reset to default if position is invalid
      windowState = null;
    }
  } catch (error) {
    // No saved state or error reading it
    windowState = null;
  }
}

async function saveWindowState() {
  if (!mainWindow) return;
  
  const bounds = mainWindow.getBounds();
  const isMaximized = mainWindow.isMaximized();
  const isFullScreen = mainWindow.isFullScreen();
  
  const state = {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    isMaximized: isMaximized,
    isFullScreen: isFullScreen
  };
  
  try {
    const userDataPath = app.getPath('userData');
    const windowStatePath = path.join(userDataPath, 'differon-window-state.json');
    await fs.writeFile(windowStatePath, JSON.stringify(state, null, 2));
  } catch (error) {
    console.error('Error saving window state:', error);
  }
}

function createWindow() {
  // Use saved window state or defaults
  const windowOptions = {
    width: windowState?.width || config.window.defaultWidth,
    height: windowState?.height || config.window.defaultHeight,
    minWidth: config.window.minWidth,
    minHeight: config.window.minHeight,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'build/icon.ico')
  };
  
  // Set position if we have saved state
  if (windowState && windowState.x !== undefined && windowState.y !== undefined) {
    windowOptions.x = windowState.x;
    windowOptions.y = windowState.y;
  }
  
  mainWindow = new BrowserWindow(windowOptions);
  
  // Restore maximized or fullscreen state after window is shown
  if (windowState) {
    if (windowState.isFullScreen) {
      mainWindow.setFullScreen(true);
    } else if (windowState.isMaximized) {
      mainWindow.maximize();
    }
  }

  mainWindow.loadFile('index.html');

  // Remove the application menu to reclaim vertical space
  mainWindow.removeMenu();
  
  // Enable F12 for DevTools and Ctrl+Shift+I
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' || (input.control && input.shift && input.key === 'I')) {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  // Save window state on various events
  let saveTimeout;
  const debouncedSaveWindowState = () => {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(saveWindowState, 500);
  };
  
  mainWindow.on('resize', debouncedSaveWindowState);
  mainWindow.on('move', debouncedSaveWindowState);
  mainWindow.on('maximize', saveWindowState);
  mainWindow.on('unmaximize', saveWindowState);
  mainWindow.on('enter-full-screen', saveWindowState);
  mainWindow.on('leave-full-screen', saveWindowState);

  // Create application menu
  const menuTemplate = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Original...',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow, {
              properties: ['openFile'],
              filters: [
                { name: 'Text Files', extensions: ['txt', 'md', 'js', 'html', 'css', 'json', 'xml'] },
                { name: 'All Files', extensions: ['*'] }
              ]
            });
            if (!result.canceled) {
              mainWindow.webContents.send('file-opened', { side: 'left', path: result.filePaths[0] });
            }
          }
        },
        {
          label: 'Open Revised...',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow, {
              properties: ['openFile'],
              filters: [
                { name: 'Text Files', extensions: ['txt', 'md', 'js', 'html', 'css', 'json', 'xml'] },
                { name: 'All Files', extensions: ['*'] }
              ]
            });
            if (!result.canceled) {
              mainWindow.webContents.send('file-opened', { side: 'right', path: result.filePaths[0] });
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Open Original in New Tab...',
          accelerator: 'CmdOrCtrl+Shift+T',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow, {
              properties: ['openFile'],
              filters: [
                { name: 'Text Files', extensions: ['txt', 'md', 'js', 'html', 'css', 'json', 'xml'] },
                { name: 'All Files', extensions: ['*'] }
              ]
            });
            if (!result.canceled) {
              mainWindow.webContents.send('file-opened-new-tab', { side: 'left', path: result.filePaths[0] });
            }
          }
        },
        {
          label: 'Open Revised in New Tab...',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow, {
              properties: ['openFile'],
              filters: [
                { name: 'Text Files', extensions: ['txt', 'md', 'js', 'html', 'css', 'json', 'xml'] },
                { name: 'All Files', extensions: ['*'] }
              ]
            });
            if (!result.canceled) {
              mainWindow.webContents.send('file-opened-new-tab', { side: 'right', path: result.filePaths[0] });
            }
          }
        },
        { type: 'separator' },
        {
          label: 'New Tab',
          accelerator: 'CmdOrCtrl+T',
          click: () => {
            mainWindow.webContents.send('new-tab');
          }
        },
        {
          label: 'Close Tab',
          accelerator: 'CmdOrCtrl+W',
          click: () => {
            mainWindow.webContents.send('close-tab');
          }
        },
        { type: 'separator' },
        {
          label: 'Paste Original',
          accelerator: 'CmdOrCtrl+V',
          click: () => {
            mainWindow.webContents.send('paste-content', { side: 'left' });
          }
        },
        {
          label: 'Paste Revised',
          accelerator: 'CmdOrCtrl+Shift+V',
          click: () => {
            mainWindow.webContents.send('paste-content', { side: 'right' });
          }
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => app.quit()
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Copy', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: 'Select All', accelerator: 'CmdOrCtrl+A', role: 'selectAll' },
        { type: 'separator' },
        {
          label: 'Next Tab',
          accelerator: 'CmdOrCtrl+Tab',
          click: () => {
            mainWindow.webContents.send('next-tab');
          }
        },
        {
          label: 'Previous Tab',
          accelerator: 'CmdOrCtrl+Shift+Tab',
          click: () => {
            mainWindow.webContents.send('previous-tab');
          }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Zoom In',
          accelerator: 'CmdOrCtrl+Plus',
          click: () => {
            currentZoom = Math.min(currentZoom + config.zoom.increment, config.zoom.max);
            mainWindow.webContents.setZoomFactor(currentZoom);
          }
        },
        {
          label: 'Zoom Out',
          accelerator: 'CmdOrCtrl+-',
          click: () => {
            currentZoom = Math.max(currentZoom - config.zoom.increment, config.zoom.min);
            mainWindow.webContents.setZoomFactor(currentZoom);
          }
        },
        {
          label: 'Reset Zoom',
          accelerator: 'CmdOrCtrl+0',
          click: () => {
            currentZoom = config.zoom.default;
            mainWindow.webContents.setZoomFactor(currentZoom);
          }
        },
        { type: 'separator' },
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', role: 'reload' },
        { label: 'Toggle DevTools', accelerator: 'F12', role: 'toggleDevTools' }
      ]
    }
  ];

  // Menu removed - keyboard shortcuts are still handled by the renderer process

  // Restore state when window is ready
  mainWindow.webContents.once('dom-ready', () => {
    mainWindow.webContents.send('restore-state');
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  
  // Save state before closing
  mainWindow.on('close', () => {
    saveWindowState();
  });
}

// IPC handlers for console logging to stdout
ipcMain.on('console-log', (event, ...args) => {
  console.log('[Renderer]', ...args);
});

ipcMain.on('console-warn', (event, ...args) => {
  console.warn('[Renderer]', ...args);
});

ipcMain.on('console-error', (event, ...args) => {
  console.error('[Renderer]', ...args);
});

// IPC handlers for file operations
ipcMain.handle('read-file', async (event, filePath) => {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return { success: true, content, path: filePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Natural Language Diff Handlers
const nlp = require('compromise');

// Paragraph mode diff handler (exact matching only - legacy)
ipcMain.handle('diff-paragraph', async (event, leftText, rightText) => {
  // Split into paragraphs - each paragraph is text between line endings
  function splitParagraphs(text) {
    return text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n');
  }
  
  const leftParagraphs = splitParagraphs(leftText);
  const rightParagraphs = splitParagraphs(rightText);
  
  const diff = [];
  
  // Implementation of the user's algorithm
  let oU = 0; // First unprocessed paragraph in original (0-indexed)
  let rU = 0; // First unprocessed paragraph in revised (0-indexed)
  
  while (oU < leftParagraphs.length) {
    let found = false;
    
    // Look for exact match in remaining revised paragraphs
    for (let i = rU; i < rightParagraphs.length; i++) {
      if (rightParagraphs[i] === leftParagraphs[oU]) {
        // Found exact match
        // First, mark all revised paragraphs before the match as added
        for (let j = rU; j < i; j++) {
          if (rightParagraphs[j].trim()) { // Only include non-empty paragraphs
            diff.push({
              value: rightParagraphs[j],
              added: true,
              removed: false,
              count: rightParagraphs[j].split(/\s+/).filter(w => w.length > 0).length
            });
          }
        }
        
        // Add the matching paragraph as unchanged
        if (leftParagraphs[oU].trim()) { // Only include non-empty paragraphs
          diff.push({
            value: leftParagraphs[oU],
            added: false,
            removed: false
          });
        }
        
        oU += 1;
        rU = i + 1;
        found = true;
        break;
      }
    }
    
    if (!found) {
      // No match found - mark original paragraph as deleted
      if (leftParagraphs[oU].trim()) { // Only include non-empty paragraphs
        diff.push({
          value: leftParagraphs[oU],
          removed: true,
          added: false,
          count: leftParagraphs[oU].split(/\s+/).filter(w => w.length > 0).length
        });
      }
      oU += 1;
    }
  }
  
  // Mark any remaining revised paragraphs as added
  while (rU < rightParagraphs.length) {
    if (rightParagraphs[rU].trim()) { // Only include non-empty paragraphs
      diff.push({
        value: rightParagraphs[rU],
        added: true,
        removed: false,
        count: rightParagraphs[rU].split(/\s+/).filter(w => w.length > 0).length
      });
    }
    rU += 1;
  }
  
  return diff;
});

// Enhanced sentence mode diff handler - process paragraphs individually
ipcMain.handle('diff-sentence', async (event, leftSelectedText, rightSelectedText, leftSelectedParagraphs, rightSelectedParagraphs, leftFullText, rightFullText) => {
  // Use full text if provided, otherwise parse from selected text
  const leftText = leftFullText || leftSelectedText;
  const rightText = rightFullText || rightSelectedText;
  
  // Split the full text into paragraphs
  const leftFullParagraphs = leftText.split(/\r\n|\r|\n/);
  const rightFullParagraphs = rightText.split(/\r\n|\r|\n/);
  
  // Get the selected paragraphs
  const leftSelectedTexts = leftSelectedParagraphs.map(i => leftFullParagraphs[i] || '');
  const rightSelectedTexts = rightSelectedParagraphs.map(i => rightFullParagraphs[i] || '');
  
  // Improved sentence splitter that preserves exact text
  function splitIntoSentences(text) {
    if (!text.trim()) return [];
    
    const sentences = [];
    
    // Try multiple approaches to ensure we catch all sentences
    
    // Approach 1: Use compromise but verify results
    const doc = nlp(text);
    const nlpSentences = doc.sentences().out('array');
    
    // Approach 2: Also use regex-based splitting for better coverage
    // This catches sentences that end with . ! ? followed by space and capital letter
    const regexSentences = [];
    const sentenceRegex = /[^.!?]*[.!?]+(?:\s+|$)/g;
    let match;
    let lastEnd = 0;
    
    while ((match = sentenceRegex.exec(text)) !== null) {
      const sentence = match[0].trim();
      if (sentence) {
        regexSentences.push(sentence);
      }
      lastEnd = match.index + match[0].length;
    }
    
    // Catch any remaining text that doesn't end with punctuation
    if (lastEnd < text.length) {
      const remaining = text.substring(lastEnd).trim();
      if (remaining) {
        regexSentences.push(remaining);
      }
    }
    
    // Combine both approaches - use whichever found more sentences
    const sourceSentences = nlpSentences.length >= regexSentences.length ? nlpSentences : regexSentences;
    
    // Clean up and deduplicate
    const seen = new Set();
    for (const sentence of sourceSentences) {
      const trimmed = sentence.trim();
      if (trimmed && !seen.has(trimmed)) {
        sentences.push(trimmed);
        seen.add(trimmed);
      }
    }
    
    // If we still have no sentences, just return the whole text as one sentence
    if (sentences.length === 0 && text.trim()) {
      sentences.push(text.trim());
    }
    
    return sentences;
  }
  
  // Process each paragraph separately to maintain boundaries
  const leftSentencesByParagraph = leftSelectedTexts.map((text, idx) => ({
    paragraphIndex: leftSelectedParagraphs[idx],
    sentences: splitIntoSentences(text),
    text: text
  }));
  
  const rightSentencesByParagraph = rightSelectedTexts.map((text, idx) => ({
    paragraphIndex: rightSelectedParagraphs[idx],
    sentences: splitIntoSentences(text),
    text: text
  }));
  
  // Flatten all sentences but keep track of their paragraph origins
  const allLeftSentences = [];
  const allRightSentences = [];
  
  leftSentencesByParagraph.forEach(para => {
    para.sentences.forEach(sentence => {
      allLeftSentences.push({
        sentence: sentence,
        paragraphIndex: para.paragraphIndex,
        paragraphText: para.text
      });
    });
  });
  
  rightSentencesByParagraph.forEach(para => {
    para.sentences.forEach(sentence => {
      allRightSentences.push({
        sentence: sentence,
        paragraphIndex: para.paragraphIndex,
        paragraphText: para.text
      });
    });
  });
  
  // Apply the same n² algorithm used for paragraphs
  const diff = [];
  const matchedSentences = {
    leftToRight: new Map(),
    rightToLeft: new Map()
  };
  
  // Store sentence information for renderer
  const sentenceInfo = {
    left: new Map(), // paragraphIndex -> array of {text, start, end}
    right: new Map() // paragraphIndex -> array of {text, start, end}
  };
  
  // Initialize sentence info maps
  leftSelectedParagraphs.forEach(idx => sentenceInfo.left.set(idx, []));
  rightSelectedParagraphs.forEach(idx => sentenceInfo.right.set(idx, []));
  
  // Populate sentence info
  allLeftSentences.forEach(item => {
    const para = item.paragraphText;
    const start = para.indexOf(item.sentence);
    if (start !== -1 && sentenceInfo.left.has(item.paragraphIndex)) {
      sentenceInfo.left.get(item.paragraphIndex).push({
        text: item.sentence,
        start: start,
        end: start + item.sentence.length
      });
    }
  });
  
  allRightSentences.forEach(item => {
    const para = item.paragraphText;
    const start = para.indexOf(item.sentence);
    if (start !== -1 && sentenceInfo.right.has(item.paragraphIndex)) {
      sentenceInfo.right.get(item.paragraphIndex).push({
        text: item.sentence,
        start: start,
        end: start + item.sentence.length
      });
    }
  });
  
  let oU = 0; // First unprocessed sentence in original (0-indexed)
  let rU = 0; // First unprocessed sentence in revised (0-indexed)
  
  while (oU < allLeftSentences.length) {
    let found = false;
    
    // Look for exact match in remaining revised sentences
    for (let i = rU; i < allRightSentences.length; i++) {
      if (allRightSentences[i].sentence === allLeftSentences[oU].sentence) {
        // Found exact match
        // Store the matching relationship
        matchedSentences.leftToRight.set(
          `${allLeftSentences[oU].paragraphIndex}:${allLeftSentences[oU].sentence}`,
          `${allRightSentences[i].paragraphIndex}:${allRightSentences[i].sentence}`
        );
        matchedSentences.rightToLeft.set(
          `${allRightSentences[i].paragraphIndex}:${allRightSentences[i].sentence}`,
          `${allLeftSentences[oU].paragraphIndex}:${allLeftSentences[oU].sentence}`
        );
        
        // First, mark all revised sentences before the match as added
        for (let j = rU; j < i; j++) {
          diff.push({
            value: allRightSentences[j].sentence,
            added: true,
            removed: false,
            paragraphIndex: allRightSentences[j].paragraphIndex,
            paragraphText: allRightSentences[j].paragraphText
          });
        }
        
        // Add the matching sentence as unchanged
        diff.push({
          value: allLeftSentences[oU].sentence,
          added: false,
          removed: false,
          leftParagraphIndex: allLeftSentences[oU].paragraphIndex,
          rightParagraphIndex: allRightSentences[i].paragraphIndex
        });
        
        oU += 1;
        rU = i + 1;
        found = true;
        break;
      }
    }
    
    if (!found) {
      // No match found - mark original sentence as deleted
      diff.push({
        value: allLeftSentences[oU].sentence,
        removed: true,
        added: false,
        paragraphIndex: allLeftSentences[oU].paragraphIndex,
        paragraphText: allLeftSentences[oU].paragraphText
      });
      oU += 1;
    }
  }
  
  // Mark any remaining revised sentences as added
  while (rU < allRightSentences.length) {
    diff.push({
      value: allRightSentences[rU].sentence,
      added: true,
      removed: false,
      paragraphIndex: allRightSentences[rU].paragraphIndex,
      paragraphText: allRightSentences[rU].paragraphText
    });
    rU += 1;
  }
  
  // Now convert to positioned diff - find positions within each paragraph
  const positionedDiff = [];
  
  // Process each diff part
  for (const part of diff) {
    if (part.removed) {
      // Find position within the paragraph
      const paragraphText = part.paragraphText;
      const sentenceStart = paragraphText.indexOf(part.value);
      
      if (sentenceStart !== -1) {
        // Calculate position relative to the concatenated selected text
        let globalStart = 0;
        for (let i = 0; i < leftSelectedParagraphs.length; i++) {
          if (leftSelectedParagraphs[i] === part.paragraphIndex) {
            globalStart += sentenceStart;
            break;
          }
          globalStart += (leftFullParagraphs[leftSelectedParagraphs[i]] || '').length + 1; // +1 for newline
        }
        
        positionedDiff.push({
          value: part.value,
          removed: true,
          added: false,
          start: globalStart,
          end: globalStart + part.value.length,
          side: 'left'
        });
      }
    } else if (part.added) {
      // Find position within the paragraph
      const paragraphText = part.paragraphText;
      const sentenceStart = paragraphText.indexOf(part.value);
      
      if (sentenceStart !== -1) {
        // Calculate position relative to the concatenated selected text
        let globalStart = 0;
        for (let i = 0; i < rightSelectedParagraphs.length; i++) {
          if (rightSelectedParagraphs[i] === part.paragraphIndex) {
            globalStart += sentenceStart;
            break;
          }
          globalStart += (rightFullParagraphs[rightSelectedParagraphs[i]] || '').length + 1; // +1 for newline
        }
        
        positionedDiff.push({
          value: part.value,
          added: true,
          removed: false,
          start: globalStart,
          end: globalStart + part.value.length,
          side: 'right'
        });
      }
    }
    // Unchanged sentences don't need position info for highlighting
  }
  
  return { 
    diff: positionedDiff, 
    matchedSentences: matchedSentences,
    sentenceInfo: sentenceInfo
  };
});

// Enhanced fuzzy sentence mode diff handler
ipcMain.handle('diff-fuzzy-sentence', async (event, leftSelectedText, rightSelectedText, leftSelectedParagraphs, rightSelectedParagraphs, leftFullText, rightFullText, matchThreshold) => {
  // Use full text if provided, otherwise parse from selected text
  const leftText = leftFullText || leftSelectedText;
  const rightText = rightFullText || rightSelectedText;
  
  // Split the full text into paragraphs
  const leftFullParagraphs = leftText.split(/\r\n|\r|\n/);
  const rightFullParagraphs = rightText.split(/\r\n|\r|\n/);
  
  // Get the selected paragraphs
  const leftSelectedTexts = leftSelectedParagraphs.map(i => leftFullParagraphs[i] || '');
  const rightSelectedTexts = rightSelectedParagraphs.map(i => rightFullParagraphs[i] || '');
  
  // Improved sentence splitter that preserves exact text
  function splitIntoSentences(text) {
    if (!text.trim()) return [];
    
    const sentences = [];
    
    // Try multiple approaches to ensure we catch all sentences
    
    // Approach 1: Use compromise but verify results
    const doc = nlp(text);
    const nlpSentences = doc.sentences().out('array');
    
    // Approach 2: Also use regex-based splitting for better coverage
    // This catches sentences that end with . ! ? followed by space and capital letter
    const regexSentences = [];
    const sentenceRegex = /[^.!?]*[.!?]+(?:\s+|$)/g;
    let match;
    let lastEnd = 0;
    
    while ((match = sentenceRegex.exec(text)) !== null) {
      const sentence = match[0].trim();
      if (sentence) {
        regexSentences.push(sentence);
      }
      lastEnd = match.index + match[0].length;
    }
    
    // Catch any remaining text that doesn't end with punctuation
    if (lastEnd < text.length) {
      const remaining = text.substring(lastEnd).trim();
      if (remaining) {
        regexSentences.push(remaining);
      }
    }
    
    // Combine both approaches - use whichever found more sentences
    const sourceSentences = nlpSentences.length >= regexSentences.length ? nlpSentences : regexSentences;
    
    // Clean up and deduplicate
    const seen = new Set();
    for (const sentence of sourceSentences) {
      const trimmed = sentence.trim();
      if (trimmed && !seen.has(trimmed)) {
        sentences.push(trimmed);
        seen.add(trimmed);
      }
    }
    
    // If we still have no sentences, just return the whole text as one sentence
    if (sentences.length === 0 && text.trim()) {
      sentences.push(text.trim());
    }
    
    return sentences;
  }
  
  // Calculate similarity between two sentences
  function calculateSimilarity(s1, s2) {
    const words1 = s1.toLowerCase().split(/\s+/);
    const words2 = s2.toLowerCase().split(/\s+/);
    
    const set1 = new Set(words1);
    const set2 = new Set(words2);
    
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return intersection.size / union.size;
  }
  
  // Get word-level diff between two similar sentences
  function getWordDiff(s1, s2) {
    const words1 = s1.split(/\s+/);
    const words2 = s2.split(/\s+/);
    
    const diff = [];
    let i = 0, j = 0;
    
    while (i < words1.length || j < words2.length) {
      if (i >= words1.length) {
        // Remaining words in s2 are additions
        diff.push({ type: 'added', value: words2.slice(j).join(' ') });
        break;
      } else if (j >= words2.length) {
        // Remaining words in s1 are deletions
        diff.push({ type: 'deleted', value: words1.slice(i).join(' ') });
        break;
      } else if (words1[i] === words2[j]) {
        // Matching word
        diff.push({ type: 'unchanged', value: words1[i] });
        i++;
        j++;
      } else {
        // Find next match
        let nextMatchI = -1;
        let nextMatchJ = -1;
        
        // Look ahead for matches
        for (let li = i + 1; li < Math.min(i + 5, words1.length); li++) {
          for (let lj = j + 1; lj < Math.min(j + 5, words2.length); lj++) {
            if (words1[li] === words2[lj]) {
              nextMatchI = li;
              nextMatchJ = lj;
              break;
            }
          }
          if (nextMatchI !== -1) break;
        }
        
        if (nextMatchI !== -1) {
          // Output deletions and additions up to next match
          if (nextMatchI > i) {
            diff.push({ type: 'deleted', value: words1.slice(i, nextMatchI).join(' ') });
          }
          if (nextMatchJ > j) {
            diff.push({ type: 'added', value: words2.slice(j, nextMatchJ).join(' ') });
          }
          i = nextMatchI;
          j = nextMatchJ;
        } else {
          // No more matches
          diff.push({ type: 'deleted', value: words1.slice(i).join(' ') });
          diff.push({ type: 'added', value: words2.slice(j).join(' ') });
          break;
        }
      }
    }
    
    return diff;
  }
  
  // Process each paragraph separately to maintain boundaries
  const leftSentencesByParagraph = leftSelectedTexts.map((text, idx) => ({
    paragraphIndex: leftSelectedParagraphs[idx],
    sentences: splitIntoSentences(text),
    text: text
  }));
  
  const rightSentencesByParagraph = rightSelectedTexts.map((text, idx) => ({
    paragraphIndex: rightSelectedParagraphs[idx],
    sentences: splitIntoSentences(text),
    text: text
  }));
  
  // Flatten all sentences but keep track of their paragraph origins
  const allLeftSentences = [];
  const allRightSentences = [];
  
  leftSentencesByParagraph.forEach(para => {
    para.sentences.forEach(sentence => {
      allLeftSentences.push({
        sentence: sentence,
        paragraphIndex: para.paragraphIndex,
        paragraphText: para.text
      });
    });
  });
  
  rightSentencesByParagraph.forEach(para => {
    para.sentences.forEach(sentence => {
      allRightSentences.push({
        sentence: sentence,
        paragraphIndex: para.paragraphIndex,
        paragraphText: para.text
      });
    });
  });
  
  // Apply fuzzy matching algorithm
  const diff = [];
  const matchedSentences = {
    leftToRight: new Map(),
    rightToLeft: new Map()
  };
  const fuzzyMatchedPairs = []; // Store fuzzy matched pairs for inline diff
  
  // Store sentence information for renderer
  const sentenceInfo = {
    left: new Map(),
    right: new Map()
  };
  
  // Initialize sentence info maps
  leftSelectedParagraphs.forEach(idx => sentenceInfo.left.set(idx, []));
  rightSelectedParagraphs.forEach(idx => sentenceInfo.right.set(idx, []));
  
  // Populate sentence info
  allLeftSentences.forEach(item => {
    const para = item.paragraphText;
    const start = para.indexOf(item.sentence);
    if (start !== -1 && sentenceInfo.left.has(item.paragraphIndex)) {
      sentenceInfo.left.get(item.paragraphIndex).push({
        text: item.sentence,
        start: start,
        end: start + item.sentence.length
      });
    }
  });
  
  allRightSentences.forEach(item => {
    const para = item.paragraphText;
    const start = para.indexOf(item.sentence);
    if (start !== -1 && sentenceInfo.right.has(item.paragraphIndex)) {
      sentenceInfo.right.get(item.paragraphIndex).push({
        text: item.sentence,
        start: start,
        end: start + item.sentence.length
      });
    }
  });
  
  let oU = 0; // First unprocessed sentence in original (0-indexed)
  let rU = 0; // First unprocessed sentence in revised (0-indexed)
  const rightUsed = new Set(); // Track used right sentences
  
  while (oU < allLeftSentences.length) {
    let found = false;
    let fuzzyMatch = null;
    let fuzzyMatchIndex = -1;
    let bestSimilarity = 0;
    
    // First look for exact match
    for (let i = rU; i < allRightSentences.length; i++) {
      if (!rightUsed.has(i) && allRightSentences[i].sentence === allLeftSentences[oU].sentence) {
        // Found exact match
        rightUsed.add(i);
        
        // Store the matching relationship
        matchedSentences.leftToRight.set(
          `${allLeftSentences[oU].paragraphIndex}:${allLeftSentences[oU].sentence}`,
          `${allRightSentences[i].paragraphIndex}:${allRightSentences[i].sentence}`
        );
        matchedSentences.rightToLeft.set(
          `${allRightSentences[i].paragraphIndex}:${allRightSentences[i].sentence}`,
          `${allLeftSentences[oU].paragraphIndex}:${allLeftSentences[oU].sentence}`
        );
        
        // Add all unmatched right sentences before this as added
        for (let j = rU; j < i; j++) {
          if (!rightUsed.has(j)) {
            diff.push({
              value: allRightSentences[j].sentence,
              added: true,
              removed: false,
              paragraphIndex: allRightSentences[j].paragraphIndex,
              paragraphText: allRightSentences[j].paragraphText
            });
            rightUsed.add(j);
          }
        }
        
        // Add the matching sentence as unchanged
        diff.push({
          value: allLeftSentences[oU].sentence,
          added: false,
          removed: false,
          leftParagraphIndex: allLeftSentences[oU].paragraphIndex,
          rightParagraphIndex: allRightSentences[i].paragraphIndex
        });
        
        oU += 1;
        found = true;
        break;
      }
    }
    
    // If no exact match, look for fuzzy match
    if (!found) {
      for (let i = rU; i < allRightSentences.length; i++) {
        if (!rightUsed.has(i)) {
          const similarity = calculateSimilarity(allLeftSentences[oU].sentence, allRightSentences[i].sentence);
          if (similarity >= matchThreshold && similarity > bestSimilarity) {
            bestSimilarity = similarity;
            fuzzyMatch = allRightSentences[i];
            fuzzyMatchIndex = i;
          }
        }
      }
      
      if (fuzzyMatch) {
        // Found fuzzy match
        rightUsed.add(fuzzyMatchIndex);
        
        // Add all unmatched right sentences before this as added
        for (let j = rU; j < fuzzyMatchIndex; j++) {
          if (!rightUsed.has(j)) {
            diff.push({
              value: allRightSentences[j].sentence,
              added: true,
              removed: false,
              paragraphIndex: allRightSentences[j].paragraphIndex,
              paragraphText: allRightSentences[j].paragraphText
            });
            rightUsed.add(j);
          }
        }
        
        // Store fuzzy matched pair with word diff
        const wordDiff = getWordDiff(allLeftSentences[oU].sentence, fuzzyMatch.sentence);
        fuzzyMatchedPairs.push({
          left: {
            sentence: allLeftSentences[oU].sentence,
            paragraphIndex: allLeftSentences[oU].paragraphIndex,
            paragraphText: allLeftSentences[oU].paragraphText
          },
          right: {
            sentence: fuzzyMatch.sentence,
            paragraphIndex: fuzzyMatch.paragraphIndex,
            paragraphText: fuzzyMatch.paragraphText
          },
          wordDiff: wordDiff
        });
        
        // Store as matched for syncing
        matchedSentences.leftToRight.set(
          `${allLeftSentences[oU].paragraphIndex}:${allLeftSentences[oU].sentence}`,
          `${fuzzyMatch.paragraphIndex}:${fuzzyMatch.sentence}`
        );
        matchedSentences.rightToLeft.set(
          `${fuzzyMatch.paragraphIndex}:${fuzzyMatch.sentence}`,
          `${allLeftSentences[oU].paragraphIndex}:${allLeftSentences[oU].sentence}`
        );
        
        oU += 1;
        found = true;
      }
    }
    
    if (!found) {
      // No match found - mark original sentence as deleted
      diff.push({
        value: allLeftSentences[oU].sentence,
        removed: true,
        added: false,
        paragraphIndex: allLeftSentences[oU].paragraphIndex,
        paragraphText: allLeftSentences[oU].paragraphText
      });
      oU += 1;
    }
  }
  
  // Mark any remaining revised sentences as added
  for (let i = 0; i < allRightSentences.length; i++) {
    if (!rightUsed.has(i)) {
      diff.push({
        value: allRightSentences[i].sentence,
        added: true,
        removed: false,
        paragraphIndex: allRightSentences[i].paragraphIndex,
        paragraphText: allRightSentences[i].paragraphText
      });
    }
  }
  
  // Now convert to positioned diff - find positions within each paragraph
  const positionedDiff = [];
  
  // Process each diff part
  for (const part of diff) {
    if (part.removed) {
      // Find position within the paragraph
      const paragraphText = part.paragraphText;
      const sentenceStart = paragraphText.indexOf(part.value);
      
      if (sentenceStart !== -1) {
        // Calculate position relative to the concatenated selected text
        let globalStart = 0;
        for (let i = 0; i < leftSelectedParagraphs.length; i++) {
          if (leftSelectedParagraphs[i] === part.paragraphIndex) {
            globalStart += sentenceStart;
            break;
          }
          globalStart += (leftFullParagraphs[leftSelectedParagraphs[i]] || '').length + 1; // +1 for newline
        }
        
        positionedDiff.push({
          value: part.value,
          removed: true,
          added: false,
          start: globalStart,
          end: globalStart + part.value.length,
          side: 'left'
        });
      }
    } else if (part.added) {
      // Find position within the paragraph
      const paragraphText = part.paragraphText;
      const sentenceStart = paragraphText.indexOf(part.value);
      
      if (sentenceStart !== -1) {
        // Calculate position relative to the concatenated selected text
        let globalStart = 0;
        for (let i = 0; i < rightSelectedParagraphs.length; i++) {
          if (rightSelectedParagraphs[i] === part.paragraphIndex) {
            globalStart += sentenceStart;
            break;
          }
          globalStart += (rightFullParagraphs[rightSelectedParagraphs[i]] || '').length + 1; // +1 for newline
        }
        
        positionedDiff.push({
          value: part.value,
          added: true,
          removed: false,
          start: globalStart,
          end: globalStart + part.value.length,
          side: 'right'
        });
      }
    }
    // Unchanged sentences don't need position info for highlighting
  }
  
  return { 
    diff: positionedDiff, 
    matchedSentences: matchedSentences,
    sentenceInfo: sentenceInfo,
    fuzzyMatchedPairs: fuzzyMatchedPairs
  };
});

// Patience diff handler with exact matching
ipcMain.handle('diff-patience', async (event, leftSelectedText, rightSelectedText, leftSelectedParagraphs, rightSelectedParagraphs, leftFullText, rightFullText) => {
  // Split the full text into paragraphs
  const leftFullParagraphs = leftFullText.split(/\r\n|\r|\n/);
  const rightFullParagraphs = rightFullText.split(/\r\n|\r|\n/);
  
  // Get the selected paragraphs
  const leftSelectedTexts = leftSelectedParagraphs.map(i => leftFullParagraphs[i] || '');
  const rightSelectedTexts = rightSelectedParagraphs.map(i => rightFullParagraphs[i] || '');
  
  // First pass: Use array diff to match paragraphs
  // The diff package provides diffArrays which can be used for paragraph matching
  const paragraphDiff = Diff.diffArrays(leftSelectedTexts, rightSelectedTexts);
  
  // Build matched paragraph pairs
  const matchedParagraphPairs = [];
  const unmatchedLeft = new Set(leftSelectedParagraphs);
  const unmatchedRight = new Set(rightSelectedParagraphs);
  
  let leftOffset = 0;
  let rightOffset = 0;
  
  paragraphDiff.forEach(part => {
    if (!part.added && !part.removed) {
      // These paragraphs match between documents
      for (let i = 0; i < part.count; i++) {
        const leftIdx = leftSelectedParagraphs[leftOffset + i];
        const rightIdx = rightSelectedParagraphs[rightOffset + i];
        
        matchedParagraphPairs.push({
          left: leftIdx,
          right: rightIdx,
          leftText: leftFullParagraphs[leftIdx],
          rightText: rightFullParagraphs[rightIdx]
        });
        
        unmatchedLeft.delete(leftIdx);
        unmatchedRight.delete(rightIdx);
      }
      leftOffset += part.count;
      rightOffset += part.count;
    } else if (part.removed) {
      // These paragraphs were removed (only in left)
      leftOffset += part.count;
    } else if (part.added) {
      // These paragraphs were added (only in right)
      rightOffset += part.count;
    }
  });
  
  // Second pass: Apply sentence-level diffing within matched paragraphs
  const sentenceInfo = { left: new Map(), right: new Map() };
  const matchedSentences = { leftToRight: new Map(), rightToLeft: new Map() };
  const allDiffs = [];
  
  // Helper function to split into sentences (reuse from existing code)
  function splitIntoSentences(text) {
    if (!text.trim()) return [];
    
    const sentences = [];
    const doc = nlp(text);
    const nlpSentences = doc.sentences().out('array');
    
    const regexSentences = [];
    const sentenceRegex = /[^.!?]*[.!?]+(?:\s+|$)/g;
    let match;
    let lastEnd = 0;
    
    while ((match = sentenceRegex.exec(text)) !== null) {
      const sentence = match[0].trim();
      if (sentence) {
        regexSentences.push(sentence);
      }
      lastEnd = match.index + match[0].length;
    }
    
    if (lastEnd < text.length) {
      const remaining = text.substring(lastEnd).trim();
      if (remaining) {
        regexSentences.push(remaining);
      }
    }
    
    const sourceSentences = nlpSentences.length >= regexSentences.length ? nlpSentences : regexSentences;
    const seen = new Set();
    for (const sentence of sourceSentences) {
      const trimmed = sentence.trim();
      if (trimmed && !seen.has(trimmed)) {
        sentences.push(trimmed);
        seen.add(trimmed);
      }
    }
    
    if (sentences.length === 0 && text.trim()) {
      sentences.push(text.trim());
    }
    
    return sentences;
  }
  
  // Process matched paragraph pairs
  for (const pair of matchedParagraphPairs) {
    const leftSentences = splitIntoSentences(pair.leftText);
    const rightSentences = splitIntoSentences(pair.rightText);
    
    // Apply exact sentence matching within the paragraph pair
    let leftIndex = 0;
    let rightIndex = 0;
    
    while (leftIndex < leftSentences.length) {
      let found = false;
      
      for (let i = rightIndex; i < rightSentences.length; i++) {
        if (rightSentences[i] === leftSentences[leftIndex]) {
          // Found exact match
          const sentenceKey = `${pair.left}:${leftSentences[leftIndex]}`;
          const rightKey = `${pair.right}:${rightSentences[i]}`;
          
          matchedSentences.leftToRight.set(sentenceKey, rightKey);
          matchedSentences.rightToLeft.set(rightKey, sentenceKey);
          
          // Mark sentences before match as added
          for (let j = rightIndex; j < i; j++) {
            // Calculate position in selected text
            const globalStart = calculateGlobalPosition(pair.right, rightSentences[j], rightSelectedParagraphs, rightFullParagraphs);
            allDiffs.push({
              value: rightSentences[j],
              added: true,
              removed: false,
              start: globalStart,
              end: globalStart + rightSentences[j].length,
              side: 'right'
            });
          }
          
          leftIndex++;
          rightIndex = i + 1;
          found = true;
          break;
        }
      }
      
      if (!found) {
        // No match found - mark as deleted
        const globalStart = calculateGlobalPosition(pair.left, leftSentences[leftIndex], leftSelectedParagraphs, leftFullParagraphs);
        allDiffs.push({
          value: leftSentences[leftIndex],
          removed: true,
          added: false,
          start: globalStart,
          end: globalStart + leftSentences[leftIndex].length,
          side: 'left'
        });
        leftIndex++;
      }
    }
    
    // Mark remaining right sentences as added
    while (rightIndex < rightSentences.length) {
      const globalStart = calculateGlobalPosition(pair.right, rightSentences[rightIndex], rightSelectedParagraphs, rightFullParagraphs);
      allDiffs.push({
        value: rightSentences[rightIndex],
        added: true,
        removed: false,
        start: globalStart,
        end: globalStart + rightSentences[rightIndex].length,
        side: 'right'
      });
      rightIndex++;
    }
    
    // Store sentence info
    if (!sentenceInfo.left.has(pair.left)) {
      sentenceInfo.left.set(pair.left, []);
    }
    if (!sentenceInfo.right.has(pair.right)) {
      sentenceInfo.right.set(pair.right, []);
    }
    
    leftSentences.forEach(sentence => {
      const start = pair.leftText.indexOf(sentence);
      if (start !== -1) {
        sentenceInfo.left.get(pair.left).push({
          text: sentence,
          start: start,
          end: start + sentence.length
        });
      }
    });
    
    rightSentences.forEach(sentence => {
      const start = pair.rightText.indexOf(sentence);
      if (start !== -1) {
        sentenceInfo.right.get(pair.right).push({
          text: sentence,
          start: start,
          end: start + sentence.length
        });
      }
    });
  }
  
  // Process unmatched paragraphs as whole units
  unmatchedLeft.forEach(paragraphIndex => {
    const text = leftFullParagraphs[paragraphIndex];
    if (text.trim()) {
      const globalStart = calculateGlobalPositionForParagraph(paragraphIndex, leftSelectedParagraphs, leftFullParagraphs);
      allDiffs.push({
        value: text,
        removed: true,
        added: false,
        start: globalStart,
        end: globalStart + text.length,
        side: 'left'
      });
    }
  });
  
  unmatchedRight.forEach(paragraphIndex => {
    const text = rightFullParagraphs[paragraphIndex];
    if (text.trim()) {
      const globalStart = calculateGlobalPositionForParagraph(paragraphIndex, rightSelectedParagraphs, rightFullParagraphs);
      allDiffs.push({
        value: text,
        added: true,
        removed: false,
        start: globalStart,
        end: globalStart + text.length,
        side: 'right'
      });
    }
  });
  
  // Helper function to calculate position
  function calculateGlobalPosition(paragraphIndex, sentence, selectedParagraphs, fullParagraphs) {
    let globalStart = 0;
    for (let i = 0; i < selectedParagraphs.length; i++) {
      if (selectedParagraphs[i] === paragraphIndex) {
        const paragraphText = fullParagraphs[paragraphIndex];
        const sentenceStart = paragraphText.indexOf(sentence);
        globalStart += sentenceStart;
        break;
      }
      globalStart += (fullParagraphs[selectedParagraphs[i]] || '').length + 1;
    }
    return globalStart;
  }
  
  function calculateGlobalPositionForParagraph(paragraphIndex, selectedParagraphs, fullParagraphs) {
    let globalStart = 0;
    for (let i = 0; i < selectedParagraphs.length; i++) {
      if (selectedParagraphs[i] === paragraphIndex) {
        break;
      }
      globalStart += (fullParagraphs[selectedParagraphs[i]] || '').length + 1;
    }
    return globalStart;
  }
  
  return {
    diff: allDiffs,
    matchedSentences: matchedSentences,
    sentenceInfo: sentenceInfo
  };
});

// Patience diff handler with fuzzy matching
ipcMain.handle('diff-patience-fuzzy', async (event, leftSelectedText, rightSelectedText, leftSelectedParagraphs, rightSelectedParagraphs, leftFullText, rightFullText, matchThreshold) => {
  // Split the full text into paragraphs
  const leftFullParagraphs = leftFullText.split(/\r\n|\r|\n/);
  const rightFullParagraphs = rightFullText.split(/\r\n|\r|\n/);
  
  // Get the selected paragraphs
  const leftSelectedTexts = leftSelectedParagraphs.map(i => leftFullParagraphs[i] || '');
  const rightSelectedTexts = rightSelectedParagraphs.map(i => rightFullParagraphs[i] || '');
  
  // First pass: Use array diff to match paragraphs (same as exact patience)
  const paragraphDiff = Diff.diffArrays(leftSelectedTexts, rightSelectedTexts);
  
  // Build matched paragraph pairs
  const matchedParagraphPairs = [];
  const unmatchedLeft = new Set(leftSelectedParagraphs);
  const unmatchedRight = new Set(rightSelectedParagraphs);
  
  let leftOffset = 0;
  let rightOffset = 0;
  
  paragraphDiff.forEach(part => {
    if (!part.added && !part.removed) {
      // These paragraphs match between documents
      for (let i = 0; i < part.count; i++) {
        const leftIdx = leftSelectedParagraphs[leftOffset + i];
        const rightIdx = rightSelectedParagraphs[rightOffset + i];
        
        matchedParagraphPairs.push({
          left: leftIdx,
          right: rightIdx,
          leftText: leftFullParagraphs[leftIdx],
          rightText: rightFullParagraphs[rightIdx]
        });
        
        unmatchedLeft.delete(leftIdx);
        unmatchedRight.delete(rightIdx);
      }
      leftOffset += part.count;
      rightOffset += part.count;
    } else if (part.removed) {
      leftOffset += part.count;
    } else if (part.added) {
      rightOffset += part.count;
    }
  });
  
  // Second pass: Apply fuzzy sentence matching within matched paragraphs
  const sentenceInfo = { left: new Map(), right: new Map() };
  const matchedSentences = { leftToRight: new Map(), rightToLeft: new Map() };
  const allDiffs = [];
  const fuzzyMatchedPairs = [];
  
  // Helper functions (reuse from existing code)
  function splitIntoSentences(text) {
    if (!text.trim()) return [];
    
    const sentences = [];
    const doc = nlp(text);
    const nlpSentences = doc.sentences().out('array');
    
    const regexSentences = [];
    const sentenceRegex = /[^.!?]*[.!?]+(?:\s+|$)/g;
    let match;
    let lastEnd = 0;
    
    while ((match = sentenceRegex.exec(text)) !== null) {
      const sentence = match[0].trim();
      if (sentence) {
        regexSentences.push(sentence);
      }
      lastEnd = match.index + match[0].length;
    }
    
    if (lastEnd < text.length) {
      const remaining = text.substring(lastEnd).trim();
      if (remaining) {
        regexSentences.push(remaining);
      }
    }
    
    const sourceSentences = nlpSentences.length >= regexSentences.length ? nlpSentences : regexSentences;
    const seen = new Set();
    for (const sentence of sourceSentences) {
      const trimmed = sentence.trim();
      if (trimmed && !seen.has(trimmed)) {
        sentences.push(trimmed);
        seen.add(trimmed);
      }
    }
    
    if (sentences.length === 0 && text.trim()) {
      sentences.push(text.trim());
    }
    
    return sentences;
  }
  
  function calculateSimilarity(s1, s2) {
    const words1 = s1.toLowerCase().split(/\s+/);
    const words2 = s2.toLowerCase().split(/\s+/);
    
    const set1 = new Set(words1);
    const set2 = new Set(words2);
    
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return intersection.size / union.size;
  }
  
  function getWordDiff(s1, s2) {
    const words1 = s1.split(/\s+/);
    const words2 = s2.split(/\s+/);
    
    const diff = [];
    let i = 0, j = 0;
    
    while (i < words1.length || j < words2.length) {
      if (i >= words1.length) {
        diff.push({ type: 'added', value: words2.slice(j).join(' ') });
        break;
      } else if (j >= words2.length) {
        diff.push({ type: 'deleted', value: words1.slice(i).join(' ') });
        break;
      } else if (words1[i] === words2[j]) {
        diff.push({ type: 'unchanged', value: words1[i] });
        i++;
        j++;
      } else {
        let nextMatchI = -1;
        let nextMatchJ = -1;
        
        for (let li = i + 1; li < Math.min(i + 5, words1.length); li++) {
          for (let lj = j + 1; lj < Math.min(j + 5, words2.length); lj++) {
            if (words1[li] === words2[lj]) {
              nextMatchI = li;
              nextMatchJ = lj;
              break;
            }
          }
          if (nextMatchI !== -1) break;
        }
        
        if (nextMatchI !== -1) {
          if (nextMatchI > i) {
            diff.push({ type: 'deleted', value: words1.slice(i, nextMatchI).join(' ') });
          }
          if (nextMatchJ > j) {
            diff.push({ type: 'added', value: words2.slice(j, nextMatchJ).join(' ') });
          }
          i = nextMatchI;
          j = nextMatchJ;
        } else {
          diff.push({ type: 'deleted', value: words1.slice(i).join(' ') });
          diff.push({ type: 'added', value: words2.slice(j).join(' ') });
          break;
        }
      }
    }
    
    return diff;
  }
  
  // Process matched paragraph pairs with fuzzy sentence matching
  for (const pair of matchedParagraphPairs) {
    const leftSentences = splitIntoSentences(pair.leftText);
    const rightSentences = splitIntoSentences(pair.rightText);
    
    const rightUsed = new Set();
    let leftIndex = 0;
    
    while (leftIndex < leftSentences.length) {
      let found = false;
      let fuzzyMatch = null;
      let fuzzyMatchIndex = -1;
      let bestSimilarity = 0;
      
      // First look for exact match
      for (let i = 0; i < rightSentences.length; i++) {
        if (!rightUsed.has(i) && rightSentences[i] === leftSentences[leftIndex]) {
          // Found exact match
          const sentenceKey = `${pair.left}:${leftSentences[leftIndex]}`;
          const rightKey = `${pair.right}:${rightSentences[i]}`;
          
          matchedSentences.leftToRight.set(sentenceKey, rightKey);
          matchedSentences.rightToLeft.set(rightKey, sentenceKey);
          
          rightUsed.add(i);
          leftIndex++;
          found = true;
          break;
        }
      }
      
      // If no exact match, look for fuzzy match
      if (!found) {
        for (let i = 0; i < rightSentences.length; i++) {
          if (!rightUsed.has(i)) {
            const similarity = calculateSimilarity(leftSentences[leftIndex], rightSentences[i]);
            if (similarity >= matchThreshold && similarity > bestSimilarity) {
              bestSimilarity = similarity;
              fuzzyMatch = rightSentences[i];
              fuzzyMatchIndex = i;
            }
          }
        }
        
        if (fuzzyMatch) {
          // Found fuzzy match
          rightUsed.add(fuzzyMatchIndex);
          
          // Store fuzzy matched pair with word diff
          const wordDiff = getWordDiff(leftSentences[leftIndex], fuzzyMatch);
          fuzzyMatchedPairs.push({
            left: {
              sentence: leftSentences[leftIndex],
              paragraphIndex: pair.left,
              paragraphText: pair.leftText
            },
            right: {
              sentence: fuzzyMatch,
              paragraphIndex: pair.right,
              paragraphText: pair.rightText
            },
            wordDiff: wordDiff
          });
          
          // Store as matched for syncing
          const sentenceKey = `${pair.left}:${leftSentences[leftIndex]}`;
          const rightKey = `${pair.right}:${fuzzyMatch}`;
          matchedSentences.leftToRight.set(sentenceKey, rightKey);
          matchedSentences.rightToLeft.set(rightKey, sentenceKey);
          
          leftIndex++;
          found = true;
        }
      }
      
      if (!found) {
        // No match found - mark as deleted
        const globalStart = calculateGlobalPosition(pair.left, leftSentences[leftIndex], leftSelectedParagraphs, leftFullParagraphs);
        allDiffs.push({
          value: leftSentences[leftIndex],
          removed: true,
          added: false,
          start: globalStart,
          end: globalStart + leftSentences[leftIndex].length,
          side: 'left'
        });
        leftIndex++;
      }
    }
    
    // Mark unmatched right sentences as added
    for (let i = 0; i < rightSentences.length; i++) {
      if (!rightUsed.has(i)) {
        const globalStart = calculateGlobalPosition(pair.right, rightSentences[i], rightSelectedParagraphs, rightFullParagraphs);
        allDiffs.push({
          value: rightSentences[i],
          added: true,
          removed: false,
          start: globalStart,
          end: globalStart + rightSentences[i].length,
          side: 'right'
        });
      }
    }
    
    // Store sentence info
    if (!sentenceInfo.left.has(pair.left)) {
      sentenceInfo.left.set(pair.left, []);
    }
    if (!sentenceInfo.right.has(pair.right)) {
      sentenceInfo.right.set(pair.right, []);
    }
    
    leftSentences.forEach(sentence => {
      const start = pair.leftText.indexOf(sentence);
      if (start !== -1) {
        sentenceInfo.left.get(pair.left).push({
          text: sentence,
          start: start,
          end: start + sentence.length
        });
      }
    });
    
    rightSentences.forEach(sentence => {
      const start = pair.rightText.indexOf(sentence);
      if (start !== -1) {
        sentenceInfo.right.get(pair.right).push({
          text: sentence,
          start: start,
          end: start + sentence.length
        });
      }
    });
  }
  
  // Process unmatched paragraphs with sentence-level fuzzy matching
  // Collect all unmatched paragraphs for cross-comparison
  const unmatchedLeftParagraphs = Array.from(unmatchedLeft).map(idx => ({
    index: idx,
    text: leftFullParagraphs[idx],
    sentences: splitIntoSentences(leftFullParagraphs[idx])
  }));
  
  const unmatchedRightParagraphs = Array.from(unmatchedRight).map(idx => ({
    index: idx,
    text: rightFullParagraphs[idx],
    sentences: splitIntoSentences(rightFullParagraphs[idx])
  }));
  
  // Collect all sentences from unmatched paragraphs
  const unmatchedLeftSentences = [];
  const unmatchedRightSentences = [];
  
  unmatchedLeftParagraphs.forEach(para => {
    para.sentences.forEach(sentence => {
      unmatchedLeftSentences.push({
        sentence: sentence,
        paragraphIndex: para.index,
        paragraphText: para.text
      });
    });
  });
  
  unmatchedRightParagraphs.forEach(para => {
    para.sentences.forEach(sentence => {
      unmatchedRightSentences.push({
        sentence: sentence,
        paragraphIndex: para.index,
        paragraphText: para.text
      });
    });
  });
  
  // Apply fuzzy matching between sentences from unmatched paragraphs
  const rightUsed = new Set();
  
  for (let i = 0; i < unmatchedLeftSentences.length; i++) {
    const leftItem = unmatchedLeftSentences[i];
    let found = false;
    let fuzzyMatch = null;
    let fuzzyMatchIndex = -1;
    let bestSimilarity = 0;
    
    // First look for exact match
    for (let j = 0; j < unmatchedRightSentences.length; j++) {
      if (!rightUsed.has(j) && unmatchedRightSentences[j].sentence === leftItem.sentence) {
        // Found exact match
        const sentenceKey = `${leftItem.paragraphIndex}:${leftItem.sentence}`;
        const rightKey = `${unmatchedRightSentences[j].paragraphIndex}:${unmatchedRightSentences[j].sentence}`;
        
        matchedSentences.leftToRight.set(sentenceKey, rightKey);
        matchedSentences.rightToLeft.set(rightKey, sentenceKey);
        
        rightUsed.add(j);
        found = true;
        break;
      }
    }
    
    // If no exact match, look for fuzzy match
    if (!found) {
      for (let j = 0; j < unmatchedRightSentences.length; j++) {
        if (!rightUsed.has(j)) {
          const similarity = calculateSimilarity(leftItem.sentence, unmatchedRightSentences[j].sentence);
          if (similarity >= matchThreshold && similarity > bestSimilarity) {
            bestSimilarity = similarity;
            fuzzyMatch = unmatchedRightSentences[j];
            fuzzyMatchIndex = j;
          }
        }
      }
      
      if (fuzzyMatch) {
        // Found fuzzy match
        rightUsed.add(fuzzyMatchIndex);
        
        // Store fuzzy matched pair with word diff
        const wordDiff = getWordDiff(leftItem.sentence, fuzzyMatch.sentence);
        fuzzyMatchedPairs.push({
          left: leftItem,
          right: fuzzyMatch,
          wordDiff: wordDiff
        });
        
        // Store as matched for syncing
        const sentenceKey = `${leftItem.paragraphIndex}:${leftItem.sentence}`;
        const rightKey = `${fuzzyMatch.paragraphIndex}:${fuzzyMatch.sentence}`;
        matchedSentences.leftToRight.set(sentenceKey, rightKey);
        matchedSentences.rightToLeft.set(rightKey, sentenceKey);
        
        found = true;
      }
    }
    
    if (!found) {
      // No match found - mark sentence as deleted
      const globalStart = calculateGlobalPosition(leftItem.paragraphIndex, leftItem.sentence, leftSelectedParagraphs, leftFullParagraphs);
      allDiffs.push({
        value: leftItem.sentence,
        removed: true,
        added: false,
        start: globalStart,
        end: globalStart + leftItem.sentence.length,
        side: 'left'
      });
    }
  }
  
  // Mark unmatched right sentences as added
  for (let j = 0; j < unmatchedRightSentences.length; j++) {
    if (!rightUsed.has(j)) {
      const rightItem = unmatchedRightSentences[j];
      const globalStart = calculateGlobalPosition(rightItem.paragraphIndex, rightItem.sentence, rightSelectedParagraphs, rightFullParagraphs);
      allDiffs.push({
        value: rightItem.sentence,
        added: true,
        removed: false,
        start: globalStart,
        end: globalStart + rightItem.sentence.length,
        side: 'right'
      });
    }
  }
  
  // Update sentence info for unmatched paragraphs
  unmatchedLeftParagraphs.forEach(para => {
    if (!sentenceInfo.left.has(para.index)) {
      sentenceInfo.left.set(para.index, []);
    }
    para.sentences.forEach(sentence => {
      const start = para.text.indexOf(sentence);
      if (start !== -1) {
        sentenceInfo.left.get(para.index).push({
          text: sentence,
          start: start,
          end: start + sentence.length
        });
      }
    });
  });
  
  unmatchedRightParagraphs.forEach(para => {
    if (!sentenceInfo.right.has(para.index)) {
      sentenceInfo.right.set(para.index, []);
    }
    para.sentences.forEach(sentence => {
      const start = para.text.indexOf(sentence);
      if (start !== -1) {
        sentenceInfo.right.get(para.index).push({
          text: sentence,
          start: start,
          end: start + sentence.length
        });
      }
    });
  });
  
  // Helper functions
  function calculateGlobalPosition(paragraphIndex, sentence, selectedParagraphs, fullParagraphs) {
    let globalStart = 0;
    for (let i = 0; i < selectedParagraphs.length; i++) {
      if (selectedParagraphs[i] === paragraphIndex) {
        const paragraphText = fullParagraphs[paragraphIndex];
        const sentenceStart = paragraphText.indexOf(sentence);
        globalStart += sentenceStart;
        break;
      }
      globalStart += (fullParagraphs[selectedParagraphs[i]] || '').length + 1;
    }
    return globalStart;
  }
  
  function calculateGlobalPositionForParagraph(paragraphIndex, selectedParagraphs, fullParagraphs) {
    let globalStart = 0;
    for (let i = 0; i < selectedParagraphs.length; i++) {
      if (selectedParagraphs[i] === paragraphIndex) {
        break;
      }
      globalStart += (fullParagraphs[selectedParagraphs[i]] || '').length + 1;
    }
    return globalStart;
  }
  
  return {
    diff: allDiffs,
    matchedSentences: matchedSentences,
    sentenceInfo: sentenceInfo,
    fuzzyMatchedPairs: fuzzyMatchedPairs
  };
});

// Paragraph matching handlers with algorithm support
ipcMain.handle('match-paragraphs-thomas', async (event, leftText, rightText, matchThreshold) => {
  // Split into paragraphs
  const leftParagraphs = leftText.split(/\r\n|\r|\n/);
  const rightParagraphs = rightText.split(/\r\n|\r|\n/);
  
  const result = {
    exactMatches: [],
    fuzzyMatches: [],
    unmatchedLeft: new Set(),
    unmatchedRight: new Set()
  };
  
  // Initialize all as unmatched
  leftParagraphs.forEach((_, idx) => result.unmatchedLeft.add(idx));
  rightParagraphs.forEach((_, idx) => result.unmatchedRight.add(idx));
  
  // Helper function to calculate paragraph similarity
  function calculateParagraphSimilarity(p1, p2) {
    if (!p1.trim() || !p2.trim()) return 0;
    
    const words1 = p1.toLowerCase().split(/\s+/).filter(w => w.length > 0);
    const words2 = p2.toLowerCase().split(/\s+/).filter(w => w.length > 0);
    
    const set1 = new Set(words1);
    const set2 = new Set(words2);
    
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return union.size > 0 ? intersection.size / union.size : 0;
  }
  
  // First pass: Find exact matches
  let leftIndex = 0;
  let rightIndex = 0;
  
  while (leftIndex < leftParagraphs.length) {
    let found = false;
    
    for (let i = rightIndex; i < rightParagraphs.length; i++) {
      if (rightParagraphs[i] === leftParagraphs[leftIndex] && leftParagraphs[leftIndex].trim() !== '') {
        // Exact match found
        result.exactMatches.push({
          left: leftIndex,
          right: i,
          similarity: 1.0
        });
        
        result.unmatchedLeft.delete(leftIndex);
        result.unmatchedRight.delete(i);
        
        // Mark any skipped paragraphs
        for (let j = rightIndex; j < i; j++) {
          if (!result.unmatchedRight.has(j)) continue;
          // These remain in unmatchedRight
        }
        
        leftIndex++;
        rightIndex = i + 1;
        found = true;
        break;
      }
    }
    
    if (!found) {
      leftIndex++;
    }
  }
  
  // Second pass: Find fuzzy matches if threshold > 0
  if (matchThreshold < 1.0) {
    const unmatchedLeftArray = Array.from(result.unmatchedLeft);
    const unmatchedRightArray = Array.from(result.unmatchedRight);
    const rightUsed = new Set();
    
    for (const leftIdx of unmatchedLeftArray) {
      const leftPara = leftParagraphs[leftIdx];
      if (!leftPara.trim()) continue;
      
      let bestMatch = null;
      let bestSimilarity = 0;
      
      for (const rightIdx of unmatchedRightArray) {
        if (rightUsed.has(rightIdx)) continue;
        
        const rightPara = rightParagraphs[rightIdx];
        if (!rightPara.trim()) continue;
        
        const similarity = calculateParagraphSimilarity(leftPara, rightPara);
        
        if (similarity >= matchThreshold && similarity > bestSimilarity) {
          bestMatch = rightIdx;
          bestSimilarity = similarity;
        }
      }
      
      if (bestMatch !== null) {
        result.fuzzyMatches.push({
          left: leftIdx,
          right: bestMatch,
          similarity: bestSimilarity
        });
        
        result.unmatchedLeft.delete(leftIdx);
        result.unmatchedRight.delete(bestMatch);
        rightUsed.add(bestMatch);
      }
    }
  }
  
  return result;
});

ipcMain.handle('match-paragraphs-patience', async (event, leftText, rightText, matchThreshold) => {
  // Split into paragraphs
  const leftParagraphs = leftText.split(/\r\n|\r|\n/);
  const rightParagraphs = rightText.split(/\r\n|\r|\n/);
  
  // Use diff-match-patch library for Patience algorithm
  const Diff = require('diff');
  const paragraphDiff = Diff.diffArrays(leftParagraphs, rightParagraphs);
  
  const result = {
    exactMatches: [],
    fuzzyMatches: [],
    unmatchedLeft: new Set(),
    unmatchedRight: new Set()
  };
  
  let leftOffset = 0;
  let rightOffset = 0;
  
  paragraphDiff.forEach(part => {
    if (!part.added && !part.removed) {
      // These paragraphs match exactly
      for (let i = 0; i < part.count; i++) {
        const leftIdx = leftOffset + i;
        const rightIdx = rightOffset + i;
        
        if (leftParagraphs[leftIdx].trim()) {
          result.exactMatches.push({
            left: leftIdx,
            right: rightIdx,
            similarity: 1.0
          });
        }
      }
      leftOffset += part.count;
      rightOffset += part.count;
    } else if (part.removed) {
      // Paragraphs only in left
      for (let i = 0; i < part.count; i++) {
        result.unmatchedLeft.add(leftOffset + i);
      }
      leftOffset += part.count;
    } else if (part.added) {
      // Paragraphs only in right
      for (let i = 0; i < part.count; i++) {
        result.unmatchedRight.add(rightOffset + i);
      }
      rightOffset += part.count;
    }
  });
  
  // Apply fuzzy matching to unmatched paragraphs if threshold < 1.0
  if (matchThreshold < 1.0) {
    // Reuse the same fuzzy matching logic from Thomas algorithm
    const unmatchedLeftArray = Array.from(result.unmatchedLeft);
    const unmatchedRightArray = Array.from(result.unmatchedRight);
    const rightUsed = new Set();
    
    function calculateParagraphSimilarity(p1, p2) {
      if (!p1.trim() || !p2.trim()) return 0;
      
      const words1 = p1.toLowerCase().split(/\s+/).filter(w => w.length > 0);
      const words2 = p2.toLowerCase().split(/\s+/).filter(w => w.length > 0);
      
      const set1 = new Set(words1);
      const set2 = new Set(words2);
      
      const intersection = new Set([...set1].filter(x => set2.has(x)));
      const union = new Set([...set1, ...set2]);
      
      return union.size > 0 ? intersection.size / union.size : 0;
    }
    
    for (const leftIdx of unmatchedLeftArray) {
      const leftPara = leftParagraphs[leftIdx];
      if (!leftPara.trim()) continue;
      
      let bestMatch = null;
      let bestSimilarity = 0;
      
      for (const rightIdx of unmatchedRightArray) {
        if (rightUsed.has(rightIdx)) continue;
        
        const rightPara = rightParagraphs[rightIdx];
        if (!rightPara.trim()) continue;
        
        const similarity = calculateParagraphSimilarity(leftPara, rightPara);
        
        if (similarity >= matchThreshold && similarity > bestSimilarity) {
          bestMatch = rightIdx;
          bestSimilarity = similarity;
        }
      }
      
      if (bestMatch !== null) {
        result.fuzzyMatches.push({
          left: leftIdx,
          right: bestMatch,
          similarity: bestSimilarity
        });
        
        result.unmatchedLeft.delete(leftIdx);
        result.unmatchedRight.delete(bestMatch);
        rightUsed.add(bestMatch);
      }
    }
  }
  
  return result;
});

// IPC handler for clipboard operations
ipcMain.handle('copy-to-clipboard', async (event, text) => {
  clipboard.writeText(text);
  return true;
});

ipcMain.handle('append-to-clipboard', async (event, text) => {
  const currentText = clipboard.readText();
  clipboard.writeText(currentText + text);
  return true;
});

ipcMain.handle('get-clipboard-text', async () => {
  return clipboard.readText();
});

// IPC handler for zoom operations
ipcMain.handle('set-zoom', async (event, zoomLevel) => {
  currentZoom = zoomLevel;
  mainWindow.webContents.setZoomFactor(currentZoom);
});

// IPC handlers for state persistence
ipcMain.handle('save-state', async (event, state) => {
  const userDataPath = app.getPath('userData');
  const statePath = path.join(userDataPath, 'differon-state.json');
  try {
    await fs.writeFile(statePath, JSON.stringify(state, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving state:', error);
    return false;
  }
});

ipcMain.handle('load-state', async () => {
  const userDataPath = app.getPath('userData');
  const statePath = path.join(userDataPath, 'differon-state.json');
  try {
    const data = await fs.readFile(statePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return null;
  }
});

// IPC handler for app info
ipcMain.handle('get-app-info', async () => {
  return {
    name: packageInfo.name,
    version: packageInfo.version
  };
});

// IPC handler for getting config
ipcMain.handle('get-config', async () => {
  return config;
});

// IPC handler for opening file dialog
ipcMain.on('open-file-dialog', async (event, side) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Text Files', extensions: ['txt', 'md', 'js', 'html', 'css', 'json', 'xml'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  if (!result.canceled) {
    mainWindow.webContents.send('file-opened', { side: side, path: result.filePaths[0] });
  }
});

app.whenReady().then(async () => {
  await loadConfig();
  await loadWindowState();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});