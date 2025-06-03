const DiffAlgorithm = require('../core/DiffAlgorithm');
const TextProcessor = require('../core/TextProcessor');
const diff = require('diff');

/**
 * Character-level diff algorithm using Myers algorithm
 * Provides fine-grained character-by-character comparison without fuzzy matching
 */
class CharacterDiffAlgorithm extends DiffAlgorithm {
  getMetadata() {
    return {
      name: 'character',
      displayName: 'Character',
      supportsFuzzy: false,
      description: 'Character-level diff for detecting fine-grained changes',
      order: 4
    };
  }

  async compare(leftText, rightText, options = {}) {
    const validatedOptions = this.validateOptions(options);
    
    const {
      leftSelectedParagraphs = [],
      rightSelectedParagraphs = [],
      leftFullParagraphs = [],
      rightFullParagraphs = []
    } = validatedOptions;
    
    // Split texts into sentences
    const leftSentences = this.extractSentences(leftText);
    const rightSentences = this.extractSentences(rightText);
    
    // Perform character-level matching on sentences
    const matches = this.matchSentences(leftSentences, rightSentences);
    
    // Build sentence info for paragraph mapping
    const sentenceInfo = this.buildSentenceInfo(
      leftText, rightText,
      leftSelectedParagraphs, rightSelectedParagraphs,
      leftFullParagraphs, rightFullParagraphs
    );
    
    // Build diff from matches
    const diff = this.buildDiff(
      leftSentences, rightSentences, matches,
      leftSelectedParagraphs, rightSelectedParagraphs,
      leftFullParagraphs, rightFullParagraphs,
      sentenceInfo
    );
    
    // Build formatted matched sentences
    const formattedMatchedSentences = this.buildFormattedMatchedSentences(
      leftSentences, rightSentences, matches,
      leftSelectedParagraphs, rightSelectedParagraphs,
      leftFullParagraphs, rightFullParagraphs
    );
    
    // Build character diff pairs for sentences with changes
    const characterDiffPairs = this.buildCharacterDiffPairs(
      leftSentences, rightSentences, matches,
      leftSelectedParagraphs, rightSelectedParagraphs,
      leftFullParagraphs, rightFullParagraphs
    );
    
    const result = {
      diff,
      matchedSentences: formattedMatchedSentences,
      sentenceInfo,
      characterDiffPairs
    };
    
    return this.formatResult(result.diff, matches, result);
  }

  /**
   * Extract sentences from text
   */
  extractSentences(text) {
    const sentences = TextProcessor.splitIntoSentences(text);
    
    return sentences.map(sentence => {
      const start = text.indexOf(sentence);
      return {
        text: sentence,
        start,
        end: start + sentence.length
      };
    });
  }

  /**
   * Match sentences and identify those with character-level differences
   */
  matchSentences(leftSentences, rightSentences) {
    const result = {
      exactMatches: [],
      characterDiffMatches: [],
      unmatchedLeft: new Set(leftSentences.map((_, i) => i)),
      unmatchedRight: new Set(rightSentences.map((_, i) => i)),
      matchedSentences: {
        leftToRight: new Map(),
        rightToLeft: new Map()
      }
    };
    
    // First pass: find exact matches
    for (let i = 0; i < leftSentences.length; i++) {
      for (let j = 0; j < rightSentences.length; j++) {
        if (leftSentences[i].text === rightSentences[j].text && 
            !result.unmatchedRight.has(j)) {
          result.exactMatches.push({
            left: i,
            right: j,
            similarity: 1.0
          });
          
          result.matchedSentences.leftToRight.set(i, j);
          result.matchedSentences.rightToLeft.set(j, i);
          
          result.unmatchedLeft.delete(i);
          result.unmatchedRight.delete(j);
          break;
        }
      }
    }
    
    // Second pass: find sentences with character differences
    // We'll use a simple heuristic: sentences are similar if they share significant content
    const unmatchedLeftArray = Array.from(result.unmatchedLeft);
    const unmatchedRightArray = Array.from(result.unmatchedRight);
    
    for (const leftIdx of unmatchedLeftArray) {
      let bestMatch = null;
      let bestSimilarity = 0;
      
      for (const rightIdx of unmatchedRightArray) {
        const leftText = leftSentences[leftIdx].text;
        const rightText = rightSentences[rightIdx].text;
        
        // Calculate a simple similarity score based on character overlap
        const similarity = this.calculateCharacterSimilarity(leftText, rightText);
        
        // Consider it a match if similarity is above a threshold
        // Use a low threshold (0.1) to catch even very different sentences
        // The character diff will show all the differences anyway
        if (similarity > 0.1 && similarity > bestSimilarity) {
          bestMatch = rightIdx;
          bestSimilarity = similarity;
        }
      }
      
      if (bestMatch !== null) {
        result.characterDiffMatches.push({
          left: leftIdx,
          right: bestMatch,
          similarity: bestSimilarity
        });
        
        result.matchedSentences.leftToRight.set(leftIdx, bestMatch);
        result.matchedSentences.rightToLeft.set(bestMatch, leftIdx);
        
        result.unmatchedLeft.delete(leftIdx);
        result.unmatchedRight.delete(bestMatch);
        unmatchedRightArray.splice(unmatchedRightArray.indexOf(bestMatch), 1);
      }
    }
    
    return result;
  }

