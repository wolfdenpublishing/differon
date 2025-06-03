const DiffAlgorithm = require('../core/DiffAlgorithm');
const TextProcessor = require('../core/TextProcessor');
const SimilarityCalculator = require('../core/SimilarityCalculator');

/**
 * Thomas sentence matching algorithm
 * Sequential n² matching that preserves document order with fuzzy support
 */
class ThomasSentenceAlgorithm extends DiffAlgorithm {
  getMetadata() {
    return {
      name: 'thomas',
      displayName: 'Thomas',
      supportsFuzzy: true,
      description: 'Sequential sentence matching with optional fuzzy support',
      order: 1
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
    
    // Split texts into sentences
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
        matches.fuzzyMatches,
        leftSentences,
        rightSentences,
        leftSelectedParagraphs,
        rightSelectedParagraphs,
        leftFullParagraphs,
        rightFullParagraphs
      );
    }
    
    return this.formatResult(result.diff, matches, result);
  }

  /**
   * Extract sentences from text
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
   * Match sentences using Thomas algorithm
   */
  matchSentences(leftSentences, rightSentences, matchThreshold) {
    
    const result = {
      exactMatches: [],
      fuzzyMatches: [],
      unmatchedLeft: new Set(leftSentences.map((_, i) => i)),
      unmatchedRight: new Set(rightSentences.map((_, i) => i)),
      matchedSentences: {
        leftToRight: new Map(),
        rightToLeft: new Map()
      }
    };
    
    let oU = 0; // Left pointer
    let rU = 0; // Right pointer
    const rightUsed = new Set(); // Track used right sentences for fuzzy matching
    
    while (oU < leftSentences.length) {
      const leftSentence = leftSentences[oU];
      let matched = false;
      let bestFuzzyMatch = null;
      let bestSimilarity = 0;
      
      // Look for exact match first starting from rU
      for (let i = rU; i < rightSentences.length; i++) {
        const rightSentence = rightSentences[i];
        
        if (leftSentence.text === rightSentence.text) {
          // Exact match found
          result.exactMatches.push({
            left: oU,
            right: i,
            similarity: 1.0
          });
          
          result.matchedSentences.leftToRight.set(oU, i);
          result.matchedSentences.rightToLeft.set(i, oU);
          
          result.unmatchedLeft.delete(oU);
          result.unmatchedRight.delete(i);
          rightUsed.add(i);
          
          oU++;
          rU = i + 1;
          matched = true;
          break;
        }
      }
      
      // If no exact match and fuzzy matching is enabled, search ALL unused right sentences
      if (!matched && matchThreshold < 1.0) {
        for (let i = 0; i < rightSentences.length; i++) {
          if (!rightUsed.has(i)) {
            const rightSentence = rightSentences[i];
            const similarity = SimilarityCalculator.calculateSimilarity(
              leftSentence.text,
              rightSentence.text
            );
            
            if (similarity >= matchThreshold && similarity > bestSimilarity) {
              bestFuzzyMatch = i;
              bestSimilarity = similarity;
            }
          }
        }
      }
      
      // If no exact match but found fuzzy match
      if (!matched && bestFuzzyMatch !== null) {
        result.fuzzyMatches.push({
          left: oU,
          right: bestFuzzyMatch,
          similarity: bestSimilarity
        });
        
        result.matchedSentences.leftToRight.set(oU, bestFuzzyMatch);
        result.matchedSentences.rightToLeft.set(bestFuzzyMatch, oU);
        
        result.unmatchedLeft.delete(oU);
        result.unmatchedRight.delete(bestFuzzyMatch);
        rightUsed.add(bestFuzzyMatch);
        
        oU++;
        // Don't update rU for fuzzy matches as they can be out of order
      } else if (!matched) {
        oU++;
      }
    }
    
    return result;
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
    const processed = new Set();
    
    // Add all unmatched sentences as changes
    // Note: Fuzzy matched sentences are NOT in unmatchedLeft/Right
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
    
    // Note: Fuzzy matched sentences should NOT be added to the diff array
    // They are handled separately through fuzzyMatchedPairs in the renderer
    
    return diff;
  }

  /**
   * Build fuzzy matched pairs with word-level diff
   */
  buildFuzzyMatchedPairs(fuzzyMatches, leftSentences, rightSentences,
                         leftSelectedParagraphs, rightSelectedParagraphs,
                         leftFullParagraphs, rightFullParagraphs) {
    const fuzzyPairs = [];
    
    for (const match of fuzzyMatches) {
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
        fuzzyPairs.push({
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
          wordDiff: TextProcessor.getWordDiff(leftSentence.text, rightSentence.text)
        });
      }
    }
    
    return fuzzyPairs;
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
   * Format: {paragraphIndex}:{sentenceText}
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
    
    // Process fuzzy matches
    for (const match of matches.fuzzyMatches) {
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

module.exports = ThomasSentenceAlgorithm;