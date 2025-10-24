// Import persistent database implementation
import { getDatabase as getPersistentDatabase } from "./database-persistent";

/**
 * Returns a database instance with persistent file storage.
 * Automatically handles fallback to in-memory if file persistence fails.
 */
export function getDatabase(dbPath: string = "./memory/luna-memory.db"): any {
  try {
    return getPersistentDatabase(dbPath);
  } catch (error) {
    console.error("[Database] Failed to get persistent database:", error);
    throw error;
  }
}

export type DatabaseInstance = any;
