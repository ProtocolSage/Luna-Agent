import { getDatabase, type DatabaseInstance } from "./database.js";

export interface SessionRow {
  id: string;
  user_id: string;
  created_at: string;
  last_accessed: string;
  data: string;
}

export interface DatabaseResult {
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * Backend Database Service with session management
 */
export class BackendDatabaseService {
  private db: DatabaseInstance;
  private initialized = false;

  constructor(dbPath?: string) {
    this.db = getDatabase(dbPath);
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Initialize sessions table
      await this.initSessionsTable();

      // Initialize other required tables
      await this.initOtherTables();

      this.initialized = true;
      console.log("[BackendDB] Database initialized successfully");
    } catch (error) {
      console.error("[BackendDB] Failed to initialize:", error);
      throw error;
    }
  }

  private async initSessionsTable(): Promise<void> {
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL DEFAULT 'anonymous',
        created_at TEXT NOT NULL,
        last_accessed TEXT NOT NULL,
        data TEXT DEFAULT '{}'
      )
    `;

    this.db.exec(createTableSQL);
    console.log("[BackendDB] Sessions table initialized");
  }

  private async initOtherTables(): Promise<void> {
    // Initialize conversations table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        title TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    // Initialize messages table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id)
      )
    `);

    // Initialize audit_events table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_events (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        details TEXT,
        ip_address TEXT,
        user_id TEXT,
        severity TEXT DEFAULT 'info',
        created_at TEXT NOT NULL
      )
    `);

    console.log("[BackendDB] Additional tables initialized");
  }

  async createSession(sessionData: SessionRow): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO sessions (id, user_id, created_at, last_accessed, data)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(
      sessionData.id,
      sessionData.user_id,
      sessionData.created_at,
      sessionData.last_accessed,
      sessionData.data,
    );

    console.log("[BackendDB] Session created:", sessionData.id);
  }

  async getSession(sessionId: string): Promise<DatabaseResult> {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM sessions WHERE id = ?
      `);

      const session = stmt.get(sessionId);

      if (session) {
        return {
          success: true,
          data: session,
        };
      } else {
        return {
          success: false,
          error: "Session not found",
        };
      }
    } catch (error) {
      console.error("[BackendDB] Error getting session:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async updateSessionAccess(sessionId: string): Promise<void> {
    const stmt = this.db.prepare(`
      UPDATE sessions SET last_accessed = ? WHERE id = ?
    `);

    stmt.run(new Date().toISOString(), sessionId);
    console.log("[BackendDB] Session access updated:", sessionId);
  }

  async touchSession(sessionId: string): Promise<void> {
    await this.updateSessionAccess(sessionId);
  }

  async run(sql: string, params: any[]): Promise<any> {
    const stmt = this.db.prepare(sql);
    return stmt.run(...params);
  }

  async logAuditEvent(event: {
    eventType: string;
    details?: string;
    ipAddress?: string;
    userId?: string;
    severity?: string;
  }): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO audit_events (id, event_type, details, ip_address, user_id, severity, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const eventId = `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    stmt.run(
      eventId,
      event.eventType,
      event.details || "",
      event.ipAddress || "",
      event.userId || "",
      event.severity || "info",
      new Date().toISOString(),
    );

    console.log("[BackendDB] Audit event logged:", event.eventType);
  }

  async createConversation(
    conversationId: string,
    title?: string,
  ): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO conversations (id, title, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `);

    const now = new Date().toISOString();
    stmt.run(conversationId, title || "New Conversation", now, now);
    console.log("[BackendDB] Conversation created:", conversationId);
  }

  async storeMessage(message: {
    id: string;
    conversationId: string;
    role: "user" | "assistant" | "system";
    content: string;
  }): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO messages (id, conversation_id, role, content, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(
      message.id,
      message.conversationId,
      message.role,
      message.content,
      new Date().toISOString(),
    );

    console.log("[BackendDB] Message stored:", message.id);
  }

  healthCheck(): boolean {
    try {
      const stmt = this.db.prepare("SELECT 1 as test");
      const result = stmt.get() as { test: number } | undefined;
      return !!(result && result.test === 1);
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.initialized = false;
      console.log("[BackendDB] Database closed");
    }
  }
}

export function getDatabaseService(dbPath?: string): BackendDatabaseService {
  return new BackendDatabaseService(dbPath);
}
