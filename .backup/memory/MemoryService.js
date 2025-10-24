"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.memoryService = exports.MemoryService = void 0;
const MemoryStore_1 = require("./MemoryStore");
const EmbeddingService_1 = require("./EmbeddingService");
/**
 * High-level Memory Service for Luna Agent
 *
 * Combines MemoryStore and EmbeddingService for complete memory operations
 * Features:
 * - Automatic embedding generation when available
 * - Intelligent search with vector similarity
 * - Type-safe memory operations
 * - Performance optimizations for common operations
 */
class MemoryService {
  constructor(dbPath) {
    this.store = new MemoryStore_1.MemoryStore(dbPath);
    this.embeddings = EmbeddingService_1.embeddingService;
  }
  /**
   * Add a new memory with automatic embedding generation
   */
  async addMemory(content, type, metadata) {
    // Generate embedding if service is available
    let embedding;
    if (this.embeddings.isAvailable()) {
      const embeddingResult = await this.embeddings.generateEmbedding(content);
      embedding =
        embeddingResult === null || embeddingResult === void 0
          ? void 0
          : embeddingResult.embedding;
    }
    return await this.store.addMemory({
      content,
      type,
      embedding,
      metadata,
    });
  }
  /**
   * Update an existing memory
   */
  async updateMemory(id, updates) {
    const canEmbed = this.embeddings.isAvailable();
    const contentChanged = typeof updates.content === "string";
    if (contentChanged) {
      if (canEmbed) {
        const embeddingResult = await this.embeddings.generateEmbedding(
          updates.content,
        );
        if (
          embeddingResult === null || embeddingResult === void 0
            ? void 0
            : embeddingResult.embedding
        ) {
          updates = {
            ...updates,
            embedding: embeddingResult.embedding,
          };
        } else {
          // CLEAR when embedding generation fails
          updates = {
            ...updates,
            embedding: null,
          };
        }
      } else {
        // CLEAR when we can't re-embed
        updates = {
          ...updates,
          embedding: null,
        };
      }
    }
    return await this.store.updateMemory(id, updates);
  }
  /**
   * Delete a memory by ID
   */
  async deleteMemory(id) {
    return await this.store.deleteMemory(id);
  }
  /**
   * Get a specific memory by ID
   */
  async getMemory(id) {
    return await this.store.getMemoryById(id);
  }
  /**
   * Get memories by type
   */
  async getMemoriesByType(type, limit = 50, offset = 0) {
    return await this.store.getMemoriesByType(type, limit, offset);
  }
  /**
   * Get recent memories
   */
  async getRecentMemories(limit = 20, offset = 0) {
    return await this.store.getRecentMemories(limit, offset);
  }
  /**
   * Intelligent search that uses embeddings when available, falls back to text search
   */
  async searchMemories(query, options = {}) {
    // Try vector search first if embeddings are available
    if (this.embeddings.isAvailable()) {
      const queryEmbedding = await this.embeddings.generateEmbedding(query);
      if (queryEmbedding) {
        const vectorResults = await this.store.vectorSearch(
          queryEmbedding.embedding,
          options,
        );
        if (vectorResults.length > 0) {
          return vectorResults;
        }
      }
    }
    // Fallback to text search
    return await this.store.searchMemories({ ...options, query });
  }
  /**
   * Find similar memories to existing content
   */
  async findSimilarMemories(content, options = {}) {
    if (this.embeddings.isAvailable()) {
      const contentEmbedding = await this.embeddings.generateEmbedding(content);
      if (contentEmbedding) {
        return await this.store.vectorSearch(contentEmbedding.embedding, {
          ...options,
          limit: options.limit || 10,
        });
      }
    }
    // Fallback to content-based search
    return await this.store.searchMemories({
      ...options,
      query: content.substring(0, 100),
    });
  }
  /**
   * Get comprehensive memory statistics
   */
  async getStats() {
    const storeStats = await this.store.getStats();
    return {
      ...storeStats,
      embeddingServiceAvailable: this.embeddings.isAvailable(),
    };
  }
  /**
   * Batch add multiple memories efficiently
   */
  async addMemoriesBatch(memories) {
    var _a;
    const results = [];
    // Generate embeddings in batch if available
    if (this.embeddings.isAvailable()) {
      const contents = memories.map((m) => m.content);
      const embeddings =
        await this.embeddings.generateEmbeddingsBatch(contents);
      for (let i = 0; i < memories.length; i++) {
        const memory = memories[i];
        const embedding =
          (_a = embeddings[i]) === null || _a === void 0
            ? void 0
            : _a.embedding;
        const result = await this.store.addMemory({
          ...memory,
          embedding,
        });
        results.push(result);
      }
    } else {
      // Add without embeddings
      for (const memory of memories) {
        const result = await this.store.addMemory(memory);
        results.push(result);
      }
    }
    return results;
  }
  /**
   * Export all memories (for backup or migration)
   */
  async exportMemories() {
    return await this.store.getRecentMemories(10000, 0); // Get all memories
  }
  /**
   * Close the memory service
   */
  close() {
    this.store.close();
  }
}
exports.MemoryService = MemoryService;
// Singleton instance for global use
exports.memoryService = new MemoryService();
