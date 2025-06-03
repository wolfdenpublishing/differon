const fs = require('fs').promises;
const path = require('path');

/**
 * Registry for managing diff algorithms
 */
class AlgorithmRegistry {
  constructor() {
    this.algorithms = {
      paragraph: new Map(),
      sentence: new Map()
    };
  }

  /**
   * Register an algorithm
   * @param {string} type - Algorithm type ('paragraph' or 'sentence')
   * @param {DiffAlgorithm} algorithm - Algorithm instance
   */
  register(type, algorithm) {
    if (!['paragraph', 'sentence'].includes(type)) {
      throw new Error(`Invalid algorithm type: ${type}`);
    }

    if (!algorithm || typeof algorithm.getMetadata !== 'function') {
      throw new Error('Invalid algorithm: must have getMetadata() method');
    }

    const metadata = algorithm.getMetadata();
    this.algorithms[type].set(metadata.name, algorithm);
  }

  /**
   * Get an algorithm by type and name
   * @param {string} type - Algorithm type
   * @param {string} name - Algorithm name
   * @returns {DiffAlgorithm|null} Algorithm instance or null
   */
  get(type, name) {
    return this.algorithms[type].get(name) || null;
  }

  /**
   * Get all algorithms of a type
   * @param {string} type - Algorithm type
   * @returns {Array} Array of algorithms sorted by order
   */
  getAll(type) {
    if (!['paragraph', 'sentence'].includes(type)) {
      return [];
    }

    return Array.from(this.algorithms[type].values())
      .sort((a, b) => {
        const orderA = a.metadata.order || 999;
        const orderB = b.metadata.order || 999;
        return orderA - orderB;
      });
  }

  /**
   * Get metadata for all algorithms of a type
   * @param {string} type - Algorithm type
   * @returns {Array} Array of metadata objects
   */
  getMetadata(type) {
    return this.getAll(type).map(algo => algo.metadata);
  }

  /**
   * Load algorithms from directory
   * @param {string} diffPath - Path to diff directory
   */
  async loadFromDirectory(diffPath) {
    try {
      // Load paragraph algorithms
      const paragraphPath = path.join(diffPath, 'paragraph');
      const paragraphFiles = await this.getAlgorithmFiles(paragraphPath);
      
      for (const file of paragraphFiles) {
        try {
          const AlgorithmClass = require(file);
          const algorithm = new AlgorithmClass();
          this.register('paragraph', algorithm);
        } catch (err) {
          // Failed to load paragraph algorithm
        }
      }

      // Load sentence algorithms
      const sentencePath = path.join(diffPath, 'sentence');
      const sentenceFiles = await this.getAlgorithmFiles(sentencePath);
      
      for (const file of sentenceFiles) {
        try {
          const AlgorithmClass = require(file);
          const algorithm = new AlgorithmClass();
          this.register('sentence', algorithm);
        } catch (err) {
          // Failed to load sentence algorithm
        }
      }
    } catch (err) {
      // Failed to load algorithms
    }
  }

  /**
   * Get algorithm files from a directory
   * @param {string} dirPath - Directory path
   * @returns {Promise<Array>} Array of file paths
   */
  async getAlgorithmFiles(dirPath) {
    try {
      const files = await fs.readdir(dirPath);
      return files
        .filter(file => file.endsWith('.js') && file !== 'index.js')
        .map(file => path.join(dirPath, file))
        .sort(); // Sort to ensure consistent ordering
    } catch (err) {
      // Directory might not exist yet
      return [];
    }
  }

  /**
   * Clear all registered algorithms
   */
  clear() {
    this.algorithms.paragraph.clear();
    this.algorithms.sentence.clear();
  }

  /**
   * Get summary of registered algorithms
   * @returns {Object} Summary object
   */
  getSummary() {
    return {
      paragraph: {
        count: this.algorithms.paragraph.size,
        algorithms: this.getMetadata('paragraph')
      },
      sentence: {
        count: this.algorithms.sentence.size,
        algorithms: this.getMetadata('sentence')
      }
    };
  }
}

module.exports = AlgorithmRegistry;