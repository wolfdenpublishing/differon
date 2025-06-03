const nlp = require('compromise');
const diff = require('diff');

/**
 * Common text processing utilities
 */
class TextProcessor {
  /**
   * Split text into paragraphs
   * @param {string} text - Text to split
   * @returns {Array<string>} Array of paragraphs
   */
  static splitParagraphs(text) {
    return text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n');
  }

  /**
   * Split text into sentences using NLP with regex fallback
   * @param {string} text - Text to split
   * @returns {Array<string>} Array of sentences
   */
  static splitIntoSentences(text) {
    if (!text || !text.trim()) {
      return [];
    }

    try {
      // Use compromise for sentence detection
      const doc = nlp(text);
      const sentences = doc.sentences().out('array');
      
      // Filter out empty sentences and deduplicate
      const uniqueSentences = [...new Set(sentences)]
        .map(s => s.trim())
        .filter(s => s.length > 0);
      
      // If NLP didn't find sentences, fall back to regex
      if (uniqueSentences.length === 0) {
        return this.splitSentencesByRegex(text);
      }
      
      return uniqueSentences;
    } catch (err) {
      // Fallback to regex-based splitting
      return this.splitSentencesByRegex(text);
    }
  }

  /**
   * Split sentences using regex (fallback method)
   * @param {string} text - Text to split
   * @returns {Array<string>} Array of sentences
   */
  static splitSentencesByRegex(text) {
    // Split on sentence-ending punctuation followed by space or end of string
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    
    return sentences
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }

  /**
   * Normalize line endings in text
   * @param {string} text - Text to normalize
   * @returns {string} Normalized text
   */
  static normalizeLineEndings(text) {
    return text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');
  }

  /**
   * Extract words from text
   * @param {string} text - Text to extract words from
   * @returns {Array<string>} Array of words
   */
  static extractWords(text) {
    return text
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 0);
  }

  /**
   * Calculate global position of a sentence within selected paragraphs
   * @param {number} paragraphIndex - Index of the paragraph
   * @param {string} sentenceText - The sentence text
   * @param {Array} selectedParagraphs - Array of selected paragraph indices
   * @param {Array} fullParagraphs - Array of all paragraphs
   * @returns {number} Global position
   */
  static calculateGlobalPosition(paragraphIndex, sentenceText, selectedParagraphs, fullParagraphs) {
    let position = 0;
    
    // Add lengths of all previous selected paragraphs
    for (let i = 0; i < selectedParagraphs.length; i++) {
      if (selectedParagraphs[i] < paragraphIndex) {
        position += fullParagraphs[selectedParagraphs[i]].length + 1; // +1 for newline
      } else if (selectedParagraphs[i] === paragraphIndex) {
        // Find position within the paragraph
        const paragraphText = fullParagraphs[paragraphIndex];
        const sentenceStart = paragraphText.indexOf(sentenceText);
        if (sentenceStart !== -1) {
          position += sentenceStart;
        }
        break;
      }
    }
    
    return position;
  }

  /**
   * Calculate global position for a paragraph
   * @param {number} paragraphIndex - Index of the paragraph
   * @param {Array} selectedParagraphs - Array of selected paragraph indices
   * @param {Array} fullParagraphs - Array of all paragraphs
   * @returns {number} Global position
   */
  static calculateGlobalPositionForParagraph(paragraphIndex, selectedParagraphs, fullParagraphs) {
    let position = 0;
    
    // Add lengths of all previous selected paragraphs
    for (let i = 0; i < selectedParagraphs.length; i++) {
      if (selectedParagraphs[i] < paragraphIndex) {
        position += fullParagraphs[selectedParagraphs[i]].length + 1; // +1 for newline
      } else if (selectedParagraphs[i] === paragraphIndex) {
        break;
      }
    }
    
    return position;
  }

  /**
   * Get word-level diff between two texts
   * @param {string} text1 - First text
   * @param {string} text2 - Second text
   * @returns {Array} Array of diff objects
   */
  static getWordDiff(text1, text2) {
    const words1 = text1.split(/\s+/);
    const words2 = text2.split(/\s+/);
    
    const diffResult = diff.diffArrays(words1, words2);
    const wordDiff = [];
    
    for (const part of diffResult) {
      if (part.added) {
        wordDiff.push({
          type: 'added',
          value: part.value.join(' ')
        });
      } else if (part.removed) {
        wordDiff.push({
          type: 'deleted',
          value: part.value.join(' ')
        });
      } else {
        wordDiff.push({
          type: 'unchanged',
          value: part.value.join(' ')
        });
      }
    }
    
    return wordDiff;
  }

  /**
   * Join paragraphs with proper line endings
   * @param {Array<string>} paragraphs - Array of paragraphs
   * @returns {string} Joined text
   */
  static joinParagraphs(paragraphs) {
    return paragraphs.join('\n');
  }

  /**
   * Check if text is empty or whitespace only
   * @param {string} text - Text to check
   * @returns {boolean} True if empty
   */
  static isEmpty(text) {
    return !text || !text.trim();
  }
}

module.exports = TextProcessor;