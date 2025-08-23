const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

function hasCol(db,t,c){return db.prepare(`PRAGMA table_info(${t})`).all().some(r=>r.name===c);}
function tableExists(db,t){try{db.prepare(`SELECT 1 FROM ${t} LIMIT 1`).get();return true;}catch{ return false;}}
function ensure(db,sql){db.exec(sql);}

function migrate(dbPath){
  const db = new Database(dbPath);
  db.pragma('journal_mode=WAL');
  db.exec('BEGIN');

  // memories + columns
  ensure(db,`CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    type TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    embedding TEXT,
    metadata TEXT
  );`);
  if(!hasCol(db,'memories','sessionId')) db.exec(`ALTER TABLE memories ADD COLUMN sessionId TEXT;`);

  // indices for memories
  db.exec(`CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_memories_timestamp ON memories(timestamp DESC);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_memories_type_timestamp ON memories(type, timestamp DESC);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_memories_timestamp_type ON memories(timestamp DESC, type);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_memories_with_embedding ON memories(timestamp DESC) WHERE embedding IS NOT NULL;`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_memories_type_with_embedding ON memories(type, timestamp DESC) WHERE embedding IS NOT NULL;`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_memories_content_type ON memories(type) WHERE content IS NOT NULL;`);

  // vector table
  ensure(db,`CREATE TABLE IF NOT EXISTS memory_vectors (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    embedding BLOB,
    metadata TEXT,
    timestamp TEXT NOT NULL,
    type TEXT NOT NULL,
    sessionId TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_memory_vectors_type ON memory_vectors(type);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_memory_vectors_timestamp ON memory_vectors(timestamp);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_memory_vectors_session ON memory_vectors(sessionId);`);

  // FTS over memories + triggers
  ensure(db,`CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
    id UNINDEXED, content, type UNINDEXED, timestamp UNINDEXED,
    content='memories', content_rowid='rowid'
  );`);
  db.exec(`CREATE TRIGGER IF NOT EXISTS memories_fts_insert AFTER INSERT ON memories BEGIN
    INSERT INTO memories_fts(id, content, type, timestamp) VALUES(new.id, new.content, new.type, new.timestamp);
  END;`);
  db.exec(`CREATE TRIGGER IF NOT EXISTS memories_fts_delete AFTER DELETE ON memories BEGIN
    DELETE FROM memories_fts WHERE id = old.id;
  END;`);
  db.exec(`CREATE TRIGGER IF NOT EXISTS memories_fts_update AFTER UPDATE ON memories BEGIN
    DELETE FROM memories_fts WHERE id = old.id;
    INSERT INTO memories_fts(id, content, type, timestamp) VALUES(new.id, new.content, new.type, new.timestamp);
  END;`);

  // backfill FTS if empty
  const c = db.prepare(`SELECT count(*) AS c FROM memories_fts`).get().c;
  if (c === 0) db.exec(`INSERT INTO memories_fts(id, content, type, timestamp) SELECT id, content, type, timestamp FROM memories;`);

  db.exec('COMMIT'); db.close();
  console.log('[MIGRATED]', dbPath);
}

const root = process.cwd();
const candidates = new Set();
['memory','data'].forEach(dir=>{
  const p = path.join(root,dir);
  if(fs.existsSync(p)){
    for(const f of fs.readdirSync(p)){ if(f.endsWith('.db')) candidates.add(path.join(p,f)); }
  }
});
if(candidates.size===0){
  const guess = path.join(root,'memory','luna-memory.db');
  if(fs.existsSync(guess)) candidates.add(guess);
}
for(const db of candidates) migrate(db);
console.log('DONE', Array.from(candidates));
