export interface DatabaseInstance {
  exec(sql: string): void;
  pragma(setting: string, value?: any): any;
  prepare(sql: string): {
    run(...params: any[]): { changes: number; lastInsertRowid?: any };
    get(...params: any[]): any | null;
    all(...params: any[]): any[];
    iterate(...params: any[]): Generator<any, void, unknown>;
  };
  transaction<T>(fn: () => T): T;
  close(): void;
}

export interface DatabaseConstructor {
  new (path?: string): DatabaseInstance;
}

export function getDatabase(path?: string): DatabaseInstance;
export const Database: DatabaseConstructor;
