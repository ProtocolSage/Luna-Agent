import { createHash } from "crypto";
import * as path from "path";
import * as fs from "fs";
import { MemoryDocument, SearchResult, SearchOptions } from "../../types";

// Use the database wrapper instead of better-sqlite3 directly
const { getDatabase } = require("../../backend/database");

// Database row interfaces for type safety
interface VectorStoreRow {
  id: string;
  content: string;
  embedding: string | null; // JSON-serialized number array
  metadata: string; // JSON-serialized object
  timestamp: string;
  type: string; // MemoryDocument type values
  sessionId: string | null;
}

interface CountQueryResult {
  count: number; // SQL COUNT(*) result
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
  private db: any;
  private embeddingCache = new Map<string, number[]>();
  private ready = false;
  private dbPath: string;
  private initPromise: Promise<void> | null = null;

  constructor(dbPath?: string) {
    const memoryDir = path.join(process.cwd(), "memory");
    if (!fs.existsSync(memoryDir)) {
      fs.mkdirSync(memoryDir, { recursive: true });
    }

    this.dbPath = dbPath || path.join(memoryDir, "vector-store.db");
    // Initialize immediately but don't await
    this.initialize();
  }

  private async ensureReady(): Promise<void> {
    if (!this.ready) {
      if (this.initPromise) {
        await this.initPromise;
      } else {
        await this.initialize();
      }
    }
  }

  async initialize(): Promise<void> {
    if (this.ready) return;

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.initializeDatabase();
    await this.initPromise;
  }

  private async initializeDatabase(): Promise<void> {
    try {
      // Initialize database connection using the wrapper
      this.db = getDatabase(this.dbPath);

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
      console.log("VectorStore initialized with database backend");
    } catch (error) {
      console.error("Failed to initialize VectorStore:", error);
      throw error;
    }
  }

  isReady(): boolean {
    return this.ready;
  }

  async upsert(doc: MemoryDocument): Promise<void> {
    await this.ensureReady();
    let embedding: number[] | null = null;

    // Generate embedding if available
    if (doc.embedding) {
      embedding = doc.embedding;
    } else if (process.env.OPENAI_API_KEY) {
      try {
        embedding = await this.generateEmbedding(doc.content);
      } catch (error) {
        console.warn("Failed to generate embedding:", error);
      }
    }

    const row: VectorStoreRow = {
      id: doc.id,
      content: doc.content,
      embedding: embedding ? JSON.stringify(embedding) : null,
      metadata: JSON.stringify(doc.metadata || {}),
      timestamp: doc.timestamp || new Date().toISOString(),
      type: doc.type,
      sessionId: doc.sessionId || null,
    };

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO memory_vectors 
      (id, content, embedding, metadata, timestamp, type, sessionId)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      row.id,
      row.content,
      row.embedding,
      row.metadata,
      row.timestamp,
      row.type,
      row.sessionId,
    );

    console.log(
      `[VectorStore] Upserted document: ${doc.id}, changes: ${result.changes}`,
    );
  }

  async getDocument(id: string): Promise<MemoryDocument | null> {
    await this.ensureReady();

    const stmt = this.db.prepare("SELECT * FROM memory_vectors WHERE id = ?");
    const row = stmt.get(id) as VectorStoreRow | null;

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      content: row.content,
      embedding: row.embedding ? JSON.parse(row.embedding) : undefined,
      metadata: JSON.parse(row.metadata || "{}"),
      timestamp: row.timestamp,
      type: row.type as any,
      sessionId: row.sessionId || undefined,
    };
  }

  async getDocumentCount(): Promise<number> {
    await this.ensureReady();

    const stmt = this.db.prepare(
      "SELECT COUNT(*) as count FROM memory_vectors",
    );
    const result = stmt.get() as CountQueryResult | null;
    return result ? result.count : 0;
  }

  async deleteDocument(id: string): Promise<boolean> {
    await this.ensureReady();

    const stmt = this.db.prepare("DELETE FROM memory_vectors WHERE id = ?");
    const result = stmt.run(id);
    return (result && result.changes > 0) || false;
  }

  async clear(): Promise<void> {
    await this.ensureReady();

    this.db.prepare("DELETE FROM memory_vectors").run();
    this.embeddingCache.clear();
    console.log("[VectorStore] Cleared all documents");
  }

  async search(
    query: string,
    options: SearchOptions = {},
  ): Promise<SearchResult[]> {
    await this.ensureReady();

    const { limit = 10, threshold = 0.7, type, sessionId } = options;

    let sql = `
      SELECT id, content, embedding, metadata, timestamp, type, sessionId 
      FROM memory_vectors
    `;

    const params: any[] = [];
    const whereClauses: string[] = [];

    // Add filters
    if (type) {
      whereClauses.push("type = ?");
      params.push(type);
    }

    if (sessionId) {
      whereClauses.push("sessionId = ?");
      params.push(sessionId);
    }

    if (whereClauses.length > 0) {
      sql += " WHERE " + whereClauses.join(" AND ");
    }

    sql += " ORDER BY timestamp DESC LIMIT ?";
    params.push(limit);

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as VectorStoreRow[];

    const results: SearchResult[] = [];

    for (const row of rows) {
      const document: MemoryDocument = {
        id: row.id,
        content: row.content,
        embedding: row.embedding ? JSON.parse(row.embedding) : undefined,
        metadata: JSON.parse(row.metadata || "{}"),
        timestamp: row.timestamp,
        type: row.type as any,
        sessionId: row.sessionId || undefined,
      };

      let similarity = 0;

      // Try vector similarity if embeddings are available
      if (row.embedding && process.env.OPENAI_API_KEY) {
        try {
          const queryEmbedding = await this.generateEmbedding(query);
          const docEmbedding = JSON.parse(row.embedding);
          similarity = this.cosineSimilarity(queryEmbedding, docEmbedding);
        } catch (error) {
          console.warn("Failed to calculate vector similarity:", error);
        }
      }

      // Fallback to text similarity
      if (similarity === 0) {
        similarity = this.textSimilarity(
          query.toLowerCase(),
          row.content.toLowerCase(),
        );
      }

      if (similarity >= threshold) {
        results.push({
          document,
          similarity,
        });
      }
    }

    // Sort by similarity descending
    results.sort((a, b) => b.similarity - a.similarity);

    return results.slice(0, limit);
  }

  async similarity(
    query: string,
    k: number = 5,
    threshold: number = 0.7,
  ): Promise<SearchResult[]> {
    return this.search(query, { limit: k, threshold });
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    const cacheKey = createHash("md5").update(text).digest("hex");

    if (this.embeddingCache.has(cacheKey)) {
      return this.embeddingCache.get(cacheKey)!;
    }

    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OpenAI API key not configured");
    }

    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-ada-002",
        input: text,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data: EmbeddingAPIResponse = await response.json();
    const embedding = data.data[0].embedding;

    this.embeddingCache.set(cacheKey, embedding);
    return embedding;
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

    if (normA === 0 || normB === 0) return 0;

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private textSimilarity(query: string, content: string): number {
    // Simple text similarity based on common words
    const queryWords = new Set(query.toLowerCase().split(/\s+/));
    const contentWords = new Set(content.toLowerCase().split(/\s+/));

    const intersection = new Set(
      [...queryWords].filter((x) => contentWords.has(x)),
    );
    const union = new Set([...queryWords, ...contentWords]);

    return intersection.size / union.size;
  }
}

export default VectorStore;
