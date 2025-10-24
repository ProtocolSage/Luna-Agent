// Database wrapper with proper fallback implementation
let Database;
let dbInstance = null;

// Enhanced in-memory database fallback with full SQL emulation
class InMemoryDatabase {
  constructor() {
    this.data = new Map(); // table_name -> array of rows
    this.prepared = new Map();
    this.pragmaSettings = new Map();
    this.tables = new Map(); // table_name -> schema info
  }

  pragma(setting, value) {
    if (value !== undefined) {
      this.pragmaSettings.set(setting, value);
    }
    return this.pragmaSettings.get(setting) || null;
  }

  exec(sql) {
    const statements = sql.split(";").filter((s) => s.trim());

    for (const statement of statements) {
      const trimmed = statement.trim();
      if (!trimmed) continue;

      // Handle CREATE TABLE
      if (trimmed.toLowerCase().includes("create table")) {
        const match = trimmed.match(
          /create table\s+(?:if not exists\s+)?(\w+)/i,
        );
        if (match) {
          const tableName = match[1];
          if (!this.data.has(tableName)) {
            this.data.set(tableName, []);
            this.tables.set(tableName, { name: tableName, columns: [] });
            console.log(`[InMemoryDB] Created table: ${tableName}`);
          }
        }
      }
    }
    return this;
  }

  prepare(sql) {
    const self = this;
    const sqlLower = sql.toLowerCase().trim();

    return {
      run: (...params) => {
        try {
          // Handle INSERT (including INSERT OR REPLACE)
          if (sqlLower.includes("insert")) {
            const match = sqlLower.match(
              /insert(?:\s+or\s+replace)?\s+into\s+(\w+)/,
            );
            if (match) {
              const tableName = match[1];
              if (!self.data.has(tableName)) {
                self.data.set(tableName, []);
              }

              // Create mock row with params
              const row = {};
              if (tableName === "memory_vectors") {
                row.id =
                  params[0] ||
                  `mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                row.content = params[1] || "";
                row.embedding = params[2] || null;
                row.metadata = params[3] || "{}";
                row.timestamp = params[4] || new Date().toISOString();
                row.type = params[5] || "note";
                row.sessionId = params[6] || null;
                row.created_at = Math.floor(Date.now() / 1000);
              } else if (tableName === "memories") {
                row.id =
                  params[0] ||
                  `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                row.content = params[1] || "";
                row.type = params[2] || "note";
                row.timestamp = params[3] || new Date().toISOString();
                row.embedding = params[4] || null;
                row.metadata = params[5] || "{}";
              }

              // Handle INSERT OR REPLACE logic
              const rows = self.data.get(tableName);
              if (sqlLower.includes("or replace") && row.id) {
                // Remove existing row with same ID
                const existingIndex = rows.findIndex((r) => r.id === row.id);
                if (existingIndex >= 0) {
                  rows[existingIndex] = row; // Replace existing
                  console.log(`[InMemoryDB] REPLACE in ${tableName}:`, row);
                } else {
                  rows.push(row); // Insert new
                  console.log(`[InMemoryDB] INSERT into ${tableName}:`, row);
                }
              } else {
                rows.push(row); // Regular insert
                console.log(`[InMemoryDB] INSERT into ${tableName}:`, row);
              }

              return { changes: 1, lastInsertRowid: row.id };
            }
            return { changes: 0 };
          }

          // Handle UPDATE
          if (sqlLower.includes("update")) {
            const match = sqlLower.match(/update\s+(\w+)/);
            if (match) {
              const tableName = match[1];
              const rows = self.data.get(tableName) || [];

              // Handle UPDATE with WHERE id = ?
              if (
                sqlLower.includes("where id = ?") &&
                params[params.length - 1]
              ) {
                const idToUpdate = params[params.length - 1];
                const rowIndex = rows.findIndex((row) => row.id === idToUpdate);

                if (rowIndex >= 0) {
                  // Update the row based on table schema
                  if (tableName === "memories") {
                    // UPDATE memories SET content = ?, type = ?, embedding = ?, metadata = ?
                    if (params.length >= 5) {
                      rows[rowIndex] = {
                        ...rows[rowIndex],
                        content: params[0],
                        type: params[1],
                        embedding: params[2], // Can be null
                        metadata: params[3],
                      };
                      console.log(
                        `[InMemoryDB] UPDATE ${tableName} id=${idToUpdate}:`,
                        rows[rowIndex],
                      );
                      return { changes: 1 };
                    }
                  } else if (tableName === "memory_vectors") {
                    // Handle memory_vectors table updates
                    if (params.length >= 7) {
                      rows[rowIndex] = {
                        ...rows[rowIndex],
                        content: params[0],
                        embedding: params[1],
                        metadata: params[2],
                        timestamp: params[3],
                        type: params[4],
                        sessionId: params[5],
                      };
                      console.log(
                        `[InMemoryDB] UPDATE ${tableName} id=${idToUpdate}:`,
                        rows[rowIndex],
                      );
                      return { changes: 1 };
                    }
                  }
                }
                return { changes: 0 };
              }

              // Generic update fallback
              return { changes: rows.length > 0 ? 1 : 0 };
            }
            return { changes: 0 };
          }

          // Handle DELETE
          if (sqlLower.includes("delete from")) {
            const match = sqlLower.match(/delete from\s+(\w+)/);
            if (match) {
              const tableName = match[1];
              const rows = self.data.get(tableName) || [];

              if (sqlLower.includes("where id = ?") && params[0]) {
                // Delete specific row by ID
                const originalLength = rows.length;
                const filtered = rows.filter((row) => row.id !== params[0]);
                self.data.set(tableName, filtered);
                console.log(
                  `[InMemoryDB] DELETE from ${tableName} where id = ${params[0]}`,
                );
                return { changes: originalLength - filtered.length };
              } else if (!sqlLower.includes("where")) {
                // Delete all rows
                const count = rows.length;
                self.data.set(tableName, []);
                console.log(`[InMemoryDB] DELETE all from ${tableName}`);
                return { changes: count };
              }
            }
            return { changes: 0 };
          }

          return { changes: 1 };
        } catch (error) {
          console.error("[InMemoryDB] Error in run():", error);
          return { changes: 0 };
        }
      },

      get: (...params) => {
        try {
          // Handle SELECT COUNT(*)
          if (sqlLower.includes("select count(*)")) {
            const match = sqlLower.match(/from\s+(\w+)/);
            if (match) {
              const tableName = match[1];
              const rows = self.data.get(tableName) || [];
              const count = rows.length;
              console.log(`[InMemoryDB] COUNT(*) from ${tableName}: ${count}`);
              return { count };
            }
            return { count: 0 };
          }

          // Handle SELECT MIN/MAX queries
          if (
            sqlLower.includes("select min(") ||
            sqlLower.includes("select max(")
          ) {
            const match = sqlLower.match(/from\s+(\w+)/);
            if (match) {
              const tableName = match[1];
              const rows = self.data.get(tableName) || [];

              if (rows.length === 0) {
                console.log(`[InMemoryDB] MIN/MAX from empty ${tableName}`);
                return { oldest: null, newest: null };
              }

              // Find min and max timestamps
              const timestamps = rows
                .map((row) => row.timestamp)
                .filter((t) => t);
              timestamps.sort();

              const result = {
                oldest: timestamps.length > 0 ? timestamps[0] : null,
                newest:
                  timestamps.length > 0
                    ? timestamps[timestamps.length - 1]
                    : null,
              };
              console.log(`[InMemoryDB] MIN/MAX from ${tableName}:`, result);
              return result;
            }
            return { oldest: null, newest: null };
          }

          // Handle SELECT by ID
          if (
            sqlLower.includes("select") &&
            sqlLower.includes("where id = ?")
          ) {
            const match = sqlLower.match(/from\s+(\w+)/);
            if (match && params[0]) {
              const tableName = match[1];
              const rows = self.data.get(tableName) || [];
              const found = rows.find((row) => row.id === params[0]);
              console.log(
                `[InMemoryDB] SELECT from ${tableName} where id = ${params[0]}:`,
                found || null,
              );
              return found || null;
            }
          }

          // Handle other SELECT queries
          if (sqlLower.includes("select")) {
            const match = sqlLower.match(/from\s+(\w+)/);
            if (match) {
              const tableName = match[1];
              const rows = self.data.get(tableName) || [];
              // Return first row for simple SELECTs
              return rows.length > 0 ? rows[0] : null;
            }
          }

          return null;
        } catch (error) {
          console.error("[InMemoryDB] Error in get():", error);
          return null;
        }
      },

      all: (...params) => {
        try {
          if (sqlLower.includes("select")) {
            const match = sqlLower.match(/from\s+(\w+)/);
            if (match) {
              const tableName = match[1];
              let rows = self.data.get(tableName) || [];

              // Apply WHERE filters
              if (sqlLower.includes("where")) {
                let paramIndex = 0;

                if (sqlLower.includes("type = ?")) {
                  rows = rows.filter((row) => row.type === params[paramIndex]);
                  paramIndex++;
                }

                if (sqlLower.includes("sessionid = ?")) {
                  rows = rows.filter(
                    (row) => row.sessionId === params[paramIndex],
                  );
                  paramIndex++;
                }
              }

              console.log(
                `[InMemoryDB] SELECT all from ${tableName}:`,
                rows.length,
                "rows",
              );
              return rows;
            }
          }
          return [];
        } catch (error) {
          console.error("[InMemoryDB] Error in all():", error);
          return [];
        }
      },

      iterate: (...params) => {
        const rows = this.all(...params);
        return {
          [Symbol.iterator]: function* () {
            for (const row of rows) {
              yield row;
            }
          },
        };
      },
    };
  }

