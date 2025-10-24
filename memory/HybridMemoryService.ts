import {
  MemoryStore,
  Memory,
  MemoryType,
  MemorySearchOptions,
  MemorySearchResult,
} from "./MemoryStore";
import { SupabaseMemoryStore } from "./SupabaseMemoryStore";
import { EmbeddingService, embeddingService } from "./EmbeddingService";

/**
 * Hybrid Memory Service for Luna Agent
 *
 * Combines Supabase cloud storage with local fallback for maximum reliability
 * Features:
 * - Primary: Supabase with vector search and real-time sync
 * - Fallback: Local SQLite/in-memory storage
 * - Automatic embedding generation
 * - Intelligent hybrid search combining cloud and local results
 * - Seamless offline/online transitions
 */
export class HybridMemoryService {
  private cloudStore: SupabaseMemoryStore;
  private localStore: MemoryStore;
  private embeddings: EmbeddingService;
  private preferCloud = true;

  constructor(dbPath?: string) {
    // Initialize both stores
    this.cloudStore = new SupabaseMemoryStore();
    this.localStore = new MemoryStore(dbPath || "memory/luna-memory-local.db");
    this.embeddings = embeddingService;

    console.log("[HybridMemoryService] Initialized with cloud + local storage");
  }

  /**
   * Add a new memory with automatic embedding generation and dual storage
   */
  async addMemory(
    content: string,
    type: MemoryType,
    metadata?: Record<string, any>,
  ): Promise<Memory> {
    // Generate embedding if service is available
    let embedding: number[] | undefined;

    if (this.embeddings.isAvailable()) {
      try {
        const embeddingResult =
          await this.embeddings.generateEmbedding(content);
        embedding = embeddingResult?.embedding;
      } catch (error) {
        console.warn(
          "[HybridMemoryService] Failed to generate embedding:",
          error,
        );
      }
    }

    const memoryData = {
      content,
      type,
      embedding,
      metadata,
    };

    // Try cloud first, fallback to local
    if (this.preferCloud) {
      try {
        const cloudMemory = await this.cloudStore.addMemory(memoryData);

        // Also save locally as backup
        try {
          await this.localStore.addMemory(memoryData);
        } catch (localError) {
          console.warn(
            "[HybridMemoryService] Failed to backup to local storage:",
            localError,
          );
        }

        return cloudMemory;
      } catch (cloudError) {
        console.warn(
          "[HybridMemoryService] Cloud storage failed, using local:",
          cloudError,
        );
        return await this.localStore.addMemory(memoryData);
      }
    } else {
      // Local first (offline mode)
      const localMemory = await this.localStore.addMemory(memoryData);

      // Try to sync to cloud in background
      this.syncToCloudBackground(memoryData);

      return localMemory;
    }
  }

  /**
   * Update an existing memory with re-embedding if content changed
   */
  async updateMemory(
    id: string,
    updates: Partial<{
      content: string;
      type: MemoryType;
      metadata: Record<string, any>;
      embedding: number[];
    }>,
  ): Promise<Memory | null> {
    const canEmbed = this.embeddings.isAvailable();
    const contentChanged = typeof updates.content === "string";

    let finalUpdates = { ...updates };

    // Re-generate embedding if content changed and embedding service available
    if (canEmbed && contentChanged && updates.content) {
      try {
        const embeddingResult = await this.embeddings.generateEmbedding(
          updates.content,
        );
        if (embeddingResult?.embedding) {
          finalUpdates.embedding = embeddingResult.embedding;
        }
      } catch (error) {
        console.warn(
          "[HybridMemoryService] Failed to regenerate embedding:",
          error,
        );
      }
    }

    // Try cloud first, fallback to local
    if (this.preferCloud) {
      try {
        const cloudResult = await this.cloudStore.updateMemory(
          id,
          finalUpdates,
        );

        // Also update locally
        try {
          await this.localStore.updateMemory(id, finalUpdates);
        } catch (localError) {
          console.warn(
            "[HybridMemoryService] Failed to update local backup:",
            localError,
          );
        }

        return cloudResult;
      } catch (cloudError) {
        console.warn(
          "[HybridMemoryService] Cloud update failed, using local:",
          cloudError,
        );
        return await this.localStore.updateMemory(id, finalUpdates);
      }
    } else {
      return await this.localStore.updateMemory(id, finalUpdates);
    }
  }

