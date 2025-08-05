import Database from 'better-sqlite3';
import { createHash } from 'crypto';
import * as path from 'path';
import * as fs from 'fs';
import { MemoryDocument, SearchResult, SearchOptions } from '../../types';

// Database row interfaces for type safety
interface VectorStoreRow {
  id: string;
  content: string;
  embedding: string | null;  // JSON-serialized number array
  metadata: string;          // JSON-serialized object
  timestamp: string;
  type: string;             // MemoryDocument type values
  sessionId: string | null;
}

interface CountQueryResult {
  count: number;            // SQL COUNT(*) result
}

// OpenAI Embeddings API response structure
interface EmbeddingAPIResponse {
  data: Array<{
    embedding: number[];
    index: number;
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

export class VectorStore {
  private db: Database.Database;
  private embeddingCache = new Map<string, number[]>();
  private ready = false;
  
  constructor(dbPath?: string) {
    const memoryDir = path.join(process.cwd(), 'memory');
    if (!fs.existsSync(memoryDir)) {
      fs.mkdirSync(memoryDir, { recursive: true });
    }
    
    this.db = new Database(dbPath || path.join(memoryDir, 'vector-store.db'));
    this.initializeDatabase();
  }

  private initializeDatabase() {
    // Use memory_vectors table as specified in repair plan
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memory_vectors (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        embedding TEXT,
        metadata TEXT,
        timestamp TEXT NOT NULL,
        type TEXT NOT NULL,
        sessionId TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      );
      
      CREATE INDEX IF NOT EXISTS idx_memory_vectors_type ON memory_vectors(type);
      CREATE INDEX IF NOT EXISTS idx_memory_vectors_timestamp ON memory_vectors(timestamp);
      CREATE INDEX IF NOT EXISTS idx_memory_vectors_session ON memory_vectors(sessionId);
    `);

    this.ready = true;
  }

  async initialize(): Promise<void> {
    console.log('VectorStore initialized with SQLite backend');
    this.ready = true;
  }

  isReady(): boolean {
    return this.ready;
  }

  async upsert(doc: MemoryDocument): Promise<void> {
    let embedding: number[] | null = null;
    
    // Generate embedding if available
    if (doc.embedding) {
      embedding = doc.embedding;
    } else {
      embedding = await this.createEmbedding(doc.content);
    }
    
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO memory_vectors (id, content, embedding, metadata, timestamp, type, sessionId)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      doc.id,
      doc.content,
      embedding ? JSON.stringify(embedding) : null,
      JSON.stringify(doc.metadata || {}),
      doc.timestamp,
      doc.type,
      doc.sessionId || null
    );
  }

  getDocument(id: string): MemoryDocument | undefined {
    const stmt = this.db.prepare('SELECT * FROM memory_vectors WHERE id = ?');
    const row = stmt.get(id) as VectorStoreRow;
    
    if (!row) return undefined;
    
    return {
      id: row.id,
      content: row.content,
      embedding: row.embedding ? JSON.parse(row.embedding) : undefined,
      metadata: JSON.parse(row.metadata || '{}'),
      timestamp: row.timestamp,
      type: row.type as MemoryDocument['type'],
      sessionId: row.sessionId ?? undefined
    };
  }

  getDocumentCount(): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM memory_vectors');
    const result = stmt.get() as CountQueryResult;
    return result.count;
  }

  deleteDocument(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM memory_vectors WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  clear(): void {
    this.db.prepare('DELETE FROM memory_vectors').run();
    this.embeddingCache.clear();
  }

  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const { limit = 10, type, sessionId, dateRange } = options;
    
    let sql = `
      SELECT * FROM memory_vectors 
      WHERE content LIKE ?
    `;
    
    const params: (string | number | null)[] = [`%${query}%`];
    
    if (type) {
      sql += ' AND type = ?';
      params.push(type);
    }
    
    if (sessionId) {
      sql += ' AND sessionId = ?';
      params.push(sessionId);
    }
    
    if (dateRange) {
      sql += ' AND timestamp BETWEEN ? AND ?';
      params.push(dateRange.start, dateRange.end);
    }
    
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);
    
    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as VectorStoreRow[];
    
    return rows.map(row => ({
      document: {
        id: row.id,
        content: row.content,
        embedding: row.embedding ? JSON.parse(row.embedding) : undefined,
        metadata: JSON.parse(row.metadata || '{}'),
        timestamp: row.timestamp,
        type: row.type as MemoryDocument['type'],
        sessionId: row.sessionId ?? undefined
      },
      similarity: 0.8 // Simple text-based similarity score
    }));
  }

  async similarity(query: string, limit: number = 10, threshold: number = 0.5): Promise<SearchResult[]> {
    // Generate query embedding if API available
    const queryEmbedding = await this.createEmbedding(query);
    
    if (queryEmbedding) {
      return this.vectorSimilaritySearch(queryEmbedding, limit, threshold);
    } else {
      // Fallback to text search
      return this.textSimilaritySearch(query, limit, threshold);
    }
  }

  private async vectorSimilaritySearch(queryEmbedding: number[], limit: number, threshold: number): Promise<SearchResult[]> {
    const stmt = this.db.prepare('SELECT * FROM memory_vectors WHERE embedding IS NOT NULL');
    const rows = stmt.all() as VectorStoreRow[];
    
    const results: SearchResult[] = [];
    
    for (const row of rows) {
      if (!row.embedding) continue;  // Skip rows without embeddings
      const docEmbedding = JSON.parse(row.embedding);
      const similarity = this.cosineSimilarity(queryEmbedding, docEmbedding);
      
      if (similarity >= threshold) {
        results.push({
          document: {
            id: row.id,
            content: row.content,
            embedding: docEmbedding,
            metadata: JSON.parse(row.metadata || '{}'),
            timestamp: row.timestamp,
            type: row.type as MemoryDocument['type'],
            sessionId: row.sessionId ?? undefined
          },
          similarity
        });
      }
    }
    
    return results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  private async textSimilaritySearch(query: string, limit: number, threshold: number): Promise<SearchResult[]> {
    const searchResults = await this.search(query, { limit });
    
    return searchResults.filter(result => {
      // Simple text similarity: count matching words
      const queryWords = query.toLowerCase().split(/\s+/);
      const contentWords = result.document.content.toLowerCase().split(/\s+/);
      const matches = queryWords.filter(word => contentWords.some(cw => cw.includes(word)));
      const similarity = matches.length / queryWords.length;
      
      // Update similarity score
      result.similarity = Math.max(similarity, 0.8); // Minimum for text matches
      
      return result.similarity >= threshold;
    });
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

  async createEmbedding(text: string): Promise<number[] | null> {
    if (!process.env.OPENAI_API_KEY) {
      return null;
    }

    const cacheKey = createHash('md5').update(text).digest('hex');
    if (this.embeddingCache.has(cacheKey)) {
      return this.embeddingCache.get(cacheKey)!;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      try {
        const response = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'text-embedding-3-small',
            input: text.slice(0, 8000)
          }),
          signal: controller.signal
        });

        if (!response.ok) {
          console.error('Embedding API error:', response.status);
          return null;
        }

        const data = await response.json() as EmbeddingAPIResponse;
        const embedding = data.data[0].embedding as number[];
        
        this.embeddingCache.set(cacheKey, embedding);
        return embedding;
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      console.error('Failed to create embedding:', error);
      return null;
    }
  }

  close(): void {
    this.db.close();
  }
}
