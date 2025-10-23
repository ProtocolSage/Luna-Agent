import { Memory, MemoryType, MemorySearchOptions, MemorySearchResult } from './MemoryStore';
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
export declare class MemoryService {
    private store;
    private embeddings;
    constructor(dbPath?: string);
    /**
     * Add a new memory with automatic embedding generation
     */
    addMemory(content: string, type: MemoryType, metadata?: Record<string, any>): Promise<Memory>;
    /**
     * Update an existing memory
     */
    updateMemory(id: string, updates: Partial<{
        content: string;
        type: MemoryType;
        metadata: Record<string, any>;
    }>): Promise<Memory | null>;
    /**
     * Delete a memory by ID
     */
    deleteMemory(id: string): Promise<boolean>;
    /**
     * Get a specific memory by ID
     */
    getMemory(id: string): Promise<Memory | null>;
    /**
     * Get memories by type
     */
    getMemoriesByType(type: MemoryType, limit?: number, offset?: number): Promise<Memory[]>;
    /**
     * Get recent memories
     */
    getRecentMemories(limit?: number, offset?: number): Promise<Memory[]>;
    /**
     * Intelligent search that uses embeddings when available, falls back to text search
     */
    searchMemories(query: string, options?: MemorySearchOptions): Promise<MemorySearchResult[]>;
    /**
     * Find similar memories to existing content
     */
    findSimilarMemories(content: string, options?: MemorySearchOptions): Promise<MemorySearchResult[]>;
    /**
     * Get comprehensive memory statistics
     */
    getStats(): Promise<{
        totalMemories: number;
        memoriesByType: Record<MemoryType, number>;
        memoriesWithEmbeddings: number;
        embeddingServiceAvailable: boolean;
        oldestMemory?: string;
        newestMemory?: string;
    }>;
    /**
     * Batch add multiple memories efficiently
     */
    addMemoriesBatch(memories: Array<{
        content: string;
        type: MemoryType;
        metadata?: Record<string, any>;
    }>): Promise<Memory[]>;
    /**
     * Export all memories (for backup or migration)
     */
    exportMemories(): Promise<Memory[]>;
    /**
     * Close the memory service
     */
    close(): void;
}
export declare const memoryService: MemoryService;