  /**
   * Calculate character-based similarity between two strings
   */
  calculateCharacterSimilarity(str1, str2) {
    const changes = diff.diffChars(str1, str2);
    let commonLength = 0;
    let totalLength = 0;
    
    for (const change of changes) {
      totalLength += change.value.length;
      if (!change.added && !change.removed) {
        commonLength += change.value.length;
      }
    }
    
    return totalLength > 0 ? commonLength / totalLength : 0;
  }

  /**
   * Build sentence info for paragraph mapping
   */
  buildSentenceInfo(leftText, rightText, leftSelectedParagraphs, rightSelectedParagraphs,
                    leftFullParagraphs, rightFullParagraphs) {
    const sentenceInfo = {
      left: new Map(),
      right: new Map()
    };
    
    // Process left side
    for (const paragraphIndex of leftSelectedParagraphs) {
      const paragraphText = leftFullParagraphs[paragraphIndex];
      const sentences = TextProcessor.splitIntoSentences(paragraphText);
      
      sentenceInfo.left.set(paragraphIndex, sentences.map(sentence => {
        const start = paragraphText.indexOf(sentence);
        return {
          text: sentence,
          start,
          end: start + sentence.length
        };
      }));
    }
    
    // Process right side
    for (const paragraphIndex of rightSelectedParagraphs) {
      const paragraphText = rightFullParagraphs[paragraphIndex];
      const sentences = TextProcessor.splitIntoSentences(paragraphText);
      
      sentenceInfo.right.set(paragraphIndex, sentences.map(sentence => {
        const start = paragraphText.indexOf(sentence);
        return {
          text: sentence,
          start,
          end: start + sentence.length
        };
      }));
    }
    
    return sentenceInfo;
  }

  /**
   * Build diff array from matches
   */
  buildDiff(leftSentences, rightSentences, matches,
            leftSelectedParagraphs, rightSelectedParagraphs,
            leftFullParagraphs, rightFullParagraphs,
            sentenceInfo) {
    const diff = [];
    
    // Add unmatched sentences as removed/added
    for (const leftIdx of matches.unmatchedLeft) {
      const sentence = leftSentences[leftIdx];
      const paragraphInfo = this.findParagraphForSentence(
        sentence.text,
        leftSelectedParagraphs,
        leftFullParagraphs,
        sentenceInfo.left
      );
      
      if (paragraphInfo) {
        const globalPos = TextProcessor.calculateGlobalPosition(
          paragraphInfo.paragraphIndex,
          sentence.text,
          leftSelectedParagraphs,
          leftFullParagraphs
        );
        
        diff.push({
          value: sentence.text,
          removed: true,
          start: globalPos,
          end: globalPos + sentence.text.length,
          side: 'left',
          paragraphIndex: paragraphInfo.paragraphIndex
        });
      }
    }
    
    for (const rightIdx of matches.unmatchedRight) {
      const sentence = rightSentences[rightIdx];
      const paragraphInfo = this.findParagraphForSentence(
        sentence.text,
        rightSelectedParagraphs,
        rightFullParagraphs,
        sentenceInfo.right
      );
      
      if (paragraphInfo) {
        const globalPos = TextProcessor.calculateGlobalPosition(
          paragraphInfo.paragraphIndex,
          sentence.text,
          rightSelectedParagraphs,
          rightFullParagraphs
        );
        
        diff.push({
          value: sentence.text,
          added: true,
          start: globalPos,
          end: globalPos + sentence.text.length,
          side: 'right',
          paragraphIndex: paragraphInfo.paragraphIndex
        });
      }
    }
    
    return diff;
  }

