export interface Memory {
    id: string;
    content: string;
    type: MemoryType;
    timestamp: string;
    embedding?: number[];
    metadata?: Record<string, any>;
}
export type MemoryType = 'conversation' | 'document' | 'goal' | 'reminder' | 'journal' | 'note' | 'task';
export interface MemorySearchOptions {
    type?: MemoryType;
    limit?: number;
    offset?: number;
    query?: string;
    sinceTimestamp?: string;
}
export interface MemorySearchResult {
    memory: Memory;
    similarity?: number;
    relevanceScore?: number;
}
/**
 * SQLite-based persistent memory store for Luna Agent
 * Features:
 * - Persistent storage with better-sqlite3
 * - Vector embeddings support
 * - Full-text search capabilities
 * - Type-safe memory operations
 * - Fast synchronous operations for single-user mode
 */
export declare class MemoryStore {
    private db;
    private dbPath;
    constructor(dbPath?: string);
    /**
     * Initialize database schema
     * Creates memories table with proper indexes for fast querying
     */
    private initializeDatabase;
    /**
     * Add a new memory to the store
     */
    addMemory(memory: Omit<Memory, 'id' | 'timestamp'>): Promise<Memory>;
    /**
     * Update an existing memory
     */
    updateMemory(id: string, updates: Partial<Omit<Memory, 'id' | 'timestamp'>>): Promise<Memory | null>;
    /**
     * Delete a memory by ID
     */
    deleteMemory(id: string): Promise<boolean>;
    /**
     * Get a specific memory by ID
     */
    getMemoryById(id: string): Promise<Memory | null>;
    /**
     * Get memories by type
     */
    getMemoriesByType(type: MemoryType, limit?: number, offset?: number): Promise<Memory[]>;
    /**
     * Get recent memories across all types
     */
    getRecentMemories(limit?: number, offset?: number): Promise<Memory[]>;
    /**
     * Full-text search across memory content
     * Uses FTS5 when available, falls back to LIKE queries
     */
    searchMemories(options: MemorySearchOptions): Promise<MemorySearchResult[]>;
    /**
     * Search using FTS5 full-text search
     */
    private searchMemoriesFTS;
    /**
     * Search using regular SQL queries
     */
    private searchMemoriesSQL;
    /**
     * Check if FTS5 support is available
     */
    private hasFTSSupport;
    /**
     * Calculate relevance score from FTS5 rank
     */
    private calculateFTSRelevance;
    /**
     * Vector similarity search (when embeddings are available)
     */
    vectorSearch(embedding: number[], options?: MemorySearchOptions): Promise<MemorySearchResult[]>;
    /**
     * Get memory statistics
     */
    getStats(): Promise<{
        totalMemories: number;
        memoriesByType: Record<MemoryType, number>;
        memoriesWithEmbeddings: number;
        oldestMemory?: string;
        newestMemory?: string;
    }>;
    /**
     * Close database connection
     */
    close(): void;
    private generateId;
    private rowToMemory;
    private calculateSimpleRelevance;
    private cosineSimilarity;
}
