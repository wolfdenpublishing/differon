const DiffAlgorithm = require('../core/DiffAlgorithm');
const TextProcessor = require('../core/TextProcessor');
const SimilarityCalculator = require('../core/SimilarityCalculator');
const Diff = require('diff');

/**
 * Patience paragraph matching algorithm
 * Uses the diff library's array diff for better handling of moved blocks
 */
class PatienceParagraphAlgorithm extends DiffAlgorithm {
  getMetadata() {
    return {
      name: 'patience',
      displayName: 'Patience',
      supportsFuzzy: true,
      description: 'Better handling of moved text blocks',
      order: 2
    };
  }

  async compare(leftText, rightText, options = {}) {
    const validatedOptions = this.validateOptions(options);
    const { fuzziness, minMatch, maxMatch } = validatedOptions;
    
    // Calculate match threshold from fuzziness
    const matchThreshold = SimilarityCalculator.fuzzinessToThreshold(fuzziness, minMatch, maxMatch);
    
    // Split texts into paragraphs
    const leftParagraphs = TextProcessor.splitParagraphs(leftText);
    const rightParagraphs = TextProcessor.splitParagraphs(rightText);
    
    // Perform matching
    const matches = this.matchParagraphs(leftParagraphs, rightParagraphs, matchThreshold);
    
    // Build diff from matches
    const diff = this.buildDiff(leftParagraphs, rightParagraphs, matches);
    
    return this.formatResult(diff, matches);
  }

  /**
   * Match paragraphs using Patience algorithm
   * @param {Array<string>} leftParagraphs - Left paragraphs
   * @param {Array<string>} rightParagraphs - Right paragraphs
   * @param {number} matchThreshold - Similarity threshold
   * @returns {Object} Matching results
   */
  matchParagraphs(leftParagraphs, rightParagraphs, matchThreshold) {
    const result = {
      exactMatches: [],
      fuzzyMatches: [],
      unmatchedLeft: new Set(),
      unmatchedRight: new Set()
    };
    
    // Use diff library for Patience algorithm
    const paragraphDiff = Diff.diffArrays(leftParagraphs, rightParagraphs);
    
    // Process diff results for exact matches
    this.processDiffResults(paragraphDiff, leftParagraphs, rightParagraphs, result);
    
    // Second pass: Find fuzzy matches if threshold allows
    if (matchThreshold < 1.0) {
      this.findFuzzyMatches(leftParagraphs, rightParagraphs, matchThreshold, result);
    }
    
    return result;
  }

  /**
   * Process diff results to find exact matches
   */
  processDiffResults(paragraphDiff, leftParagraphs, rightParagraphs, result) {
    let leftIndex = 0;
    let rightIndex = 0;
    
    for (const part of paragraphDiff) {
      if (!part.added && !part.removed) {
        // Unchanged paragraphs are exact matches
        for (let i = 0; i < part.count; i++) {
          if (leftParagraphs[leftIndex + i].trim() !== '') {
            result.exactMatches.push({
              left: leftIndex + i,
              right: rightIndex + i,
              similarity: 1.0
            });
          }
        }
        leftIndex += part.count;
        rightIndex += part.count;
      } else if (part.removed) {
        // Paragraphs only in left document
        for (let i = 0; i < part.count; i++) {
          result.unmatchedLeft.add(leftIndex + i);
        }
        leftIndex += part.count;
      } else if (part.added) {
        // Paragraphs only in right document
        for (let i = 0; i < part.count; i++) {
          result.unmatchedRight.add(rightIndex + i);
        }
        rightIndex += part.count;
      }
    }
  }

  /**
   * Find fuzzy matches between unmatched paragraphs
   */
  findFuzzyMatches(leftParagraphs, rightParagraphs, matchThreshold, result) {
    const unmatchedLeftArray = Array.from(result.unmatchedLeft);
    const unmatchedRightArray = Array.from(result.unmatchedRight);
    const rightUsed = new Set();
    
    for (const leftIdx of unmatchedLeftArray) {
      const leftPara = leftParagraphs[leftIdx];
      if (!leftPara.trim()) continue;
      
      let bestMatch = null;
      let bestSimilarity = 0;
      
      // Find best matching right paragraph
      for (const rightIdx of unmatchedRightArray) {
        if (rightUsed.has(rightIdx)) continue;
        
        const rightPara = rightParagraphs[rightIdx];
        if (!rightPara.trim()) continue;
        
        const similarity = SimilarityCalculator.calculateParagraphSimilarity(leftPara, rightPara);
        
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

  /**
   * Build diff array from matching results
   */
  buildDiff(leftParagraphs, rightParagraphs, matches) {
    const diff = [];
    
    // Create lookup maps for quick access
    const leftToRight = new Map();
    const rightToLeft = new Map();
    
    // Add exact matches
    for (const match of matches.exactMatches) {
      leftToRight.set(match.left, { index: match.right, similarity: 1.0 });
      rightToLeft.set(match.right, { index: match.left, similarity: 1.0 });
    }
    
    // Add fuzzy matches
    for (const match of matches.fuzzyMatches) {
      leftToRight.set(match.left, { index: match.right, similarity: match.similarity });
      rightToLeft.set(match.right, { index: match.left, similarity: match.similarity });
    }
    
    // Build diff using the Patience algorithm's output
    const paragraphDiff = Diff.diffArrays(leftParagraphs, rightParagraphs);
    let leftPos = 0;
    let rightPos = 0;
    
    for (const part of paragraphDiff) {
      if (!part.added && !part.removed) {
        // Unchanged - skip exact matches
        leftPos += part.count;
        rightPos += part.count;
      } else if (part.removed) {
        // Removed from left
        for (let i = 0; i < part.count; i++) {
          const match = leftToRight.get(leftPos + i);
          if (match && match.similarity < 1.0) {
            // This is part of a fuzzy match, skip here
            continue;
          }
          diff.push({
            value: leftParagraphs[leftPos + i],
            removed: true,
            paragraphIndex: leftPos + i,
            side: 'left'
          });
        }
        leftPos += part.count;
      } else if (part.added) {
        // Added to right
        for (let i = 0; i < part.count; i++) {
          const match = rightToLeft.get(rightPos + i);
          if (match && match.similarity < 1.0) {
            // This is part of a fuzzy match, handle separately
            const leftMatch = match.index;
            diff.push({
              value: leftParagraphs[leftMatch],
              removed: true,
              paragraphIndex: leftMatch,
              side: 'left',
              similarity: match.similarity
            });
            diff.push({
              value: rightParagraphs[rightPos + i],
              added: true,
              paragraphIndex: rightPos + i,
              side: 'right',
              similarity: match.similarity
            });
          } else if (!match) {
            // No match at all
            diff.push({
              value: rightParagraphs[rightPos + i],
              added: true,
              paragraphIndex: rightPos + i,
              side: 'right'
            });
          }
        }
        rightPos += part.count;
      }
    }
    
    return diff;
  }
}

module.exports = PatienceParagraphAlgorithm;