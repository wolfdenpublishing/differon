const DiffAlgorithm = require('../core/DiffAlgorithm');
const TextProcessor = require('../core/TextProcessor');
const SimilarityCalculator = require('../core/SimilarityCalculator');
const Diff = require('diff');

/**
 * Levenshtein sentence matching algorithm
 * Shows word-level edit distance between matched sentences
 */
class LevenshteinSentenceAlgorithm extends DiffAlgorithm {
  getMetadata() {
    return {
      name: 'levenshtein',
      displayName: 'Levenshtein',
      supportsFuzzy: true,
      description: 'Word-level edit distance',
      order: 3
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
    
    // Split texts into sentences with position info
    const leftSentences = this.extractSentences(leftText);
    const rightSentences = this.extractSentences(rightText);
    
    // Perform sentence matching (similar to Thomas algorithm)
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
    
    // Build Levenshtein pairs with word-level diffs
    const levenshteinPairs = this.buildLevenshteinPairs(
      leftSentences, rightSentences, matches,
      leftSelectedParagraphs, rightSelectedParagraphs,
      leftFullParagraphs, rightFullParagraphs
    );
    
    // Prepare result
    const result = {
      diff,
      matchedSentences: formattedMatchedSentences,
      sentenceInfo,
      fuzzyMatchedPairs: levenshteinPairs  // Use the same property name as other algorithms
    };
    
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
   * Match sentences using sequential algorithm (similar to Thomas)
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
    const rightUsed = new Set();
    
    // First pass: exact matches
    while (oU < leftSentences.length) {
      const leftSentence = leftSentences[oU];
      let matched = false;
      
      // Look for exact match starting from rU
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
      
      if (!matched) {
        oU++;
      }
    }
    
    // Second pass: fuzzy matches if enabled
    if (matchThreshold < 1.0) {
      const unmatchedLeftArray = Array.from(result.unmatchedLeft);
      const unmatchedRightArray = Array.from(result.unmatchedRight);
      
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
    
    // Note: Matched sentences (exact and fuzzy) are handled through levenshteinPairs
    
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
    
    // Add all matches (both exact and fuzzy)
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
   * Build Levenshtein pairs with word-level diffs
   */
  buildLevenshteinPairs(leftSentences, rightSentences, matches,
                        leftSelectedParagraphs, rightSelectedParagraphs,
                        leftFullParagraphs, rightFullParagraphs) {
    const pairs = [];
    
    // Process all matched sentences (exact and fuzzy)
    const allMatches = [...matches.exactMatches, ...matches.fuzzyMatches];
    
    for (const match of allMatches) {
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
        // Perform word-level diff using TextProcessor which formats it correctly
        const wordDiff = TextProcessor.getWordDiff(leftSentence.text, rightSentence.text);
        
        pairs.push({
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
          wordDiff
        });
      }
    }
    
    return pairs;
  }
}

module.exports = LevenshteinSentenceAlgorithm;