  /**
   * Build character diff pairs for sentences with changes
   */
  buildCharacterDiffPairs(leftSentences, rightSentences, matches,
                          leftSelectedParagraphs, rightSelectedParagraphs,
                          leftFullParagraphs, rightFullParagraphs) {
    const characterDiffPairs = [];
    
    for (const match of matches.characterDiffMatches) {
      const leftSentence = leftSentences[match.left];
      const rightSentence = rightSentences[match.right];
      
      const leftParagraphInfo = this.findParagraphForSentence(
        leftSentence.text,
        leftSelectedParagraphs,
        leftFullParagraphs
      );
      
      const rightParagraphInfo = this.findParagraphForSentence(
        rightSentence.text,
        rightSelectedParagraphs,
        rightFullParagraphs
      );
      
      if (leftParagraphInfo && rightParagraphInfo) {
        // Get character-level diff
        const charDiff = diff.diffChars(leftSentence.text, rightSentence.text);
        
        characterDiffPairs.push({
          left: {
            sentence: leftSentence.text,
            paragraphIndex: leftParagraphInfo.paragraphIndex,
            paragraphText: leftParagraphInfo.paragraphText
          },
          right: {
            sentence: rightSentence.text,
            paragraphIndex: rightParagraphInfo.paragraphIndex,
            paragraphText: rightParagraphInfo.paragraphText
          },
          similarity: match.similarity,
          charDiff: charDiff
        });
      }
    }
    
    return characterDiffPairs;
  }

  /**
   * Find which paragraph contains a sentence
   */
  findParagraphForSentence(sentenceText, selectedParagraphs, fullParagraphs, sentenceMap) {
    for (const paragraphIndex of selectedParagraphs) {
      const paragraphText = fullParagraphs[paragraphIndex];
      
      if (paragraphText.includes(sentenceText)) {
        return {
          paragraphIndex,
          paragraphText
        };
      }
    }
    
    // Fallback: check sentence map
    if (sentenceMap) {
      for (const [paragraphIndex, sentences] of sentenceMap) {
        if (sentences.some(s => s.text === sentenceText)) {
          return {
            paragraphIndex,
            paragraphText: fullParagraphs[paragraphIndex]
          };
        }
      }
    }
    
    return null;
  }

  /**
   * Build formatted matched sentences for renderer
   */
  buildFormattedMatchedSentences(leftSentences, rightSentences, matches,
                                 leftSelectedParagraphs, rightSelectedParagraphs,
                                 leftFullParagraphs, rightFullParagraphs) {
    const formattedMatches = {
      leftToRight: new Map(),
      rightToLeft: new Map()
    };
    
    // Process exact matches
    for (const match of matches.exactMatches) {
      const leftSentence = leftSentences[match.left];
      const rightSentence = rightSentences[match.right];
      
      const leftParagraphInfo = this.findParagraphForSentence(
        leftSentence.text,
        leftSelectedParagraphs,
        leftFullParagraphs
      );
      
      const rightParagraphInfo = this.findParagraphForSentence(
        rightSentence.text,
        rightSelectedParagraphs,
        rightFullParagraphs
      );
      
      if (leftParagraphInfo && rightParagraphInfo) {
        const leftKey = `${leftParagraphInfo.paragraphIndex}:${leftSentence.text}`;
        const rightKey = `${rightParagraphInfo.paragraphIndex}:${rightSentence.text}`;
        
        formattedMatches.leftToRight.set(leftKey, rightKey);
        formattedMatches.rightToLeft.set(rightKey, leftKey);
      }
    }
    
    // Process character diff matches
    for (const match of matches.characterDiffMatches) {
      const leftSentence = leftSentences[match.left];
      const rightSentence = rightSentences[match.right];
      
      const leftParagraphInfo = this.findParagraphForSentence(
        leftSentence.text,
        leftSelectedParagraphs,
        leftFullParagraphs
      );
      
      const rightParagraphInfo = this.findParagraphForSentence(
        rightSentence.text,
        rightSelectedParagraphs,
        rightFullParagraphs
      );
      
      if (leftParagraphInfo && rightParagraphInfo) {
        const leftKey = `${leftParagraphInfo.paragraphIndex}:${leftSentence.text}`;
        const rightKey = `${rightParagraphInfo.paragraphIndex}:${rightSentence.text}`;
        
        formattedMatches.leftToRight.set(leftKey, rightKey);
        formattedMatches.rightToLeft.set(rightKey, leftKey);
      }
    }
    
    return formattedMatches;
  }
}

module.exports = CharacterDiffAlgorithm;