import * as fs from 'fs/promises';
import * as path from 'path';

// Type-safe session data interfaces
type SessionValue = string | number | boolean | null | SessionValue[] | { [key: string]: SessionValue };
type UserPreference = string | number | boolean | string[];
type ContextVariable = string | number | boolean | object | null;
type TemporaryData = SessionValue;

// TTL-aware temporary data structure
interface TTLTemporaryData {
  value: TemporaryData;
  expiresAt?: Date;
}

export interface SessionData {
  sessionId: string;
  createdAt: Date;
  lastActivity: Date;
  messageCount: number;
  userPreferences: Record<string, UserPreference>;
  contextVariables: Record<string, ContextVariable>;
  temporaryData: Record<string, TemporaryData | TTLTemporaryData>;
}

export class KVStore {
  private sessions: Map<string, SessionData> = new Map();
  private dataDir: string;
  private isInitialized = false;
  private saveTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.dataDir = path.join(__dirname, '../../data/sessions');
  }

  async initialize(): Promise<void> {
    try {
      await this.ensureDataDir();
      await this.loadExistingSessions();
      this.startPeriodicSave();
      this.isInitialized = true;
      console.log('KV store initialized');
    } catch (error) {
      console.error('Failed to initialize KV store:', error);
      throw error;
    }
  }

  async getSession(sessionId: string): Promise<SessionData | null> {
    if (!this.isInitialized) {
      return null;
    }

    const session = this.sessions.get(sessionId);
    if (session) {
      // Update last activity
      session.lastActivity = new Date();
      return { ...session }; // Return a copy
    }

    return null;
  }

  async setSession(sessionId: string, data: Partial<SessionData>): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    const existing = this.sessions.get(sessionId);
    const now = new Date();

    const sessionData: SessionData = {
      sessionId,
      createdAt: existing?.createdAt || now,
      lastActivity: now,
      messageCount: existing?.messageCount || 0,
      userPreferences: existing?.userPreferences || {},
      contextVariables: existing?.contextVariables || {},
      temporaryData: existing?.temporaryData || {},
      ...data
    };

    this.sessions.set(sessionId, sessionData);
  }

  async updateSession(sessionId: string, updates: Partial<SessionData>): Promise<void> {
    const existing = await this.getSession(sessionId);
    if (existing) {
      await this.setSession(sessionId, { ...existing, ...updates });
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
    
    try {
      const sessionPath = path.join(this.dataDir, `${sessionId}.json`);
      await fs.unlink(sessionPath);
    } catch (error) {
      // File might not exist or deletion failed - log for debugging
      console.debug(`Session file deletion warning for ${sessionId}:`, error);
    }
  }

  async getAllSessions(): Promise<Record<string, SessionData>> {
    const result: Record<string, SessionData> = {};
    
    for (const [sessionId, sessionData] of this.sessions) {
      result[sessionId] = { ...sessionData };
    }
    
    return result;
  }

  async getActiveSessions(maxAge: number = 24 * 60 * 60 * 1000): Promise<SessionData[]> {
    const cutoff = new Date(Date.now() - maxAge);
    const activeSessions: SessionData[] = [];

    for (const session of this.sessions.values()) {
      if (new Date(session.lastActivity) > cutoff) {
        activeSessions.push({ ...session });
      }
    }

    return activeSessions.sort((a, b) => 
      new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
    );
  }

  async setUserPreference(sessionId: string, key: string, value: UserPreference): Promise<void> {
    const session = await this.getSession(sessionId) || {
      sessionId,
      createdAt: new Date(),
      lastActivity: new Date(),
      messageCount: 0,
      userPreferences: {},
      contextVariables: {},
      temporaryData: {}
    };

    session.userPreferences[key] = value;
    await this.setSession(sessionId, session);
  }

  async getUserPreference(sessionId: string, key: string): Promise<UserPreference | undefined> {
    const session = await this.getSession(sessionId);
    return session?.userPreferences[key];
  }

  async setContextVariable(sessionId: string, key: string, value: ContextVariable): Promise<void> {
    const session = await this.getSession(sessionId) || {
      sessionId,
      createdAt: new Date(),
      lastActivity: new Date(),
      messageCount: 0,
      userPreferences: {},
      contextVariables: {},
      temporaryData: {}
    };

    session.contextVariables[key] = value;
    await this.setSession(sessionId, session);
  }

  async getContextVariable(sessionId: string, key: string): Promise<ContextVariable | undefined> {
    const session = await this.getSession(sessionId);
    return session?.contextVariables[key];
  }

  async setTemporaryData(sessionId: string, key: string, value: TemporaryData, ttl?: number): Promise<void> {
    const session = await this.getSession(sessionId) || {
      sessionId,
      createdAt: new Date(),
      lastActivity: new Date(),
      messageCount: 0,
      userPreferences: {},
      contextVariables: {},
      temporaryData: {}
    };

    const data: TTLTemporaryData = { value };
    if (ttl) {
      data.expiresAt = new Date(Date.now() + ttl);
    }

    session.temporaryData[key] = data as TemporaryData | TTLTemporaryData;
    await this.setSession(sessionId, session);
  }

  async getTemporaryData(sessionId: string, key: string): Promise<TemporaryData | undefined> {
    const session = await this.getSession(sessionId);
    const tempData = session?.temporaryData[key];
    
    if (!tempData) return undefined;

    // Type guard to check if this is TTL data
    if (typeof tempData === 'object' && tempData !== null && 'value' in tempData) {
      const ttlData = tempData as TTLTemporaryData;
      // Check if data has expired
      if (ttlData.expiresAt && new Date() > new Date(ttlData.expiresAt)) {
        // Remove expired data
        delete session!.temporaryData[key];
        await this.setSession(sessionId, session!);
        return undefined;
      }
      return ttlData.value;
    }

    // Return direct value if not TTL wrapped
    return tempData;
  }

  private async ensureDataDir(): Promise<void> {
    try {
      await fs.access(this.dataDir);
    } catch {
      await fs.mkdir(this.dataDir, { recursive: true });
    }
  }

  private async loadExistingSessions(): Promise<void> {
    try {
      const files = await fs.readdir(this.dataDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      for (const file of jsonFiles) {
        try {
          const filePath = path.join(this.dataDir, file);
          const content = await fs.readFile(filePath, 'utf8');
          const sessionData = JSON.parse(content);
          
          // Convert date strings back to Date objects
          sessionData.createdAt = new Date(sessionData.createdAt);
          sessionData.lastActivity = new Date(sessionData.lastActivity);
          
          this.sessions.set(sessionData.sessionId, sessionData);
        } catch (error) {
          console.warn(`Failed to load session from ${file}:`, error);
        }
      }

      console.log(`Loaded ${this.sessions.size} sessions from storage`);
    } catch (error) {
      console.debug('No existing session data found, starting fresh. Details:', error);
    }
  }

  private async saveAllSessions(): Promise<void> {
    try {
      for (const [sessionId, sessionData] of this.sessions) {
        const sessionPath = path.join(this.dataDir, `${sessionId}.json`);
        await fs.writeFile(sessionPath, JSON.stringify(sessionData, null, 2));
      }
    } catch (error) {
      console.error('Failed to save sessions:', error);
    }
  }

  private startPeriodicSave(): void {
    // Save sessions every 30 seconds
    this.saveTimer = setInterval(() => {
      this.saveAllSessions();
    }, 30000);
  }

  async cleanupExpiredSessions(maxAge: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
    const cutoff = new Date(Date.now() - maxAge);
    const toDelete: string[] = [];

    for (const [sessionId, session] of this.sessions) {
      if (new Date(session.lastActivity) < cutoff) {
        toDelete.push(sessionId);
      }
    }

    for (const sessionId of toDelete) {
      await this.deleteSession(sessionId);
    }

    console.log(`Cleaned up ${toDelete.length} expired sessions`);
    return toDelete.length;
  }

  async cleanupExpiredTemporaryData(): Promise<void> {
    const now = new Date();
    
    for (const [sessionId, session] of this.sessions) {
      let hasExpiredData = false;
      
      for (const [key, data] of Object.entries(session.temporaryData)) {
        // Type guard to check if this is TTL data
        if (typeof data === 'object' && data !== null && 'value' in data) {
          const ttlData = data as TTLTemporaryData;
          if (ttlData.expiresAt && now > new Date(ttlData.expiresAt)) {
            delete session.temporaryData[key];
            hasExpiredData = true;
          }
        }
      }
      
      if (hasExpiredData) {
        await this.setSession(sessionId, session);
      }
    }
  }

  async getSessionStats(): Promise<{
    totalSessions: number;
    activeSessions: number;
    averageMessageCount: number;
    oldestSession: Date | null;
    newestSession: Date | null;
  }> {
    const sessions = Array.from(this.sessions.values());
    const activeSessions = await this.getActiveSessions();
    
    const messageCounts = sessions.map(s => s.messageCount);
    const averageMessageCount = messageCounts.length > 0 ? 
      messageCounts.reduce((a, b) => a + b, 0) / messageCounts.length : 0;

    const createdDates = sessions.map(s => new Date(s.createdAt));
    const oldestSession = createdDates.length > 0 ? new Date(Math.min(...createdDates.map(d => d.getTime()))) : null;
    const newestSession = createdDates.length > 0 ? new Date(Math.max(...createdDates.map(d => d.getTime()))) : null;

    return {
      totalSessions: sessions.length,
      activeSessions: activeSessions.length,
      averageMessageCount,
      oldestSession,
      newestSession
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.ensureDataDir();
      return this.isInitialized;
    } catch {
      return false;
    }
  }

  async cleanup(): Promise<void> {
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
      this.saveTimer = null;
    }

    // Save all sessions before cleanup
    await this.saveAllSessions();
    
    // Cleanup expired data
    await this.cleanupExpiredSessions();
    await this.cleanupExpiredTemporaryData();
  }

  getStats(): {
    sessionCount: number;
    isInitialized: boolean;
    dataDir: string;
  } {
    return {
      sessionCount: this.sessions.size,
      isInitialized: this.isInitialized,
      dataDir: this.dataDir
    };
  }
}

