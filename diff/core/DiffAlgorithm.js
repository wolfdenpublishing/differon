/**
 * Base class for all diff algorithms
 */
class DiffAlgorithm {
  constructor() {
    this.metadata = this.getMetadata();
  }

  /**
   * Get algorithm metadata
   * Must be implemented by subclasses
   * @returns {Object} Algorithm metadata
   */
  getMetadata() {
    return {
      name: 'base-algorithm',
      displayName: 'Base Algorithm',
      supportsFuzzy: false,
      description: 'Base diff algorithm',
      order: 999
    };
  }

  /**
   * Compare two texts and return diff results
   * Must be implemented by subclasses
   * @param {string} leftText - Left text to compare
   * @param {string} rightText - Right text to compare
   * @param {Object} options - Algorithm options
   * @returns {Promise<Object>} Diff results
   */
  async compare(leftText, rightText, options = {}) {
    throw new Error('compare() must be implemented by subclass');
  }

  /**
   * Format the result in a standard structure
   * @param {Array} diff - Diff array
   * @param {Object} matches - Match information
   * @param {Object} additionalData - Any additional data
   * @returns {Object} Formatted result
   */
  formatResult(diff, matches, additionalData = {}) {
    return {
      diff,
      matches,
      metadata: this.metadata,
      timestamp: new Date().toISOString(),
      ...additionalData
    };
  }

  /**
   * Validate options against algorithm requirements
   * @param {Object} options - Options to validate
   * @returns {Object} Validated options
   */
  validateOptions(options) {
    const defaults = {
      fuzziness: 0,
      minMatch: 0.5,
      maxMatch: 0.9
    };

    return {
      ...defaults,
      ...options
    };
  }
}

module.exports = DiffAlgorithm;