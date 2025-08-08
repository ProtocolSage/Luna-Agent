import { getDatabase } from '../backend/database';
import * as path from 'path';
import * as fs from 'fs';

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
export class MemoryStore {
  private db: any; // Database instance (better-sqlite3 or fallback)
  private dbPath: string;

  constructor(dbPath?: string) {
    // Ensure memory directory exists
    const memoryDir = path.dirname(dbPath || './memory/luna-memory.db');
    if (!fs.existsSync(memoryDir)) {
      fs.mkdirSync(memoryDir, { recursive: true });
    }

    this.dbPath = dbPath || path.join(memoryDir, 'luna-memory.db');
    this.db = getDatabase(this.dbPath);
    this.initializeDatabase();
  }

  /**
   * Initialize database schema
   * Creates memories table with proper indexes for fast querying
   */
  private initializeDatabase(): void {
    // Create memories table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        type TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        embedding TEXT, -- JSON-encoded embedding vector
        metadata TEXT   -- JSON-encoded metadata
      );
    `);

    // Create indexes for fast querying
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
      CREATE INDEX IF NOT EXISTS idx_memories_timestamp ON memories(timestamp);
      CREATE INDEX IF NOT EXISTS idx_memories_content_fts ON memories(content);
    `);

    // Enable WAL mode for better concurrency
    this.db.pragma('journal_mode = WAL');
  }

  /**
   * Add a new memory to the store
   */
  async addMemory(memory: Omit<Memory, 'id' | 'timestamp'>): Promise<Memory> {
    const id = this.generateId();
    const timestamp = new Date().toISOString();
    
    const fullMemory: Memory = {
      id,
      timestamp,
      ...memory
    };

    const stmt = this.db.prepare(`
      INSERT INTO memories (id, content, type, timestamp, embedding, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      fullMemory.id,
      fullMemory.content,
      fullMemory.type,
      fullMemory.timestamp,
      fullMemory.embedding ? JSON.stringify(fullMemory.embedding) : null,
      fullMemory.metadata ? JSON.stringify(fullMemory.metadata) : null
    );

    return fullMemory;
  }

  /**
   * Update an existing memory
   */
  async updateMemory(id: string, updates: Partial<Omit<Memory, 'id' | 'timestamp'>>): Promise<Memory | null> {
    const existing = await this.getMemoryById(id);
    if (!existing) return null;

    const updated: Memory = {
      ...existing,
      ...updates,
      id: existing.id, // Preserve ID
      timestamp: existing.timestamp // Preserve original timestamp
    };

    const stmt = this.db.prepare(`
      UPDATE memories 
      SET content = ?, type = ?, embedding = ?, metadata = ?
      WHERE id = ?
    `);

    const result = stmt.run(
      updated.content,
      updated.type,
      updated.embedding ? JSON.stringify(updated.embedding) : null,
      updated.metadata ? JSON.stringify(updated.metadata) : null,
      id
    );

    return result.changes > 0 ? updated : null;
  }

  /**
   * Delete a memory by ID
   */
  async deleteMemory(id: string): Promise<boolean> {
    const stmt = this.db.prepare('DELETE FROM memories WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Get a specific memory by ID
   */
  async getMemoryById(id: string): Promise<Memory | null> {
    const stmt = this.db.prepare('SELECT * FROM memories WHERE id = ?');
    const row = stmt.get(id) as any;
    
    return row ? this.rowToMemory(row) : null;
  }

  /**
   * Get memories by type
   */
  async getMemoriesByType(type: MemoryType, limit = 50, offset = 0): Promise<Memory[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM memories 
      WHERE type = ? 
      ORDER BY timestamp DESC 
      LIMIT ? OFFSET ?
    `);
    
    const rows = stmt.all(type, limit, offset) as any[];
    return rows.map(row => this.rowToMemory(row));
  }

  /**
   * Get recent memories across all types
   */
  async getRecentMemories(limit = 20, offset = 0): Promise<Memory[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM memories 
      ORDER BY timestamp DESC 
      LIMIT ? OFFSET ?
    `);
    
    const rows = stmt.all(limit, offset) as any[];
    return rows.map(row => this.rowToMemory(row));
  }

  /**
   * Full-text search across memory content
   * Uses simple LIKE queries as fallback when no embeddings available
   */
  async searchMemories(options: MemorySearchOptions): Promise<MemorySearchResult[]> {
    const { query, type, limit = 20, offset = 0, sinceTimestamp } = options;
    
    let sql = 'SELECT * FROM memories WHERE 1=1';
    const params: any[] = [];

    // Add type filter
    if (type) {
      sql += ' AND type = ?';
      params.push(type);
    }

    // Add timestamp filter
    if (sinceTimestamp) {
      sql += ' AND timestamp >= ?';
      params.push(sinceTimestamp);
    }

    // Add content search
    if (query) {
      sql += ' AND (content LIKE ? OR content LIKE ?)';
      params.push(`%${query}%`, `%${query.toLowerCase()}%`);
    }

    sql += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as any[];
    
    return rows.map(row => ({
      memory: this.rowToMemory(row),
      relevanceScore: query ? this.calculateSimpleRelevance(this.rowToMemory(row).content, query) : 1.0
    }));
  }

  /**
   * Vector similarity search (when embeddings are available)
   */
  async vectorSearch(embedding: number[], options: MemorySearchOptions = {}): Promise<MemorySearchResult[]> {
    const { type, limit = 10 } = options;
    
    let sql = 'SELECT * FROM memories WHERE embedding IS NOT NULL';
    const params: any[] = [];

    if (type) {
      sql += ' AND type = ?';
      params.push(type);
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as any[];
    
    // Calculate cosine similarity for each memory
    const results: MemorySearchResult[] = rows
      .map(row => {
        const memory = this.rowToMemory(row);
        const similarity = memory.embedding ? 
          this.cosineSimilarity(embedding, memory.embedding) : 0;
        
        return {
          memory,
          similarity
        };
      })
      .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
      .slice(0, limit);

    return results;
  }

  /**
   * Get memory statistics
   */
  async getStats(): Promise<{
    totalMemories: number;
    memoriesByType: Record<MemoryType, number>;
    memoriesWithEmbeddings: number;
    oldestMemory?: string;
    newestMemory?: string;
  }> {
    const totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM memories');
    const totalResult = totalStmt.get() as { count: number };

    const typeStmt = this.db.prepare('SELECT type, COUNT(*) as count FROM memories GROUP BY type');
    const typeResults = typeStmt.all() as { type: MemoryType; count: number }[];

    const embeddingStmt = this.db.prepare('SELECT COUNT(*) as count FROM memories WHERE embedding IS NOT NULL');
    const embeddingResult = embeddingStmt.get() as { count: number };

    const timeStmt = this.db.prepare('SELECT MIN(timestamp) as oldest, MAX(timestamp) as newest FROM memories');
    const timeResult = timeStmt.get() as { oldest?: string; newest?: string };

    const memoriesByType: Record<MemoryType, number> = {
      conversation: 0,
      document: 0,
      goal: 0,
      reminder: 0,
      journal: 0,
      note: 0,
      task: 0
    };

    typeResults.forEach(result => {
      memoriesByType[result.type] = result.count;
    });

    return {
      totalMemories: totalResult.count,
      memoriesByType,
      memoriesWithEmbeddings: embeddingResult.count,
      oldestMemory: timeResult.oldest,
      newestMemory: timeResult.newest
    };
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }

  // Private helper methods

  private generateId(): string {
    return `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private rowToMemory(row: any): Memory {
    return {
      id: row.id,
      content: row.content,
      type: row.type as MemoryType,
      timestamp: row.timestamp,
      embedding: row.embedding ? JSON.parse(row.embedding) : undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined
    };
  }

  private calculateSimpleRelevance(content: string, query: string): number {
    const contentLower = content.toLowerCase();
    const queryLower = query.toLowerCase();
    
    // Simple relevance: count of query term occurrences
    const matches = (contentLower.match(new RegExp(queryLower, 'g')) || []).length;
    const contentLength = content.length;
    
    return matches / Math.max(1, contentLength / 100); // Normalize by content length
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}
