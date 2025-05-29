# Differon - Natural Language File Comparison Application
## Requirements Specification v2.0

## 1. Overview

### 1.1 Purpose
Differon is a desktop file comparison application specifically designed for comparing written text documents. Unlike traditional diff tools designed for code, Differon uses natural language processing techniques to provide meaningful comparisons of prose, articles, stories, and other written content.

### 1.2 Key Principles
- **Natural Language Focus**: All diff algorithms are optimized for written language rather than code
- **Visual Clarity**: Changes are displayed with clear visual indicators including colors and change bars
- **User Control**: Users can select specific portions of text to compare and customize visualization colors
- **Multi-Document Support**: Users can work with multiple documents simultaneously through a tab interface
- **Persistence**: Application state and window geometry are preserved between sessions
- **Runtime Configuration**: Key constants can be adjusted via configuration file

### 1.3 Terminology
- **Paragraph**: Any sequence of text between line ending markers (newline, carriage return, or CRLF). This includes blank paragraphs (empty lines). In this application, what might traditionally be called a "line" is referred to as a "paragraph" for consistency with the NLP processing approach.
- **Sentence**: A grammatical unit detected by NLP within paragraphs, ending with punctuation marks (. ! ?) or other sentence boundaries.
- **Line Ending Markers**: The application automatically handles different line ending styles (LF, CR, CRLF) transparently.
- **Fuzzy Matching**: Algorithm that identifies similar (but not identical) sentences based on word overlap percentage.
- **Tab**: A document container that holds one file or pasted content, allowing multiple documents per pane.

## 2. Core Features

### 2.1 Multi-Document Tab System
- **Tab Support**: Each pane (Original/Revised) supports up to 20 simultaneous documents
- **Tab Bar**: Located at the top of each pane, showing all open documents
- **Tab Titles**: Display filename (or "Untitled" for new tabs, "Pasted at [timestamp]" for pasted content)
- **Modified Indicator**: Asterisk (*) appears after tab title when document has unsaved changes
- **Tab Switching**: Click on tab to switch between documents
- **Tab Closing**: X button on each tab (cannot close last remaining tab - clears content instead)
- **Tab Scrolling**: Horizontal scrolling when tabs overflow the available width
- **Active Tab Highlighting**: Currently active tab has distinct visual styling

### 2.2 Document Loading
- **Drag and Drop**: Users can drag files from the file system onto any area of the application window
- **File Menu**: 
  - "Open Original" (Ctrl+O)
  - "Open Revised" (Ctrl+Shift+O)
  - "Open Original in New Tab" (Ctrl+Shift+T)
  - "Open Revised in New Tab"
- **Browse Button**: Click "Click to Browse for a File" button in empty document
- **Paste Support**: 
  - Ctrl+V to paste content into left pane
  - Ctrl+Shift+V to paste content into right pane
  - "Click to Paste Clipboard Contents" button in empty document
- **Supported Formats**: All text file types (.txt, .md, .js, .html, .css, .json, .xml, etc.)
- **New Tab Creation**: 
  - "+" button in tab bar
  - Ctrl+T creates new tab in focused pane
  - File menu "New Tab" option

### 2.3 Tab Management
- **Move Between Panes**: Arrow button (→ or ←) moves active tab to opposite pane
- **Close Tab**: 
  - X button on tab
  - Ctrl+W closes active tab in focused pane
- **Tab Navigation**:
  - Ctrl+Tab: Next tab
  - Ctrl+Shift+Tab: Previous tab
  - Edit menu options for navigation
- **Single Tab Behavior**: When only one tab remains, close operation clears content instead of removing tab

### 2.4 Automatic Paragraph-Level Diff
- **Automatic Execution**: When two documents are loaded, a paragraph-level diff automatically runs
- **Change Bars**: Modified paragraphs display a 3-pixel vertical bar on the left edge:
  - Deleted paragraphs (in original): Use deletion highlight color
  - Added paragraphs (in revised): Use addition highlight color
  - Bar is separated from text by 0.5em spacing
- **Persistence**: Change bars remain visible at all times (not affected by Compare button)
- **Tab Context**: Paragraph diff runs when switching tabs if both sides have content

