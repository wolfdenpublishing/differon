const DiffAlgorithm = require('../core/DiffAlgorithm');

/**
 * Character-level sentence matching algorithm (placeholder)
 * Will perform pure character-by-character comparison
 */
class CharacterSentenceAlgorithm extends DiffAlgorithm {
  getMetadata() {
    return {
      name: 'character',
      displayName: 'Character',
      supportsFuzzy: false,
      description: 'Character-level diff (not yet implemented)',
      order: 4
    };
  }

  async compare(leftText, rightText, options = {}) {
    // Placeholder implementation
    throw new Error('Character sentence algorithm not yet implemented');
    
    // Future implementation will:
    // 1. Perform character-by-character comparison
    // 2. Show inline character differences
    // 3. Similar to traditional diff tools
    // 4. Best for code or highly structured text
  }
}

module.exports = CharacterSentenceAlgorithm;