  /**
   * Delete a memory from both stores
   */
  async deleteMemory(id: string): Promise<boolean> {
    let cloudSuccess = false;
    let localSuccess = false;

    // Try both stores
    if (this.preferCloud) {
      try {
        cloudSuccess = await this.cloudStore.deleteMemory(id);
      } catch (error) {
        console.warn("[HybridMemoryService] Cloud delete failed:", error);
      }
    }

    try {
      localSuccess = await this.localStore.deleteMemory(id);
    } catch (error) {
      console.warn("[HybridMemoryService] Local delete failed:", error);
    }

    return cloudSuccess || localSuccess;
  }

  /**
   * Get a specific memory by ID (try cloud first, fallback to local)
   */
  async getMemoryById(id: string): Promise<Memory | null> {
    if (this.preferCloud) {
      try {
        const cloudResult = await this.cloudStore.getMemoryById(id);
        if (cloudResult) return cloudResult;
      } catch (error) {
        console.warn(
          "[HybridMemoryService] Cloud get failed, trying local:",
          error,
        );
      }
    }

    return await this.localStore.getMemoryById(id);
  }

  /**
   * Get memories by type with hybrid results
   */
  async getMemoriesByType(
    type: MemoryType,
    limit = 50,
    offset = 0,
  ): Promise<Memory[]> {
    if (this.preferCloud) {
      try {
        return await this.cloudStore.getMemoriesByType(type, limit, offset);
      } catch (error) {
        console.warn(
          "[HybridMemoryService] Cloud query failed, using local:",
          error,
        );
        return await this.localStore.getMemoriesByType(type, limit, offset);
      }
    } else {
      return await this.localStore.getMemoriesByType(type, limit, offset);
    }
  }

  /**
   * Get recent memories with hybrid results
   */
  async getRecentMemories(limit = 20, offset = 0): Promise<Memory[]> {
    if (this.preferCloud) {
      try {
        return await this.cloudStore.getRecentMemories(limit, offset);
      } catch (error) {
        console.warn(
          "[HybridMemoryService] Cloud recent query failed, using local:",
          error,
        );
        return await this.localStore.getRecentMemories(limit, offset);
      }
    } else {
      return await this.localStore.getRecentMemories(limit, offset);
    }
  }

  /**
   * Advanced hybrid search combining cloud vector search with local fallback
   */
  async searchMemories(
    options: MemorySearchOptions,
  ): Promise<MemorySearchResult[]> {
    if (this.preferCloud) {
      try {
        const cloudResults = await this.cloudStore.searchMemories(options);

        // If cloud returns good results, use them
        if (cloudResults.length > 0) {
          return cloudResults;
        }

        // Otherwise supplement with local results
        const localResults = await this.localStore.searchMemories(options);
        return localResults;
      } catch (error) {
        console.warn(
          "[HybridMemoryService] Cloud search failed, using local:",
          error,
        );
        return await this.localStore.searchMemories(options);
      }
    } else {
      return await this.localStore.searchMemories(options);
    }
  }

  /**
   * Vector similarity search with hybrid approach
   */
  async vectorSearch(
    embedding: number[],
    options: MemorySearchOptions = {},
  ): Promise<MemorySearchResult[]> {
    if (this.preferCloud) {
      try {
        const cloudResults = await this.cloudStore.vectorSearch(
          embedding,
          options,
        );

        // Cloud has native pgvector support, prefer its results
        if (cloudResults.length > 0) {
          return cloudResults;
        }
      } catch (error) {
        console.warn(
          "[HybridMemoryService] Cloud vector search failed, using local:",
          error,
        );
      }
    }

    // Fallback to local vector search
    return await this.localStore.vectorSearch(embedding, options);
  }