### 2.5 Paragraph Matching and Synchronization
- **Matched Paragraphs**: Paragraphs that exist identically in both documents are marked as "matched"
- **Visual Indicators for Matched Paragraphs**:
  - Cursor changes to pointer on hover
  - Subtle background highlight on hover
  - Sync icon (⇄) appears on the right side when hovering
  - Tooltip: "Click to sync with matching paragraph"
- **Click Behavior**: Clicking a matched paragraph scrolls the other document so the matching paragraph aligns at the same vertical position
- **Visual Feedback**: Target paragraph briefly flashes with a blue highlight after scrolling

### 2.6 Paragraph Selection
- **Paragraph Definition**: Each paragraph is text between line ending markers
- **Checkboxes**: Each non-blank paragraph has a checkbox for selection
- **Paragraph Numbering**: Non-blank paragraphs are numbered sequentially (1, 2, 3...)
- **Blank Paragraph Handling**: Blank paragraphs have no checkbox or number
- **Select All**: Checkbox in document control bar to select/deselect all paragraphs
- **Dynamic Heights**: Paragraph numbers dynamically resize to match wrapped paragraph heights
- **Selection Persistence**: Selected paragraphs are preserved when switching tabs

### 2.7 Diff Modes
Two diff granularity modes for the Compare function:

#### 2.7.1 Whole Sentence (DEFAULT)
- Shows complete sentences as changed if any part differs
- Sentences that match exactly between documents are clickable for synchronization
- Uses exact matching only

#### 2.7.2 Fuzzy Sentence
- Identifies similar sentences based on word overlap percentage
- Shows inline word-level differences within matched sentences
- Fuzz Level Control:
  - Slider appears when mode is selected (range: 0.00 to 1.00)
  - 0.00 = strictest matching (100% similarity required)
  - 1.00 = loosest matching (10% similarity required)
  - Linear interpolation between min and max thresholds
- Fuzzy matched sentences show:
  - Deletions highlighted inline in the left document
  - Additions highlighted inline in the right document
  - Background tint to indicate fuzzy match
- Both exact and fuzzy matched sentences are clickable for synchronization

### 2.8 Comparison Display
- **Compare Button**: Analyzes only selected paragraphs from each document
- **Background Highlighting**: Selected paragraphs receive background color
- **Change Highlighting**: Specific changes receive stronger highlight color
- **Two-Level Highlighting**:
  - Light background color for context (entire selected paragraphs)
  - Strong highlight color for specific changes (sentences or inline words)
- **Multiple Highlights Per Paragraph**: When multiple changes occur within a single paragraph, all changes are highlighted separately
- **Tab Independence**: Each tab pair maintains its own comparison state

### 2.9 Click-to-Copy Functionality
- **Highlighted Changes**: Can be clicked to copy the changed text to clipboard
- **Normal Click**: Replaces clipboard contents with the clicked text
- **Ctrl+Click**: Appends the clicked text to existing clipboard contents
- **Visual Feedback**: 
  - Cursor changes to pointer on hover
  - Cursor changes to copy indicator when Ctrl is held
  - "Copied to clipboard!" or "Added to clipboard!" tooltip appears
- **Applies To**: All diff highlights in both Whole Sentence and Fuzzy Sentence modes

### 2.10 Sentence Synchronization
- **Matched Sentences**: Sentences that match (exactly or fuzzy) are clickable
- **Click Behavior**: Clicking scrolls the other document to center the matching sentence
- **Visual Feedback**: Target sentence briefly highlights in blue
- **Available In**: Both Whole Sentence and Fuzzy Sentence modes

### 2.11 Color Customization
- **Per-Document Colors**: Each document (left/right) has independent color settings
- **Color Components**:
  - BG (Background): Hue slider (0-360°) + Intensity slider (5-40%)
  - HL (Highlight): Hue slider (0-360°) + Intensity slider (20-60%)
- **Default Colors**:
  - Left/Original (Deletions): Red (0° hue)
  - Right/Revised (Additions): Green (120° hue)
- **Reset Button**: Each document has a reset button to restore default colors
- **Real-time Updates**: Color changes apply immediately to existing highlights

## 3. User Interface Layout

