const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('api', {
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  onFileOpened: (callback) => ipcRenderer.on('file-opened', (event, data) => callback(data)),
  onFileOpenedNewTab: (callback) => ipcRenderer.on('file-opened-new-tab', (event, data) => callback(data)),
  onPasteContent: (callback) => ipcRenderer.on('paste-content', (event, data) => callback(data)),
  onRestoreState: (callback) => ipcRenderer.on('restore-state', () => callback()),
  onNewTab: (callback) => ipcRenderer.on('new-tab', () => callback()),
  onCloseTab: (callback) => ipcRenderer.on('close-tab', () => callback()),
  onNextTab: (callback) => ipcRenderer.on('next-tab', () => callback()),
  onPreviousTab: (callback) => ipcRenderer.on('previous-tab', () => callback()),
  openFileDialog: (side) => ipcRenderer.send('open-file-dialog', side),
  platform: process.platform,
  // Natural language diff functionality
  diffSentence: (left, right, leftParagraphs, rightParagraphs, leftFull, rightFull) => ipcRenderer.invoke('diff-sentence', left, right, leftParagraphs, rightParagraphs, leftFull, rightFull),
  diffFuzzySentence: (left, right, leftParagraphs, rightParagraphs, leftFull, rightFull, threshold) => ipcRenderer.invoke('diff-fuzzy-sentence', left, right, leftParagraphs, rightParagraphs, leftFull, rightFull, threshold),
  diffParagraph: (left, right) => ipcRenderer.invoke('diff-paragraph', left, right),
  diffPatience: (left, right, leftParagraphs, rightParagraphs, leftFull, rightFull) => ipcRenderer.invoke('diff-patience', left, right, leftParagraphs, rightParagraphs, leftFull, rightFull),
  diffPatienceFuzzy: (left, right, leftParagraphs, rightParagraphs, leftFull, rightFull, threshold) => ipcRenderer.invoke('diff-patience-fuzzy', left, right, leftParagraphs, rightParagraphs, leftFull, rightFull, threshold),
  // Paragraph matching with algorithm support
  matchParagraphsThomas: (left, right, threshold) => ipcRenderer.invoke('match-paragraphs-thomas', left, right, threshold),
  matchParagraphsPatience: (left, right, threshold) => ipcRenderer.invoke('match-paragraphs-patience', left, right, threshold),
  // Clipboard functionality
  copyToClipboard: (text) => ipcRenderer.invoke('copy-to-clipboard', text),
  appendToClipboard: (text) => ipcRenderer.invoke('append-to-clipboard', text),
  getClipboardText: () => ipcRenderer.invoke('get-clipboard-text'),
  // Zoom functionality
  setZoom: (level) => ipcRenderer.invoke('set-zoom', level),
  // State persistence
  saveState: (state) => ipcRenderer.invoke('save-state', state),
  loadState: () => ipcRenderer.invoke('load-state'),
  // App info - these will be filled by main process
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  // Config
  getConfig: () => ipcRenderer.invoke('get-config'),
  // Modular diff system
  getAlgorithms: (type) => ipcRenderer.invoke('get-algorithms', type),
  diffParagraphModular: (left, right, algorithm, options) => ipcRenderer.invoke('diff-paragraph-modular', left, right, algorithm, options),
  diffSentenceModular: (left, right, algorithm, options) => ipcRenderer.invoke('diff-sentence-modular', left, right, algorithm, options),
  // Console logging to stdout
  consoleLog: (...args) => ipcRenderer.send('console-log', ...args),
  consoleWarn: (...args) => ipcRenderer.send('console-warn', ...args),
  consoleError: (...args) => ipcRenderer.send('console-error', ...args)
});