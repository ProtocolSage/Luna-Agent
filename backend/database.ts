import Database from 'better-sqlite3';
import type { Database as DatabaseInstance } from 'better-sqlite3';

// Centralized database connection manager
const dbInstances = new Map<string, DatabaseInstance>();

/**
 * Returns a singleton database instance for the given path.
 * Creates the instance if it doesn't exist.
 */
export function getDatabase(dbPath: string = './memory/luna-memory.db'): DatabaseInstance {
  if (!dbInstances.has(dbPath)) {
    const db = new Database(dbPath, { verbose: console.log });
    db.pragma('journal_mode = WAL');
    dbInstances.set(dbPath, db);
  }
  return dbInstances.get(dbPath)!;
}

export type { DatabaseInstance };
