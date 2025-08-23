import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

let db: Database.Database | null = null;

function ensureDir(p: string) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }

export function getDB(): Database.Database {
  if (db) return db;
  const dbPath = process.env.DB_PATH || path.resolve(process.cwd(), 'memory', 'luna-memory.db');
  ensureDir(path.dirname(dbPath));
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');

  // Text rows (fast list/recent) - Make compatible with old MemoryStore
  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      type TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      embedding TEXT, -- JSON-encoded embedding vector
      metadata TEXT DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
    CREATE INDEX IF NOT EXISTS idx_memories_ts ON memories(timestamp DESC);
  `);

  // Semantic rows (+ FTS)
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_vectors (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      embedding BLOB,
      metadata TEXT,
      timestamp TEXT NOT NULL,
      type TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_mv_type ON memory_vectors(type);
    CREATE INDEX IF NOT EXISTS idx_mv_ts ON memory_vectors(timestamp DESC);
  `);

  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS memory_vectors_fts USING fts5(
      id UNINDEXED, content, type UNINDEXED, timestamp UNINDEXED, metadata UNINDEXED,
      content='memory_vectors', content_rowid='rowid'
    );
    CREATE TRIGGER IF NOT EXISTS mv_fts_insert AFTER INSERT ON memory_vectors BEGIN
      INSERT INTO memory_vectors_fts(id, content, type, timestamp, metadata)
      VALUES(new.id, new.content, new.type, new.timestamp, new.metadata);
    END;
    CREATE TRIGGER IF NOT EXISTS mv_fts_delete AFTER DELETE ON memory_vectors BEGIN
      DELETE FROM memory_vectors_fts WHERE id = old.id;
    END;
    CREATE TRIGGER IF NOT EXISTS mv_fts_update AFTER UPDATE ON memory_vectors BEGIN
      DELETE FROM memory_vectors_fts WHERE id = old.id;
      INSERT INTO memory_vectors_fts(id, content, type, timestamp, metadata)
      VALUES(new.id, new.content, new.type, new.timestamp, new.metadata);
    END;
  `);

  // Tool audit
  db.exec(`
    CREATE TABLE IF NOT EXISTS tool_audit (
      id TEXT PRIMARY KEY,
      tool TEXT NOT NULL,
      input TEXT NOT NULL,
      output TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      sessionId TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_tool_audit_tool ON tool_audit(tool);
    CREATE INDEX IF NOT EXISTS idx_tool_audit_ts ON tool_audit(created_at DESC);
  `);

  return db;
}
