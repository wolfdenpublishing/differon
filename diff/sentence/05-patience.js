const DiffAlgorithm = require('../core/DiffAlgorithm');
const TextProcessor = require('../core/TextProcessor');
const SimilarityCalculator = require('../core/SimilarityCalculator');
const Diff = require('diff');

/**
 * Patience sentence matching algorithm
 * Uses the diff library's array diff for better handling of moved sentences
 */
class PatienceSentenceAlgorithm extends DiffAlgorithm {
  getMetadata() {
    return {
      name: 'patience',
      displayName: 'Patience',
      supportsFuzzy: true,
      description: 'Better handling of moved sentences',
      order: 5
    };
  }

  async compare(leftText, rightText, options = {}) {
    const validatedOptions = this.validateOptions(options);
    
    const { 
      fuzziness, 
      minMatch, 
      maxMatch,
      leftSelectedParagraphs = [],
      rightSelectedParagraphs = [],
      leftFullParagraphs = [],
      rightFullParagraphs = []
    } = validatedOptions;
    
    // Calculate match threshold from fuzziness
    const matchThreshold = SimilarityCalculator.fuzzinessToThreshold(fuzziness, minMatch, maxMatch);
    const isFuzzyMode = matchThreshold < 1.0;
    
    // Split texts into sentences with position info
    const leftSentences = this.extractSentences(leftText);
    const rightSentences = this.extractSentences(rightText);
    
    // Perform matching
    const matches = this.matchSentences(leftSentences, rightSentences, matchThreshold);
    
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
    
    // Build properly formatted matchedSentences for renderer
    const formattedMatchedSentences = this.buildFormattedMatchedSentences(
      leftSentences, rightSentences, matches,
      leftSelectedParagraphs, rightSelectedParagraphs,
      leftFullParagraphs, rightFullParagraphs
    );
    
    // Prepare result
    const result = {
      diff,
      matchedSentences: formattedMatchedSentences,
      sentenceInfo
    };
    
    // Add fuzzy matched pairs with word diff if in fuzzy mode
    if (isFuzzyMode && matches.fuzzyMatches.length > 0) {
      result.fuzzyMatchedPairs = this.buildFuzzyMatchedPairs(
        leftSentences, rightSentences, matches,
        leftSelectedParagraphs, rightSelectedParagraphs,
        leftFullParagraphs, rightFullParagraphs
      );
    }
    
    return this.formatResult(result.diff, matches, result);
  }

