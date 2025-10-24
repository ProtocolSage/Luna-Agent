export interface Session {
  id: string;
  userId: string;
  createdAt: Date;
  lastAccessed: Date;
  data: Record<string, unknown>;
}

class SessionStore {
  private sessions = new Map<string, Session>();

  get(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  set(session: Session): void {
    this.sessions.set(session.id, session);
  }

  delete(id: string): boolean {
    return this.sessions.delete(id);
  }

  has(id: string): boolean {
    return this.sessions.has(id);
  }

  clear(): void {
    this.sessions.clear();
  }

  size(): number {
    return this.sessions.size;
  }

  // Update last accessed time
  touch(id: string): boolean {
    const session = this.sessions.get(id);
    if (session) {
      session.lastAccessed = new Date();
      return true;
    }
    return false;
  }
}

export const sessionStore = new SessionStore();
