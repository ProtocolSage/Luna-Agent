import {
  MemoryStore,
  Memory,
  MemoryType,
  MemorySearchOptions,
  MemorySearchResult,
} from "./MemoryStore";
import { EmbeddingService, embeddingService } from "./EmbeddingService";

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
export class MemoryService {
  private store: MemoryStore;
  private embeddings: EmbeddingService;

  constructor(dbPath?: string) {
    // Use a separate database file to avoid conflicts with the new backend memory system
    const legacyDbPath = dbPath || "memory/luna-memory-legacy.db";
    this.store = new MemoryStore(legacyDbPath);
    this.embeddings = embeddingService;
  }

  /**
   * Add a new memory with automatic embedding generation
   */
  async addMemory(
    content: string,
    type: MemoryType,
    metadata?: Record<string, any>,
  ): Promise<Memory> {
    // Generate embedding if service is available
    let embedding: number[] | undefined;

    if (this.embeddings.isAvailable()) {
      const embeddingResult = await this.embeddings.generateEmbedding(content);
      embedding = embeddingResult?.embedding;
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
  async updateMemory(
    id: string,
    updates: Partial<{
      content: string;
      type: MemoryType;
      metadata: Record<string, any>;
    }>,
  ): Promise<Memory | null> {
    const canEmbed = this.embeddings.isAvailable();
    const contentChanged = typeof updates.content === "string";

    if (contentChanged) {
      if (canEmbed) {
        const embeddingResult = await this.embeddings.generateEmbedding(
          updates.content!,
        );
        if (embeddingResult?.embedding) {
          updates = {
            ...updates,
            embedding: embeddingResult.embedding,
          } as any;
        } else {
          // CLEAR when embedding generation fails
          updates = {
            ...updates,
            embedding: null,
          } as any;
        }
      } else {
        // CLEAR when we can't re-embed
        updates = {
          ...updates,
          embedding: null,
        } as any;
      }
    }

    return await this.store.updateMemory(id, updates);
  }

  /**
   * Delete a memory by ID
   */
  async deleteMemory(id: string): Promise<boolean> {
    return await this.store.deleteMemory(id);
  }

  /**
   * Get a specific memory by ID
   */
  async getMemory(id: string): Promise<Memory | null> {
    return await this.store.getMemoryById(id);
  }

  /**
   * Get memories by type
   */
  async getMemoriesByType(
    type: MemoryType,
    limit = 50,
    offset = 0,
  ): Promise<Memory[]> {
    return await this.store.getMemoriesByType(type, limit, offset);
  }

  /**
   * Get recent memories
   */
  async getRecentMemories(limit = 20, offset = 0): Promise<Memory[]> {
    return await this.store.getRecentMemories(limit, offset);
  }

  /**
   * Intelligent search that uses embeddings when available, falls back to text search
   */
  async searchMemories(
    query: string,
    options: MemorySearchOptions = {},
  ): Promise<MemorySearchResult[]> {
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
  async findSimilarMemories(
    content: string,
    options: MemorySearchOptions = {},
  ): Promise<MemorySearchResult[]> {
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
  async getStats(): Promise<{
    totalMemories: number;
    memoriesByType: Record<MemoryType, number>;
    memoriesWithEmbeddings: number;
    embeddingServiceAvailable: boolean;
    oldestMemory?: string;
    newestMemory?: string;
  }> {
    const storeStats = await this.store.getStats();

    return {
      ...storeStats,
      embeddingServiceAvailable: this.embeddings.isAvailable(),
    };
  }

  /**
   * Batch add multiple memories efficiently
   */
  async addMemoriesBatch(
    memories: Array<{
      content: string;
      type: MemoryType;
      metadata?: Record<string, any>;
    }>,
  ): Promise<Memory[]> {
    const results: Memory[] = [];

    // Generate embeddings in batch if available
    if (this.embeddings.isAvailable()) {
      const contents = memories.map((m) => m.content);
      const embeddings =
        await this.embeddings.generateEmbeddingsBatch(contents);

      for (let i = 0; i < memories.length; i++) {
        const memory = memories[i];
        const embedding = embeddings[i]?.embedding;

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
  async exportMemories(): Promise<Memory[]> {
    return await this.store.getRecentMemories(10000, 0); // Get all memories
  }

  /**
   * Close the memory service
   */
  close(): void {
    this.store.close();
  }
}

// Singleton instance for global use
export const memoryService = new MemoryService();