  /**
   * Extract sentences from text with position information
   */
  extractSentences(text) {
    const sentences = TextProcessor.splitIntoSentences(text);
    
    // Store positions for each sentence
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
   * Match sentences using Patience algorithm
   */
  matchSentences(leftSentences, rightSentences, matchThreshold) {
    const result = {
      exactMatches: [],
      fuzzyMatches: [],
      unmatchedLeft: new Set(),
      unmatchedRight: new Set(),
      matchedSentences: {
        leftToRight: new Map(),
        rightToLeft: new Map()
      }
    };
    
    // Use diff library for Patience algorithm - need to extract text arrays
    const leftTexts = leftSentences.map(s => s.text);
    const rightTexts = rightSentences.map(s => s.text);
    const sentenceDiff = Diff.diffArrays(leftTexts, rightTexts);
    
    // Process diff results for exact matches
    this.processDiffResults(sentenceDiff, leftSentences, rightSentences, result);
    
    // Second pass: Find fuzzy matches if threshold allows
    if (matchThreshold < 1.0) {
      this.findFuzzyMatches(leftSentences, rightSentences, matchThreshold, result);
    }
    
    return result;
  }

  /**
   * Process diff results to find exact matches
   */
  processDiffResults(sentenceDiff, leftSentences, rightSentences, result) {
    let leftIndex = 0;
    let rightIndex = 0;
    
    for (const part of sentenceDiff) {
      if (!part.added && !part.removed) {
        // Unchanged sentences are exact matches
        for (let i = 0; i < part.count; i++) {
          if (leftSentences[leftIndex + i].text.trim() !== '') {
            result.exactMatches.push({
              left: leftIndex + i,
              right: rightIndex + i,
              similarity: 1.0
            });
            
            result.matchedSentences.leftToRight.set(leftIndex + i, rightIndex + i);
            result.matchedSentences.rightToLeft.set(rightIndex + i, leftIndex + i);
          }
        }
        leftIndex += part.count;
        rightIndex += part.count;
      } else if (part.removed) {
        // Sentences only in left document
        for (let i = 0; i < part.count; i++) {
          result.unmatchedLeft.add(leftIndex + i);
        }
        leftIndex += part.count;
      } else if (part.added) {
        // Sentences only in right document
        for (let i = 0; i < part.count; i++) {
          result.unmatchedRight.add(rightIndex + i);
        }
        rightIndex += part.count;
      }
    }
  }

  /**
   * Find fuzzy matches between unmatched sentences
   */
  findFuzzyMatches(leftSentences, rightSentences, matchThreshold, result) {
    const unmatchedLeftArray = Array.from(result.unmatchedLeft);
    const unmatchedRightArray = Array.from(result.unmatchedRight);
    const rightUsed = new Set();
    
    for (const leftIdx of unmatchedLeftArray) {
      const leftSentence = leftSentences[leftIdx];
      if (!leftSentence.text.trim()) continue;
      
      let bestMatch = null;
      let bestSimilarity = 0;
      
      // Find best matching right sentence
      for (const rightIdx of unmatchedRightArray) {
        if (rightUsed.has(rightIdx)) continue;
        
        const rightSentence = rightSentences[rightIdx];
        if (!rightSentence.text.trim()) continue;
        
        const similarity = SimilarityCalculator.calculateSimilarity(
          leftSentence.text, 
          rightSentence.text
        );
        
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
        
        result.matchedSentences.leftToRight.set(leftIdx, bestMatch);
        result.matchedSentences.rightToLeft.set(bestMatch, leftIdx);
        
        result.unmatchedLeft.delete(leftIdx);
        result.unmatchedRight.delete(bestMatch);
        rightUsed.add(bestMatch);
      }
    }
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
    
    // Fallback: check sentence map if provided
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
   * Build diff array from matching results
   */
  buildDiff(leftSentences, rightSentences, matches, leftSelectedParagraphs, 
            rightSelectedParagraphs, leftFullParagraphs, rightFullParagraphs, sentenceInfo) {
    const diff = [];
    
    // Process unmatched left sentences (removed)
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
    
    // Process unmatched right sentences (added)
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
    
    // Note: Fuzzy matched sentences should NOT be added to the diff array
    // They are handled separately through fuzzyMatchedPairs in the renderer
    
    return diff;
  }

  /**
   * Build formatted matched sentences for renderer
   */
  buildFormattedMatchedSentences(leftSentences, rightSentences, matches,
                                 leftSelectedParagraphs, rightSelectedParagraphs,
                                 leftFullParagraphs, rightFullParagraphs) {
    const result = {
      leftToRight: new Map(),
      rightToLeft: new Map()
    };
    
    // Helper to find paragraph for a sentence and create key
    const createSentenceKey = (sentence, selectedParagraphs, fullParagraphs) => {
      const paragraphInfo = this.findParagraphForSentence(
        sentence.text,
        selectedParagraphs,
        fullParagraphs
      );
      if (paragraphInfo) {
        return `${paragraphInfo.paragraphIndex}:${sentence.text}`;
      }
      return null;
    };
    
    // Add all matches (both exact and fuzzy) with proper keys
    matches.exactMatches.forEach(match => {
      const leftKey = createSentenceKey(leftSentences[match.left], leftSelectedParagraphs, leftFullParagraphs);
      const rightKey = createSentenceKey(rightSentences[match.right], rightSelectedParagraphs, rightFullParagraphs);
      
      if (leftKey && rightKey) {
        result.leftToRight.set(leftKey, rightKey);
        result.rightToLeft.set(rightKey, leftKey);
      }
    });
    
    matches.fuzzyMatches.forEach(match => {
      const leftKey = createSentenceKey(leftSentences[match.left], leftSelectedParagraphs, leftFullParagraphs);
      const rightKey = createSentenceKey(rightSentences[match.right], rightSelectedParagraphs, rightFullParagraphs);
      
      if (leftKey && rightKey) {
        result.leftToRight.set(leftKey, rightKey);
        result.rightToLeft.set(rightKey, leftKey);
      }
    });
    
    return result;
  }

  /**
   * Build fuzzy matched pairs with word diff
   */
  buildFuzzyMatchedPairs(leftSentences, rightSentences, matches,
                         leftSelectedParagraphs, rightSelectedParagraphs,
                         leftFullParagraphs, rightFullParagraphs) {
    return matches.fuzzyMatches.map(match => {
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
      
      const fuzzyPair = {
        left: {
          sentence: leftSentence.text,
          paragraphIndex: leftParagraphInfo ? leftParagraphInfo.paragraphIndex : null,
          paragraphText: leftParagraphInfo ? leftParagraphInfo.paragraphText : ''
        },
        right: {
          sentence: rightSentence.text,
          paragraphIndex: rightParagraphInfo ? rightParagraphInfo.paragraphIndex : null,
          paragraphText: rightParagraphInfo ? rightParagraphInfo.paragraphText : ''
        },
        similarity: match.similarity,
        wordDiff: TextProcessor.getWordDiff(leftSentence.text, rightSentence.text)
      };
      
      return fuzzyPair;
    });
  }
}

module.exports = PatienceSentenceAlgorithm;