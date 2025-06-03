/**
 * Similarity calculation utilities
 */
class SimilarityCalculator {
  /**
   * Calculate Jaccard similarity between two texts
   * @param {string} text1 - First text
   * @param {string} text2 - Second text
   * @returns {number} Similarity score between 0 and 1
   */
  static calculateSimilarity(text1, text2) {
    if (!text1 || !text2) {
      return 0;
    }

    // Extract words and convert to lowercase
    const words1 = this.extractWords(text1);
    const words2 = this.extractWords(text2);

    if (words1.length === 0 || words2.length === 0) {
      return 0;
    }

    // Create sets for unique words
    const set1 = new Set(words1);
    const set2 = new Set(words2);

    // Calculate intersection
    const intersection = new Set([...set1].filter(x => set2.has(x)));

    // Calculate union
    const union = new Set([...set1, ...set2]);

    // Jaccard similarity = |intersection| / |union|
    return intersection.size / union.size;
  }

  /**
   * Calculate paragraph similarity (alias for calculateSimilarity)
   * @param {string} p1 - First paragraph
   * @param {string} p2 - Second paragraph
   * @returns {number} Similarity score between 0 and 1
   */
  static calculateParagraphSimilarity(p1, p2) {
    return this.calculateSimilarity(p1, p2);
  }

  /**
   * Extract words from text for similarity calculation
   * @param {string} text - Text to extract words from
   * @returns {Array<string>} Array of lowercase words
   */
  static extractWords(text) {
    return text
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 0);
  }

  /**
   * Check if two texts are similar enough based on threshold
   * @param {string} text1 - First text
   * @param {string} text2 - Second text
   * @param {number} threshold - Similarity threshold (0-1)
   * @returns {boolean} True if similar enough
   */
  static areSimilar(text1, text2, threshold) {
    const similarity = this.calculateSimilarity(text1, text2);
    return similarity >= threshold;
  }

  /**
   * Find best match for a text in an array of candidates
   * @param {string} text - Text to match
   * @param {Array<string>} candidates - Array of candidate texts
   * @param {number} minThreshold - Minimum similarity threshold
   * @returns {Object|null} Best match object or null
   */
  static findBestMatch(text, candidates, minThreshold = 0.5) {
    let bestMatch = null;
    let bestSimilarity = 0;

    for (let i = 0; i < candidates.length; i++) {
      const similarity = this.calculateSimilarity(text, candidates[i]);
      
      if (similarity > bestSimilarity && similarity >= minThreshold) {
        bestSimilarity = similarity;
        bestMatch = {
          index: i,
          text: candidates[i],
          similarity: similarity
        };
      }
    }

    return bestMatch;
  }

  /**
   * Calculate weighted similarity considering position
   * @param {string} text1 - First text
   * @param {string} text2 - Second text
   * @param {number} positionWeight - Weight for position (0-1)
   * @param {number} pos1 - Position of first text
   * @param {number} pos2 - Position of second text
   * @param {number} totalItems - Total number of items
   * @returns {number} Weighted similarity score
   */
  static calculateWeightedSimilarity(text1, text2, positionWeight, pos1, pos2, totalItems) {
    const textSimilarity = this.calculateSimilarity(text1, text2);
    
    if (positionWeight === 0 || totalItems === 0) {
      return textSimilarity;
    }

    // Calculate position similarity (closer positions = higher similarity)
    const positionDiff = Math.abs(pos1 - pos2);
    const maxDiff = totalItems - 1;
    const positionSimilarity = 1 - (positionDiff / maxDiff);

    // Combine text and position similarity
    const combinedSimilarity = 
      (textSimilarity * (1 - positionWeight)) + 
      (positionSimilarity * positionWeight);

    return combinedSimilarity;
  }

  /**
   * Convert fuzziness slider value to similarity thresholds
   * @param {number} fuzziness - Fuzziness value (0-1)
   * @param {number} minMatch - Minimum match threshold
   * @param {number} maxMatch - Maximum match threshold
   * @returns {number} Similarity threshold
   */
  static fuzzinessToThreshold(fuzziness, minMatch = 0.5, maxMatch = 0.9) {
    // When fuzziness = 0: threshold = maxMatch (exact/strict matching)
    // When fuzziness = 1: threshold = minMatch (fuzzy/loose matching)
    // This is the correct formula - as fuzziness increases, threshold decreases
    const threshold = maxMatch - (fuzziness * (maxMatch - minMatch));
    return threshold;
  }
}

module.exports = SimilarityCalculator;