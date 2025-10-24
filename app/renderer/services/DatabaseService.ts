interface DatabaseConfig {
  path?: string;
  inMemory?: boolean;
}

interface QueryResult {
  rows: any[];
  changes?: number;
  lastId?: number;
}

export class DatabaseService {
  private static instance: DatabaseService;
  private db: any = null;

  private constructor(config?: DatabaseConfig) {
    this.initializeDatabase(config);
  }

  public static getInstance(config?: DatabaseConfig): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService(config);
    }
    return DatabaseService.instance;
  }

  private initializeDatabase(config?: DatabaseConfig): void {
    try {
      // Try to use better-sqlite3 if available
      const Database = require("better-sqlite3");

      if (config?.inMemory) {
        this.db = new Database(":memory:");
        console.log("[Database] Using in-memory SQLite database");
      } else {
        const dbPath = config?.path || "./luna-agent.db";
        this.db = new Database(dbPath);
        console.log(`[Database] Using SQLite database at: ${dbPath}`);
      }

      this.setupTables();
    } catch (error: any) {
      // Fall back to in-memory implementation
      console.warn(
        "[Database] Better-sqlite3 not available, using in-memory fallback",
      );
      console.warn(
        "[Database] To enable persistent storage, install Visual Studio Build Tools",
      );

      // Use the in-memory fallback
      const InMemoryDatabase = require("./InMemoryDatabase");
      this.db = new InMemoryDatabase();
    }
  }

  private setupTables(): void {
    if (!this.db || !this.db.prepare) {
      // In-memory fallback doesn't need table setup
      return;
    }

    // Messages table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        metadata TEXT
      )
    `);

    // Settings table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
  }

  // Messages methods
  public getMessages(limit: number = 100): any[] {
    if (this.db.getMessages) {
      // Using in-memory fallback
      return this.db.getMessages(limit);
    }

    const stmt = this.db.prepare(
      "SELECT * FROM messages ORDER BY id DESC LIMIT ?",
    );
    return stmt.all(limit).reverse();
  }

  public addMessage(role: string, content: string, metadata: any = {}): any {
    if (this.db.addMessage) {
      // Using in-memory fallback
      return this.db.addMessage(role, content, metadata);
    }

    const stmt = this.db.prepare(
      "INSERT INTO messages (role, content, metadata) VALUES (?, ?, ?)",
    );
    const result = stmt.run(role, content, JSON.stringify(metadata));
    return {
      id: result.lastInsertRowid,
      role,
      content,
      metadata,
    };
  }

  public clearMessages(): boolean {
    if (this.db.clearMessages) {
      // Using in-memory fallback
      return this.db.clearMessages();
    }

    this.db.exec("DELETE FROM messages");
    return true;
  }

  // Settings methods
  public getSetting(key: string): any {
    if (this.db.getSetting) {
      // Using in-memory fallback
      return this.db.getSetting(key);
    }

    const stmt = this.db.prepare("SELECT value FROM settings WHERE key = ?");
    const row = stmt.get(key);
    return row ? JSON.parse(row.value) : null;
  }

  public setSetting(key: string, value: any): boolean {
    if (this.db.setSetting) {
      // Using in-memory fallback
      return this.db.setSetting(key, value);
    }

    const stmt = this.db.prepare(
      "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
    );
    stmt.run(key, JSON.stringify(value));
    return true;
  }

  // Generic query execution (for advanced use)
  public execute(query: string, params: any[] = []): QueryResult {
    if (!this.db.prepare) {
      // In-memory fallback doesn't support raw queries
      console.warn("[Database] Raw queries not supported in fallback mode");
      return { rows: [], changes: 0 };
    }

    const stmt = this.db.prepare(query);

    if (query.trim().toUpperCase().startsWith("SELECT")) {
      return { rows: stmt.all(...params) };
    } else {
      const result = stmt.run(...params);
      return {
        rows: [],
        changes: result.changes,
        lastId: result.lastInsertRowid,
      };
    }
  }

  public close(): void {
    if (this.db && this.db.close) {
      this.db.close();
    }
  }
}
