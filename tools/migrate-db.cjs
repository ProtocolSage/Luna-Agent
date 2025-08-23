// tools/migrate-db.cjs
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

function exists(p) { try { fs.accessSync(p); return true; } catch { return false; } }
function ensureDir(p) { if (!exists(p)) fs.mkdirSync(p, { recursive: true }); }
function nowStamp() { return new Date().toISOString().replace(/[:.]/g,'-'); }
function hasCol(db, t, c) { return db.prepare(`PRAGMA table_info(${t})`).all().some(r => r.name === c); }
function tableExists(db, t) {
  try { db.prepare(`SELECT 1 FROM ${t} LIMIT 1`).get(); return true; }
  catch { return false; }
}
function exec(db, sql) { db.exec(sql); }
function ensureIndex(db, name, sql) { exec(db, `CREATE INDEX IF NOT EXISTS ${name} ${sql}`); }

function backupFile(p) {
  const bakDir = path.join(path.dirname(p), 'backup');
  ensureDir(bakDir);
  const to = path.join(bakDir, `${path.basename(p)}.${nowStamp()}.bak`);
  fs.copyFileSync(p, to);
  console.log('[migrate-db] Backup ->', to);
}

function setWAL(db) {
  // Must be OUTSIDE any transaction
  try {
    const mode = db.pragma('journal_mode = WAL', { simple: true });
    console.log('[migrate-db] journal_mode =', Array.isArray(mode) ? mode[0].journal_mode : mode);
  } catch (e) {
    console.warn('[migrate-db] WARN: failed to set WAL (continuing):', e.message);
  }
}