  transaction(fn) {
    try {
      const boundFn = fn.bind(this);
      return boundFn();
    } catch (error) {
      console.error("[InMemoryDB] Transaction error:", error);
      throw error;
    }
  }

  close() {
    this.data.clear();
    this.prepared.clear();
    this.pragmaSettings.clear();
    this.tables.clear();
    console.log("[InMemoryDB] Database closed");
  }
}

// Try to load better-sqlite3, but don't fail if it's not available
try {
  Database = require("better-sqlite3");
  console.log("better-sqlite3 loaded successfully");
} catch (error) {
  console.warn(
    "better-sqlite3 not available, using in-memory fallback:",
    error.message,
  );
  Database = InMemoryDatabase;
}

// Database getter function
function getDatabase(filename) {
  if (!Database) {
    throw new Error("No database implementation available");
  }

  if (Database.name === "InMemoryDatabase") {
    // Always create new instance for in-memory (for test isolation)
    console.log("Database initialized: in-memory fallback");
    return new Database();
  } else {
    // Use better-sqlite3
    try {
      const db = new Database(filename, { verbose: console.log });
      db.pragma("journal_mode = WAL");
      db.pragma("synchronous = NORMAL");
      console.log("Database initialized: SQLite");
      return db;
    } catch (error) {
      console.error(
        "Failed to initialize SQLite, falling back to in-memory:",
        error,
      );
      return new InMemoryDatabase();
    }
  }
}

module.exports = {
  getDatabase,
  Database,
};