  /**
   * Intelligent search that uses embeddings when available, text search otherwise
   */
  async intelligentSearch(
    query: string,
    options: MemorySearchOptions = {},
  ): Promise<MemorySearchResult[]> {
    // Try vector search first if embeddings are available
    if (this.embeddings.isAvailable()) {
      try {
        const queryEmbedding = await this.embeddings.generateEmbedding(query);
        if (queryEmbedding?.embedding) {
          const vectorResults = await this.vectorSearch(
            queryEmbedding.embedding,
            {
              ...options,
              limit: Math.min(options.limit || 10, 20), // Get more candidates for vector search
            },
          );

          if (vectorResults.length > 0) {
            return vectorResults;
          }
        }
      } catch (error) {
        console.warn(
          "[HybridMemoryService] Vector search failed, falling back to text search:",
          error,
        );
      }
    }

    // Fallback to text search
    return await this.searchMemories({ ...options, query });
  }

  /**
   * Get comprehensive memory statistics from both stores
   */
  async getStats(): Promise<{
    totalMemories: number;
    memoriesByType: Record<MemoryType, number>;
    memoriesWithEmbeddings: number;
    oldestMemory?: string;
    newestMemory?: string;
    cloudStats?: any;
    localStats?: any;
  }> {
    let cloudStats, localStats;

    // Get cloud stats
    if (this.preferCloud) {
      try {
        cloudStats = await this.cloudStore.getStats();
      } catch (error) {
        console.warn("[HybridMemoryService] Failed to get cloud stats:", error);
      }
    }

    // Get local stats
    try {
      localStats = await this.localStore.getStats();
    } catch (error) {
      console.warn("[HybridMemoryService] Failed to get local stats:", error);
    }

    // Combine stats (prefer cloud if available)
    const primaryStats = cloudStats ||
      localStats || {
        totalMemories: 0,
        memoriesByType: {
          conversation: 0,
          document: 0,
          goal: 0,
          reminder: 0,
          journal: 0,
          note: 0,
          task: 0,
        },
        memoriesWithEmbeddings: 0,
      };

    return {
      ...primaryStats,
      cloudStats,
      localStats,
    };
  }

  /**
   * Switch between cloud and local preference
   */
  setCloudPreference(preferCloud: boolean): void {
    this.preferCloud = preferCloud;
    console.log(
      `[HybridMemoryService] Switched to ${preferCloud ? "cloud" : "local"} preference`,
    );
  }

  /**
   * Get current storage mode
   */
  getStorageMode(): "cloud" | "local" | "hybrid" {
    if (this.preferCloud) {
      return "cloud";
    } else {
      return "local";
    }
  }

  /**
   * Force sync local memories to cloud
   */
  async syncLocalToCloud(): Promise<void> {
    try {
      console.log("[HybridMemoryService] Starting local to cloud sync...");

      const localMemories = await this.localStore.getRecentMemories(1000); // Get up to 1000 recent memories
      let synced = 0;
      let failed = 0;

      for (const memory of localMemories) {
        try {
          await this.cloudStore.addMemory({
            content: memory.content,
            type: memory.type,
            embedding: memory.embedding,
            metadata: memory.metadata,
          });
          synced++;
        } catch (error) {
          console.warn(
            `[HybridMemoryService] Failed to sync memory ${memory.id}:`,
            error,
          );
          failed++;
        }
      }

      console.log(
        `[HybridMemoryService] Sync complete: ${synced} synced, ${failed} failed`,
      );
    } catch (error) {
      console.error("[HybridMemoryService] Sync operation failed:", error);
    }
  }

  /**
   * Close both stores
   */
  async close(): Promise<void> {
    try {
      await this.cloudStore.close();
    } catch (error) {
      console.warn("[HybridMemoryService] Error closing cloud store:", error);
    }

    try {
      this.localStore.close();
    } catch (error) {
      console.warn("[HybridMemoryService] Error closing local store:", error);
    }

    console.log("[HybridMemoryService] All stores closed");
  }

  // Private helper methods

  private async syncToCloudBackground(memoryData: any): Promise<void> {
    // Run in background without blocking
    setTimeout(async () => {
      try {
        await this.cloudStore.addMemory(memoryData);
        console.log(
          "[HybridMemoryService] Background sync to cloud successful",
        );
      } catch (error) {
        console.warn(
          "[HybridMemoryService] Background sync to cloud failed:",
          error,
        );
      }
    }, 100); // Small delay to not block main operation
  }
}

// Export singleton instance for use throughout the application
export const hybridMemoryService = new HybridMemoryService();
