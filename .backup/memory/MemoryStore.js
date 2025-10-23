"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryStore = void 0;
const database_1 = require("../backend/database");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
/**
 * SQLite-based persistent memory store for Luna Agent
 * Features:
 * - Persistent storage with better-sqlite3
 * - Vector embeddings support
 * - Full-text search capabilities
 * - Type-safe memory operations
 * - Fast synchronous operations for single-user mode
 */
class MemoryStore {
    constructor(dbPath) {
        // Ensure memory directory exists
        const memoryDir = path.dirname(dbPath || './memory/luna-memory.db');
        if (!fs.existsSync(memoryDir)) {
            fs.mkdirSync(memoryDir, { recursive: true });
        }
        this.dbPath = dbPath || path.join(memoryDir, 'luna-memory.db');
        this.db = (0, database_1.getDatabase)(this.dbPath);
        this.initializeDatabase();
    }
    /**
     * Initialize database schema
     * Creates memories table with proper indexes for fast querying
     */
    initializeDatabase() {
        try {
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
        -- Basic indexes for common queries
        CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
        CREATE INDEX IF NOT EXISTS idx_memories_timestamp ON memories(timestamp DESC);
        
        -- Composite indexes for common query patterns
        CREATE INDEX IF NOT EXISTS idx_memories_type_timestamp ON memories(type, timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_memories_timestamp_type ON memories(timestamp DESC, type);
        
        -- Partial indexes for embeddings (only rows with embeddings)
        CREATE INDEX IF NOT EXISTS idx_memories_with_embedding ON memories(timestamp DESC) WHERE embedding IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_memories_type_with_embedding ON memories(type, timestamp DESC) WHERE embedding IS NOT NULL;
        
        -- Index for content search optimization
        CREATE INDEX IF NOT EXISTS idx_memories_content_type ON memories(type) WHERE content IS NOT NULL;
      `);
            // Create FTS5 virtual table for full-text search (if supported)
            try {
                this.db.exec(`
          CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
            id UNINDEXED,
            content,
            type UNINDEXED,
            timestamp UNINDEXED,
            content='memories',
            content_rowid='rowid'
          );
        `);
                // Create triggers to keep FTS table in sync
                this.db.exec(`
          CREATE TRIGGER IF NOT EXISTS memories_fts_insert AFTER INSERT ON memories BEGIN
            INSERT INTO memories_fts(id, content, type, timestamp) VALUES(new.id, new.content, new.type, new.timestamp);
          END;
          
          CREATE TRIGGER IF NOT EXISTS memories_fts_delete AFTER DELETE ON memories BEGIN
            DELETE FROM memories_fts WHERE id = old.id;
          END;
          
          CREATE TRIGGER IF NOT EXISTS memories_fts_update AFTER UPDATE ON memories BEGIN
            DELETE FROM memories_fts WHERE id = old.id;
            INSERT INTO memories_fts(id, content, type, timestamp) VALUES(new.id, new.content, new.type, new.timestamp);
          END;
        `);
                console.log('[MemoryStore] FTS5 full-text search enabled');
            }
            catch (error) {
                console.warn('[MemoryStore] FTS5 not supported, using LIKE queries for search');
            }
            // Enable WAL mode for better concurrency (if supported)
            try {
                this.db.pragma('journal_mode = WAL');
                this.db.pragma('synchronous = NORMAL');
                this.db.pragma('cache_size = 1000');
                this.db.pragma('temp_store = memory');
                console.log('[MemoryStore] Database optimizations applied');
            }
            catch (error) {
                console.warn('[MemoryStore] Some database optimizations not supported');
            }
            console.log('[MemoryStore] Database initialized successfully');
        }
        catch (error) {
            console.error('[MemoryStore] Failed to initialize database:', error);
            throw error;
        }
    }
    /**
     * Add a new memory to the store
     */
    async addMemory(memory) {
        const id = this.generateId();
        const timestamp = new Date().toISOString();
        const fullMemory = {
            id,
            timestamp,
            ...memory
        };
        const stmt = this.db.prepare(`
      INSERT INTO memories (id, content, type, timestamp, embedding, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
        stmt.run(fullMemory.id, fullMemory.content, fullMemory.type, fullMemory.timestamp, fullMemory.embedding ? JSON.stringify(fullMemory.embedding) : null, fullMemory.metadata ? JSON.stringify(fullMemory.metadata) : null);
        return fullMemory;
    }
    /**
     * Update an existing memory
     */
    async updateMemory(id, updates) {
        const existing = await this.getMemoryById(id);
        if (!existing)
            return null;
        const updated = {
            ...existing,
            ...updates,
            id: existing.id, // Preserve ID
            timestamp: existing.timestamp, // Preserve original timestamp
            // Handle explicit embedding updates (including clearing with null)
            embedding: 'embedding' in updates ? updates.embedding : existing.embedding
        };
        const stmt = this.db.prepare(`
      UPDATE memories 
      SET content = ?, type = ?, embedding = ?, metadata = ?
      WHERE id = ?
    `);
        const result = stmt.run(updated.content, updated.type, updated.embedding === null ? null : (updated.embedding ? JSON.stringify(updated.embedding) : null), updated.metadata ? JSON.stringify(updated.metadata) : null, id);
        return result.changes > 0 ? updated : null;
    }
    /**
     * Delete a memory by ID
     */
    async deleteMemory(id) {
        const stmt = this.db.prepare('DELETE FROM memories WHERE id = ?');
        const result = stmt.run(id);
        return result.changes > 0;
    }
    /**
     * Get a specific memory by ID
     */
    async getMemoryById(id) {
        const stmt = this.db.prepare('SELECT * FROM memories WHERE id = ?');
        const row = stmt.get(id);
        return row ? this.rowToMemory(row) : null;
    }
    /**
     * Get memories by type
     */
    async getMemoriesByType(type, limit = 50, offset = 0) {
        const stmt = this.db.prepare(`
      SELECT * FROM memories 
      WHERE type = ? 
      ORDER BY timestamp DESC 
      LIMIT ? OFFSET ?
    `);
        const rows = stmt.all(type, limit, offset);
        return rows.map(row => this.rowToMemory(row));
    }
    /**
     * Get recent memories across all types
     */
    async getRecentMemories(limit = 20, offset = 0) {
        const stmt = this.db.prepare(`
      SELECT * FROM memories 
      ORDER BY timestamp DESC 
      LIMIT ? OFFSET ?
    `);
        const rows = stmt.all(limit, offset);
        return rows.map(row => this.rowToMemory(row));
    }
    /**
     * Full-text search across memory content
     * Uses FTS5 when available, falls back to LIKE queries
     */
    async searchMemories(options) {
        const { query, type, limit = 20, offset = 0, sinceTimestamp } = options;
        // If we have a search query, try FTS5 first
        if (query && this.hasFTSSupport()) {
            return this.searchMemoriesFTS(options);
        }
        // Fallback to regular SQL search
        return this.searchMemoriesSQL(options);
    }
    /**
     * Search using FTS5 full-text search
     */
    async searchMemoriesFTS(options) {
        const { query, type, limit = 20, offset = 0, sinceTimestamp } = options;
        // Prepare FTS5 query - handle multi-word queries properly
        let ftsQuery = query || '';
        if (query && query.includes(' ')) {
            // For multi-word queries, try both phrase search and individual word search
            const words = query.split(' ').filter(w => w.length > 0);
            ftsQuery = `"${query}" OR ${words.join(' OR ')}`;
        }
        let sql = `
      SELECT m.*, f.rank 
      FROM memories_fts f 
      JOIN memories m ON f.id = m.id 
      WHERE memories_fts MATCH ?
    `;
        const params = [ftsQuery];
        // Add type filter
        if (type) {
            sql += ' AND m.type = ?';
            params.push(type);
        }
        // Add timestamp filter
        if (sinceTimestamp) {
            sql += ' AND m.timestamp >= ?';
            params.push(sinceTimestamp);
        }
        sql += ' ORDER BY f.rank, m.timestamp DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);
        try {
            const stmt = this.db.prepare(sql);
            const rows = stmt.all(...params);
            return rows.map(row => {
                const memory = this.rowToMemory(row);
                const relevanceScore = this.calculateFTSRelevance(row.rank);
                return {
                    memory,
                    similarity: relevanceScore,
                    relevanceScore
                };
            });
        }
        catch (error) {
            console.warn('[MemoryStore] FTS search failed, falling back to SQL:', error);
            return this.searchMemoriesSQL(options);
        }
    }
    /**
     * Search using regular SQL queries
     */
    async searchMemoriesSQL(options) {
        const { query, type, limit = 20, offset = 0, sinceTimestamp } = options;
        let sql = 'SELECT * FROM memories WHERE 1=1';
        const params = [];
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
        // Add content search with case-insensitive matching
        if (query) {
            sql += ' AND LOWER(content) LIKE LOWER(?)';
            params.push(`%${query}%`);
        }
        sql += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);
        const stmt = this.db.prepare(sql);
        const rows = stmt.all(...params);
        return rows.map(row => {
            const memory = this.rowToMemory(row);
            const relevanceScore = query ? this.calculateSimpleRelevance(memory.content, query) : 1.0;
            return {
                memory,
                similarity: relevanceScore,
                relevanceScore
            };
        });
    }
    /**
     * Check if FTS5 support is available
     */
    hasFTSSupport() {
        try {
            const stmt = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='memories_fts'");
            return stmt.get() !== undefined;
        }
        catch {
            return false;
        }
    }
    /**
     * Calculate relevance score from FTS5 rank
     */
    calculateFTSRelevance(rank) {
        // FTS5 rank is negative (more negative = better match)
        // Convert to positive score between 0 and 1
        return Math.max(0, Math.min(1, 1 + rank / 10));
    }
    /**
     * Vector similarity search (when embeddings are available)
     */
    async vectorSearch(embedding, options = {}) {
        const { type, limit = 10 } = options;
        let sql = 'SELECT * FROM memories WHERE embedding IS NOT NULL';
        const params = [];
        if (type) {
            sql += ' AND type = ?';
            params.push(type);
        }
        const stmt = this.db.prepare(sql);
        const rows = stmt.all(...params);
        // Calculate cosine similarity for each memory
        const results = rows
            .map(row => {
            const memory = this.rowToMemory(row);
            const similarity = memory.embedding ?
                this.cosineSimilarity(embedding, memory.embedding) : 0;
            return {
                memory,
                similarity,
                relevanceScore: similarity || 0
            };
        })
            .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
            .slice(0, limit);
        return results;
    }
    /**
     * Get memory statistics
     */
    async getStats() {
        const totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM memories');
        const totalResult = totalStmt.get();
        const typeStmt = this.db.prepare('SELECT type, COUNT(*) as count FROM memories GROUP BY type');
        const typeResults = typeStmt.all();
        const embeddingStmt = this.db.prepare('SELECT COUNT(*) as count FROM memories WHERE embedding IS NOT NULL');
        const embeddingResult = embeddingStmt.get();
        const timeStmt = this.db.prepare('SELECT MIN(timestamp) as oldest, MAX(timestamp) as newest FROM memories');
        const timeResult = timeStmt.get();
        const memoriesByType = {
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
    close() {
        this.db.close();
    }
    // Private helper methods
    generateId() {
        return `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    rowToMemory(row) {
        return {
            id: row.id,
            content: row.content,
            type: row.type,
            timestamp: row.timestamp,
            embedding: row.embedding != null ? JSON.parse(row.embedding) : null,
            metadata: row.metadata ? JSON.parse(row.metadata) : undefined
        };
    }
    calculateSimpleRelevance(content, query) {
        const contentLower = content.toLowerCase();
        const queryLower = query.toLowerCase();
        // Simple relevance: count of query term occurrences
        const matches = (contentLower.match(new RegExp(queryLower, 'g')) || []).length;
        const contentLength = content.length;
        return matches / Math.max(1, contentLength / 100); // Normalize by content length
    }
    cosineSimilarity(a, b) {
        if (a.length !== b.length)
            return 0;
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
exports.MemoryStore = MemoryStore;
