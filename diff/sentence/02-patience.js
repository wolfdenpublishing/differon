const DiffAlgorithm = require('../core/DiffAlgorithm');

/**
 * Patience sentence matching algorithm (placeholder)
 * Will detect moved sentence blocks while preserving order
 */
class PatienceSentenceAlgorithm extends DiffAlgorithm {
  getMetadata() {
    return {
      name: 'patience',
      displayName: 'Patience',
      supportsFuzzy: true,
      description: 'Detects moved sentence blocks (not yet implemented)',
      order: 2
    };
  }

  async compare(leftText, rightText, options = {}) {
    // Placeholder implementation
    throw new Error('Patience sentence algorithm not yet implemented');
    
    // Future implementation will:
    // 1. Use diff library for sentence-level Patience diff
    // 2. Better handle moved blocks of sentences
    // 3. Support fuzzy matching on unmatched sentences
  }
}

module.exports = PatienceSentenceAlgorithm;