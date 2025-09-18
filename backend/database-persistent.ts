// File-based SQLite database using sql.js for Windows compatibility
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

// Try to import better-sqlite3 first, then sql.js as fallback
let Database: any = null;
let usingSqlJs = false;
let initSqlJs: any = null;
let SQL: any = null;

// Don't import at module load time, import in getDatabase function

// File system utilities
const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);
const mkdir = promisify(fs.mkdir);

interface DatabaseConfig {
  filename: string;
  autoSave?: boolean;
  saveInterval?: number; // ms
}

class BetterSQLiteDatabase {
  private db: any = null;
  private config: DatabaseConfig;

  constructor(config: DatabaseConfig) {
    this.config = config;
    this.init();
  }

  private init(): void {
    try {
      if (!Database) {
        throw new Error('better-sqlite3 not available');
      }

      // Ensure database directory exists
      const dbDir = path.dirname(this.config.filename);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }

      // Create better-sqlite3 database instance
      this.db = new Database(this.config.filename);
      
      // Set SQLite pragmas for performance and reliability
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = NORMAL');
      this.db.pragma('cache_size = 1000');
      this.db.pragma('temp_store = memory');

      console.log(`[BetterSQLiteDB] Database initialized: ${this.config.filename}`);
    } catch (error) {
      console.error('[BetterSQLiteDB] Failed to initialize:', error);
      throw error;
    }
  }

  // Implement better-sqlite3 compatible interface (already sync)
  exec(sql: string): this {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    
    this.db.exec(sql);
    return this;
  }

  prepare(sql: string): any {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    
    return this.db.prepare(sql);
  }

  pragma(setting: string, value?: any): any {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    if (value !== undefined) {
      return this.db.pragma(`${setting} = ${value}`);
    } else {
      return this.db.pragma(setting);
    }
  }

  transaction(fn: () => any): any {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    
    return this.db.transaction(fn)();
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      console.log('[BetterSQLiteDB] Database closed');
    }
  }
}


// Enhanced in-memory database fallback (from original implementation)
class InMemoryDatabase {
  private data = new Map<string, any[]>();
  private prepared = new Map<string, any>();
  private pragmaSettings = new Map<string, any>();
  private tables = new Map<string, any>();

  pragma(setting: string, value?: any) {
    if (value !== undefined) {
      this.pragmaSettings.set(setting, value);
    }
    return this.pragmaSettings.get(setting) || null;
  }

  exec(sql: string) {
    const statements = sql.split(';').filter(s => s.trim());
    
    for (const statement of statements) {
      const trimmed = statement.trim();
      if (!trimmed) continue;
      
      // Handle CREATE TABLE
      if (trimmed.toLowerCase().includes('create table')) {
        const match = trimmed.match(/create table\s+(?:if not exists\s+)?(\w+)/i);
        if (match) {
          const tableName = match[1];
          if (!this.data.has(tableName)) {
            this.data.set(tableName, []);
            this.tables.set(tableName, { schema: trimmed });
            console.log(`[InMemoryDB] Created table: ${tableName}`);
          }
        }
      }
    }
    return this;
  }

  prepare(sql: string) {
    const self = this;
    const preparedStmt = {
      run(...params: any[]) {
        const sqlLower = sql.toLowerCase().trim();
        
        // Handle INSERT
        if (sqlLower.includes('insert into')) {
          const match = sqlLower.match(/insert into\s+(\w+)/);
          if (match) {
            const tableName = match[1];
            const rows = self.data.get(tableName) || [];
            
            // Create a basic row object
            const newRow: any = {};
            if (params.length > 0) {
              // Simple parameter mapping - adjust based on actual schema
              if (tableName === 'memories') {
                newRow.id = Date.now();
                newRow.content = params[0] || '';
                newRow.timestamp = params[1] || Date.now();
                newRow.type = params[2] || 'default';
                newRow.session_id = params[3] || 'default';
                newRow.embedding = params[4] || null;
              } else {
                newRow.id = Date.now();
                newRow.data = params[0] || '';
              }
            }
            
            rows.push(newRow);
            self.data.set(tableName, rows);
            console.log(`[InMemoryDB] INSERT into ${tableName}:`, newRow);
            return { changes: 1, lastInsertRowid: newRow.id };
          }
        }
        
        return { changes: 0 };
      },
      
      all(...params: any[]) {
        const sqlLower = sql.toLowerCase().trim();
        
        if (sqlLower.includes('select')) {
          const match = sqlLower.match(/from\s+(\w+)/);
          if (match) {
            const tableName = match[1];
            const rows = self.data.get(tableName) || [];
            console.log(`[InMemoryDB] SELECT from ${tableName}, found ${rows.length} rows`);
            return rows;
          }
        }
        
        return [];
      },
      
      get(...params: any[]) {
        const results = this.all(...params);
        return results[0] || null;
      },

      iterate(...params: any[]) {
        const rows = this.all(...params);
        return {
          [Symbol.iterator]: function* () {
            for (const row of rows) {
              yield row;
            }
          }
        };
      }
    };
    
    this.prepared.set(sql, preparedStmt);
    return preparedStmt;
  }

  transaction(fn: () => any): any {
    try {
      return fn();
    } catch (error) {
      console.error('[InMemoryDB] Transaction error:', error);
      throw error;
    }
  }

  close() {
    this.data.clear();
    this.prepared.clear();
    this.pragmaSettings.clear();
    this.tables.clear();
    console.log('[InMemoryDB] Database closed');
  }
}

// Database connection manager with persistent storage
const dbInstances = new Map<string, any>();

export function getDatabase(dbPath: string = './memory/luna-memory.db'): any {
  if (dbInstances.has(dbPath)) {
    return dbInstances.get(dbPath);
  }

  let db: any;
  
  try {
    // Try to import better-sqlite3 dynamically
    if (!Database) {
      try {
        Database = require('better-sqlite3');
        console.log('[Database] better-sqlite3 imported successfully');
      } catch (importError: unknown) {
        console.warn('[Database] better-sqlite3 not available:', importError instanceof Error ? importError.message : String(importError));
        throw new Error('better-sqlite3 not available');
      }
    }
    
    db = new BetterSQLiteDatabase({
      filename: dbPath
    });
    console.log('[Database] Using better-sqlite3 for persistent storage');
  } catch (error) {
    console.warn('[Database] Failed to initialize persistent database, falling back to in-memory:', error instanceof Error ? error.message : error);
    db = new InMemoryDatabase();
    console.log('[Database] Using in-memory database fallback');
  }

  dbInstances.set(dbPath, db);
  return db;
}

// Export for backward compatibility
export { BetterSQLiteDatabase, InMemoryDatabase };
export default getDatabase;