function migrateOne(dbPath) {
  console.log('[migrate-db] Using DB:', dbPath);
  backupFile(dbPath);

  const db = new Database(dbPath);
  try {
    setWAL(db);

    db.exec('BEGIN IMMEDIATE');

    // --- memories table ---
    exec(db, `
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        type TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        embedding TEXT,
        metadata TEXT
      );
    `);
    if (!hasCol(db, 'memories', 'sessionId')) {
      exec(db, `ALTER TABLE memories ADD COLUMN sessionId TEXT;`);
    }

    // memories indexes
    ensureIndex(db, 'idx_memories_type',           'ON memories(type)');
    ensureIndex(db, 'idx_memories_timestamp',      'ON memories(timestamp DESC)');
    ensureIndex(db, 'idx_memories_type_timestamp', 'ON memories(type, timestamp DESC)');
    ensureIndex(db, 'idx_memories_timestamp_type', 'ON memories(timestamp DESC, type)');
    // Partial indexes are accepted by SQLite as plain CREATE INDEX IF NOT EXISTS with WHERE
    exec(db, `CREATE INDEX IF NOT EXISTS idx_memories_with_embedding ON memories(timestamp DESC) WHERE embedding IS NOT NULL;`);
    exec(db, `CREATE INDEX IF NOT EXISTS idx_memories_type_with_embedding ON memories(type, timestamp DESC) WHERE embedding IS NOT NULL;`);
    exec(db, `CREATE INDEX IF NOT EXISTS idx_memories_content_type ON memories(type) WHERE content IS NOT NULL;`);

    // --- memories_fts (keep external-content style if present; else create simple FTS) ---
    const hasMemoriesFts = tableExists(db, 'memories_fts');
    if (!hasMemoriesFts) {
      exec(db, `
        CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
          id UNINDEXED, content, type UNINDEXED, timestamp UNINDEXED
        );
      `);
    }
    // Triggers to maintain the FTS mirror (works whether external content or not)
    exec(db, `CREATE TRIGGER IF NOT EXISTS memories_fts_insert AFTER INSERT ON memories BEGIN
      INSERT INTO memories_fts(id, content, type, timestamp) VALUES(new.id, new.content, new.type, new.timestamp);
    END;`);
    exec(db, `CREATE TRIGGER IF NOT EXISTS memories_fts_delete AFTER DELETE ON memories BEGIN
      DELETE FROM memories_fts WHERE id = old.id;
    END;`);
    exec(db, `CREATE TRIGGER IF NOT EXISTS memories_fts_update AFTER UPDATE ON memories BEGIN
      DELETE FROM memories_fts WHERE id = old.id;
      INSERT INTO memories_fts(id, content, type, timestamp) VALUES(new.id, new.content, new.type, new.timestamp);
    END;`);
    // Backfill if empty
    const mCount = db.prepare(`SELECT COUNT(*) AS c FROM memories_fts`).get().c;
    if (mCount === 0) {
      exec(db, `INSERT INTO memories_fts(id, content, type, timestamp)
                SELECT id, content, type, timestamp FROM memories;`);
    }

    // --- memory_vectors table ---
    exec(db, `
      CREATE TABLE IF NOT EXISTS memory_vectors (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        embedding TEXT,             -- stores Buffer/JSON; SQLite is typeless so this is fine
        metadata TEXT,
        timestamp TEXT NOT NULL,
        type TEXT NOT NULL,
        sessionId TEXT,
        created_at INTEGER DEFAULT (strftime('%s','now'))
      );
    `);

    ensureIndex(db, 'idx_memory_vectors_type',    'ON memory_vectors(type)');
    ensureIndex(db, 'idx_memory_vectors_ts',      'ON memory_vectors(timestamp)');
    ensureIndex(db, 'idx_memory_vectors_session', 'ON memory_vectors(sessionId)');

    // --- memory_vectors_fts (needed by keyword() fallback) ---
    exec(db, `
      CREATE VIRTUAL TABLE IF NOT EXISTS memory_vectors_fts USING fts5(
        id UNINDEXED, content, type UNINDEXED, timestamp UNINDEXED, sessionId UNINDEXED
      );
    `);
    exec(db, `CREATE TRIGGER IF NOT EXISTS mv_fts_insert AFTER INSERT ON memory_vectors BEGIN
      INSERT INTO memory_vectors_fts(id, content, type, timestamp, sessionId)
      VALUES(new.id, new.content, new.type, new.timestamp, new.sessionId);
    END;`);
    exec(db, `CREATE TRIGGER IF NOT EXISTS mv_fts_delete AFTER DELETE ON memory_vectors BEGIN
      DELETE FROM memory_vectors_fts WHERE id = old.id;
    END;`);
    exec(db, `CREATE TRIGGER IF NOT EXISTS mv_fts_update AFTER UPDATE ON memory_vectors BEGIN
      DELETE FROM memory_vectors_fts WHERE id = old.id;
      INSERT INTO memory_vectors_fts(id, content, type, timestamp, sessionId)
      VALUES(new.id, new.content, new.type, new.timestamp, new.sessionId);
    END;`);
    const mvCount = db.prepare(`SELECT COUNT(*) AS c FROM memory_vectors_fts`).get().c;
    if (mvCount === 0) {
      exec(db, `INSERT INTO memory_vectors_fts(id, content, type, timestamp, sessionId)
                SELECT id, content, type, timestamp, sessionId FROM memory_vectors;`);
    }

    db.exec('COMMIT');
    console.log('[migrate-db] OK:', dbPath);
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch {}
    console.error('[migrate-db][ERROR]', e);
    process.exitCode = 1;
  } finally {
    db.close();
  }
}

function main() {
  const root = process.cwd();
  const candidates = new Set();

  for (const dir of ['memory', 'data']) {
    const p = path.join(root, dir);
    if (exists(p)) {
      for (const f of fs.readdirSync(p)) {
        if (f.endsWith('.db')) candidates.add(path.join(p, f));
      }
    }
  }
  if (candidates.size === 0) {
    const guess = path.join(root, 'memory', 'luna-memory.db');
    if (exists(guess)) candidates.add(guess);
  }
  if (candidates.size === 0) {
    console.error('[migrate-db] No DB files found. Expected in ./memory or ./data');
    process.exit(2);
  }

  for (const db of candidates) migrateOne(db);

  if (process.exitCode && process.exitCode !== 0) {
    console.error('[migrate-db] Completed WITH ERRORS');
  } else {
    console.log('[migrate-db] DONE');
  }
}

main();
