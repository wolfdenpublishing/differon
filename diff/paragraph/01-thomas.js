const DiffAlgorithm = require('../core/DiffAlgorithm');
const TextProcessor = require('../core/TextProcessor');
const SimilarityCalculator = require('../core/SimilarityCalculator');

/**
 * Thomas paragraph matching algorithm
 * Sequential matching that preserves document order with fuzzy matching support
 */
class ThomasParagraphAlgorithm extends DiffAlgorithm {
  getMetadata() {
    return {
      name: 'thomas',
      displayName: 'Thomas',
      supportsFuzzy: true,
      description: 'Sequential matching that preserves document order',
      order: 1
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
   * Match paragraphs using Thomas algorithm
   * @param {Array<string>} leftParagraphs - Left paragraphs
   * @param {Array<string>} rightParagraphs - Right paragraphs
   * @param {number} matchThreshold - Similarity threshold
   * @returns {Object} Matching results
   */
  matchParagraphs(leftParagraphs, rightParagraphs, matchThreshold) {
    const result = {
      exactMatches: [],
      fuzzyMatches: [],
      unmatchedLeft: new Set(leftParagraphs.map((_, i) => i)),
      unmatchedRight: new Set(rightParagraphs.map((_, i) => i))
    };
    
    // First pass: Find exact matches
    this.findExactMatches(leftParagraphs, rightParagraphs, result);
    
    // Second pass: Find fuzzy matches if threshold allows
    if (matchThreshold < 1.0) {
      this.findFuzzyMatches(leftParagraphs, rightParagraphs, matchThreshold, result);
    }
    
    return result;
  }

  /**
   * Find exact matches between paragraphs
   */
  findExactMatches(leftParagraphs, rightParagraphs, result) {
    let leftIndex = 0;
    let rightIndex = 0;
    
    while (leftIndex < leftParagraphs.length) {
      let found = false;
      
      // Look for exact match starting from rightIndex
      for (let i = rightIndex; i < rightParagraphs.length; i++) {
        if (rightParagraphs[i] === leftParagraphs[leftIndex] && 
            leftParagraphs[leftIndex].trim() !== '') {
          // Exact match found
          result.exactMatches.push({
            left: leftIndex,
            right: i,
            similarity: 1.0
          });
          
          result.unmatchedLeft.delete(leftIndex);
          result.unmatchedRight.delete(i);
          
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
    
    // Process paragraphs in order
    let leftPos = 0;
    let rightPos = 0;
    
    while (leftPos < leftParagraphs.length || rightPos < rightParagraphs.length) {
      const leftMatch = leftToRight.get(leftPos);
      const rightMatch = rightToLeft.get(rightPos);
      
      if (leftMatch && leftMatch.index === rightPos) {
        // Matched paragraph (exact or fuzzy)
        if (leftMatch.similarity === 1.0) {
          // Exact match - no diff entry needed
        } else {
          // Fuzzy match - show as modified
          diff.push({
            value: leftParagraphs[leftPos],
            removed: true,
            paragraphIndex: leftPos,
            side: 'left',
            similarity: leftMatch.similarity
          });
          diff.push({
            value: rightParagraphs[rightPos],
            added: true,
            paragraphIndex: rightPos,
            side: 'right',
            similarity: leftMatch.similarity
          });
        }
        leftPos++;
        rightPos++;
      } else if (!rightMatch || (leftMatch && leftMatch.index > rightPos)) {
        // Right paragraph was removed or moved
        if (rightPos < rightParagraphs.length) {
          diff.push({
            value: rightParagraphs[rightPos],
            added: true,
            paragraphIndex: rightPos,
            side: 'right'
          });
        }
        rightPos++;
      } else {
        // Left paragraph was removed or moved
        if (leftPos < leftParagraphs.length) {
          diff.push({
            value: leftParagraphs[leftPos],
            removed: true,
            paragraphIndex: leftPos,
            side: 'left'
          });
        }
        leftPos++;
      }
    }
    
    return diff;
  }
}

module.exports = ThomasParagraphAlgorithm;