### 3.1 Main Window Structure
```
┌─────────────────────────────────────────────────────────────┐
│ Main Toolbar                                                 │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────┐ │ ┌─────────────────────────┐ │
│ │ Tab Bar                  │ │ │ Tab Bar                 │ │
│ ├─────────────────────────┤ │ ├─────────────────────────┤ │
│ │ Original Document       │ │ │ Revised Document        │ │
│ │ Document Control Bar    │ │ │ Document Control Bar    │ │
│ ├─────────────────────────┤ │ ├─────────────────────────┤ │
│ │                         │ │ │                         │ │
│ │    Editor/Drop Zone     │ │ │    Editor/Drop Zone     │ │
│ │                         │ │ │                         │ │
│ └─────────────────────────┘ │ └─────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ Status Bar                                                   │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Main Toolbar
- **Compare Button**: Triggers comparison of selected paragraphs
- **Clear Button**: Removes all comparison highlighting (preserves change bars)
- **Diff Mode Selection**: Radio buttons for Whole Sentence | Fuzzy Sentence
- **Fuzz Level Control** (visible only in Fuzzy Sentence mode):
  - Label: "Fuzz:"
  - Slider: 0.00 to 1.00 range
  - Value display: Shows current setting with 2 decimal places
- **Zoom Controls** (right-aligned):
  - Zoom Out button (-)
  - Zoom level display (e.g., "100%")
  - Zoom In button (+)
  - Reset Zoom button

### 3.3 Document Panes
Each pane contains:

#### 3.3.1 Tab Bar
- **Tabs Container**: Scrollable area containing all document tabs
- **Individual Tabs**: Show title and close button (except last tab)
- **Move Tab Button**: Arrow icon to move active tab to other pane
- **New Tab Button**: Plus icon to create new empty tab

#### 3.3.2 Pane Header
- Title: "Original Document" or "Revised Document" (bold)
- Filename in parentheses (normal weight) with ellipsis for long paths

#### 3.3.3 Document Control Bar
- **Select All Checkbox** with label (leftmost)
- **Color Controls**:
  - BG: Color slider (0-360° hue) + Intensity slider (5-40%)
  - HL: Color slider (0-360° hue) + Intensity slider (20-60%)
  - Reset button (icon matches zoom reset)
- **Clear Document Button** (X icon, rightmost)

#### 3.3.4 Editor Area
When no file loaded:
- Drop zone with upload icon
- Text: "Drop a file anywhere in this window, or use the buttons to browse for a file or paste from the clipboard."
- Browse button: "Click to Browse for a File"
- Paste button: "Click to Paste Clipboard Contents"

When file loaded:
- Paragraph numbers column with checkboxes for non-blank paragraphs
- Content area with monospace font
- Synchronized scrolling between paragraph numbers and content
- Change bars on left edge for modified paragraphs

### 3.4 Status Bar
- **Left Side**: Application name and version (e.g., "Differon 0.4.4")
- **Right Side**: Current date and time (e.g., "Wednesday, May 28, 2025 01:28 AM")
- **Updates**: Time refreshes every minute
- **Styling**: Dark gray background matching toolbar color scheme

## 4. Natural Language Processing

### 4.1 Technology Requirements
- Must use a natural language processing library capable of:
  - Parsing text into sentences regardless of line breaks
  - Identifying word boundaries intelligently
  - Handling contractions and punctuation properly

### 4.2 Whole Sentence Mode Algorithm
1. Parse both selected texts into sentences using a dual approach:
   - Primary: NLP library (compromise) for sentence detection
   - Fallback: Regex-based detection for edge cases
2. Apply n² algorithm:
   - Look for exact sentence matches only (no fuzzy matching)
   - Process sentences in order from both documents
   - Mark unmatched sentences as added/deleted
3. Map sentence positions back to their locations in the selected text
4. Handle multiple sentences per paragraph when displaying results

### 4.3 Fuzzy Sentence Mode Algorithm
1. Parse texts into sentences (same as Whole Sentence mode)
2. Apply n² algorithm with fuzzy matching:
   - First look for exact matches
   - If no exact match, calculate similarity score using Jaccard index (word overlap)
   - Match sentences that exceed the similarity threshold
3. For fuzzy matched sentences:
   - Perform word-level diff between the paired sentences
   - Track unchanged, added, and deleted words
   - Display inline diffs within the sentence context
4. Exact matches treated same as Whole Sentence mode

### 4.4 Similarity Calculation
- Uses Jaccard similarity coefficient: intersection/union of word sets
- Case-insensitive comparison
- Threshold determined by fuzz level setting and config values

### 4.5 Word Diff Algorithm
- Used within fuzzy matched sentences
- Simple forward scan with look-ahead for next matching word
- Groups consecutive word changes
- Preserves word order and spacing

## 5. Configuration System

### 5.1 Runtime Configuration
- **File**: `config.json` in application root directory
- **Loading**: Read at application startup
- **Distribution**: Becomes permanent when app is packaged

### 5.2 Configurable Values
```json
{
  "window": {
    "defaultWidth": 1400,
    "defaultHeight": 800,
    "minWidth": 800,
    "minHeight": 600
  },
  "zoom": {
    "default": 1.0,
    "min": 0.5,
    "max": 3.0,
    "increment": 0.25
  },
  "colors": {
    "left": {
      "defaultBgHue": 0,
      "defaultBgIntensity": 20,
      "defaultHlHue": 0,
      "defaultHlIntensity": 40
    },
    "right": {
      "defaultBgHue": 120,
      "defaultBgIntensity": 20,
      "defaultHlHue": 120,
      "defaultHlIntensity": 40
    },
    "bgIntensityMin": 5,
    "bgIntensityMax": 40,
    "hlIntensityMin": 20,
    "hlIntensityMax": 60
  },
  "fuzzyMatching": {
    "minMatchPercent": 10,
    "maxMatchPercent": 100,
    "defaultFuzzLevel": 0.50,
    "wordLookAheadLimit": 5
  },
  "ui": {
    "statusBarUpdateIntervalMs": 60000,
    "paragraphSyncHighlightDurationMs": 600,
    "paragraphSyncHighlightColor": "rgba(100, 100, 255, 0.3)",
    "sentenceSyncHighlightColor": "rgba(100, 100, 255, 0.5)",
    "tooltipDisplayDurationMs": 1500
  },
  "toolbar": {
    "defaultDiffMode": "sentence"
  }
}
```

## 6. Interaction Details

### 6.1 Keyboard Shortcuts
- **Ctrl+O**: Open original file
- **Ctrl+Shift+O**: Open revised file
- **Ctrl+Shift+T**: Open original file in new tab
- **Ctrl+T**: Create new tab in focused pane
- **Ctrl+W**: Close current tab in focused pane
- **Ctrl+Tab**: Next tab
- **Ctrl+Shift+Tab**: Previous tab
- **Ctrl+V**: Paste into left pane
- **Ctrl+Shift+V**: Paste into right pane
- **Ctrl+Plus**: Zoom in
- **Ctrl+Minus**: Zoom out
- **Ctrl+0**: Reset zoom
- **Ctrl+C**: Copy selected text
- **Ctrl+A**: Select all text (in focused area)
- **Ctrl+Q**: Exit application

### 6.2 Mouse Interactions
- **Drag and drop** files anywhere in the application window
- **Click** "Browse" button to open file dialog
- **Click** "Paste" button to paste from clipboard
- **Click** tabs to switch between documents
- **Click** tab close button to close/clear tab
- **Click** checkboxes to select paragraphs
- **Click** highlighted changes to copy text
- **Ctrl+Click** highlighted changes to append to clipboard
- **Click** matched paragraphs to sync scroll position
- **Click** matched sentences to sync scroll position
- **Drag** sliders to adjust colors or fuzz level
- **Synchronized scrolling** in editor areas

### 6.3 Visual Feedback
- **Hover Effects**: 
  - Highlighted changes show opacity change
  - Matched paragraphs show sync icon
  - Tab close buttons become more visible
- **Cursor Changes**: 
  - Pointer for clickable elements
  - Copy cursor when Ctrl held over diffs
- **Sync Animations**: Brief blue highlight when syncing
- **Tooltips**: Appear for copy actions, sync hints, and UI buttons
- **Modified Indicator**: Asterisk in tab title for unsaved changes

## 7. Session Persistence

### 7.1 Application State
The following is preserved between application sessions in `differon-state.json`:
- All open documents (content, paths, and tab order)
- Active tab for each pane
- Scroll positions for all documents
- Selected paragraphs for all documents
- Selected diff mode (Whole Sentence/Fuzzy Sentence)
- Fuzz level setting
- Zoom level
- All color settings (hue and intensity for BG/HL for both documents)
- Document modified status

### 7.2 Window Geometry
The following is preserved between sessions in `differon-window-state.json`:
- Window position (x, y coordinates)
- Window size (width, height)
- Maximized state
- Full screen state
- Multi-monitor awareness (validates saved position is still valid)

### 7.3 Restored Behavior
- When restoring with two documents, paragraph diff runs automatically
- Change bars are recreated based on the paragraph diff
- Matched paragraph and sentence click handlers are restored
- Fuzz control visibility matches selected mode
- Window appears in saved position/size (or defaults if invalid)
- All tabs are restored with their content and state

## 8. Visual Design

### 8.1 Color Scheme
- Dark theme optimized for extended reading
- Background: #1e1e1e
- Panel backgrounds: #252526, #2d2d30
- Borders: #3e3e42
- Text: #d4d4d4
- Muted text: #858585

### 8.2 Typography
- UI Font: System font stack
- Code/Content Font: Monospace stack ('Consolas', 'Courier New', monospace)
- Font sizes: 9px-14px for UI elements, 13px for content

### 8.3 Change Indicators
- **Change Bars**: 3px wide, full paragraph height, 0.5em gap from text
- **Background Highlighting**: Subtle tint using user-selected colors
- **Text Highlighting**: Stronger tint for specific changed words/sentences
- **Hover Effects**: Matched paragraphs and sentences show sync capability
- **Inline Diffs**: Word-level changes within fuzzy matched sentences
- **Tab Indicators**: Modified tabs show asterisk after title

## 9. Error Handling

### 9.1 File Operations
- Display clear error messages for file read failures
- Handle missing files gracefully
- Support various text encodings
- Fallback config values if config.json is missing

### 9.2 Comparison Operations
- Handle large files with appropriate processing
- Provide feedback if comparison takes too long
- Clear error messages for user actions
- Graceful degradation if NLP fails

### 9.3 Tab Management
- Prevent closing last tab (clear content instead)
- Limit maximum tabs to prevent resource exhaustion
- Handle tab overflow with scrolling

## 10. Performance Requirements

### 10.1 Responsiveness
- File loading should be asynchronous with progress indication
- Paragraph diff should complete within 1 second for typical documents
- UI should remain responsive during comparisons
- Tab switching should be instantaneous

### 10.2 Scalability
- Support documents up to 10MB in size
- Handle documents with up to 10,000 paragraphs
- Support up to 20 tabs per pane (40 total)
- Maintain smooth scrolling with highlighted content

## 11. Accessibility

### 11.1 Visual
- High contrast between text and backgrounds
- Clear visual indicators for all interactive elements
- Sufficient color contrast for all highlights
- Status bar uses smaller font but maintains readability
- Tab states clearly distinguished

### 11.2 Interaction
- All functions accessible via keyboard
- Clear focus indicators
- Descriptive tooltips for all controls
- Logical tab order for keyboard navigation

## 12. Known Limitations

### 12.1 Sentence Detection
- Sentence detection accuracy depends on punctuation and formatting
- Unconventional writing styles may not parse correctly
- Very long paragraphs with many sentences may have performance implications

### 12.2 Fuzzy Matching
- Low similarity thresholds (10-30%) may produce unexpected matches
- Similarity is based on word overlap, not semantic meaning
- Performance may degrade with very low thresholds on large documents

### 12.3 Tab System
- Maximum 20 tabs per pane to prevent resource exhaustion
- Tab titles may truncate for very long filenames
- Modified indicator (*) is visual only - no save functionality

## 13. Version History

### Version 2.0
- Added multi-document tab support
- Added window geometry persistence
- Enhanced drop zone with browse and paste buttons
- Added tab management keyboard shortcuts
- Improved session state management