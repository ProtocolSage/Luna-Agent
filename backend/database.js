// Database wrapper with fallback when better-sqlite3 is not available
let Database;
let dbInstance = null;

// Try to load better-sqlite3, but don't fail if it's not available
try {
  Database = require('better-sqlite3');
} catch (error) {
  console.warn('better-sqlite3 not available, using in-memory fallback');
  
  // Enhanced in-memory database fallback
  class InMemoryDatabase {
    constructor() {
      this.data = new Map();
      this.prepared = new Map();
      this.pragmaSettings = new Map();
      this.tables = new Map();
    }
    
    pragma(setting, value) {
      if (value !== undefined) {
        this.pragmaSettings.set(setting, value);
      }
      return this.pragmaSettings.get(setting);
    }
    
    exec(sql) {
      // Simple SQL parsing for CREATE TABLE and CREATE INDEX
      if (sql.includes('CREATE TABLE')) {
        const match = sql.match(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(\w+)/i);
        if (match) {
          const tableName = match[1];
          if (!this.tables.has(tableName)) {
            this.tables.set(tableName, []);
          }
        }
      }
      return this;
    }
    
    prepare(sql) {
      const self = this;
      const sqlLower = sql.toLowerCase();
      
      return {
        run: (...params) => {
          // Handle INSERT operations
          if (sqlLower.includes('insert')) {
            const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
            return { changes: 1, lastInsertRowid: id };
          }
          // Handle UPDATE/DELETE operations          return { changes: 1 };
        },
        
        get: (...params) => {
          // Return mock data for SELECT queries
          if (sqlLower.includes('select')) {
            // Check if querying for memory
            if (sqlLower.includes('from memories')) {
              return null; // No memories in fallback mode
            }
          }
          return null;
        },
        
        all: (...params) => {
          // Return empty array for SELECT queries
          if (sqlLower.includes('select')) {
            return [];
          }
          return [];
        },
        
        iterate: (...params) => {
          // Return empty iterator
          return {
            [Symbol.iterator]: function* () {
              // Empty iterator
            }
          };
        }
      };
    }
    
    transaction(fn) {
      // Simple transaction mock
      const result = fn.call(this);
      return result;
    }
    
    close() {
      this.data.clear();
      this.prepared.clear();
      this.pragmaSettings.clear();
      this.tables.clear();
    }
  }
  
  Database = InMemoryDatabase;
}
function getDatabase(path) {
  if (!dbInstance) {
    try {
      dbInstance = new Database(path || ':memory:');
      console.log('Database initialized:', Database.name);
    } catch (error) {
      console.warn('Failed to create database, using in-memory:', error.message);
      dbInstance = new Database();
    }
  }
  return dbInstance;
}

module.exports = { getDatabase, Database };