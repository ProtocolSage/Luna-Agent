export type Session = {
  id: string;
  userId: string;
  createdAt: Date;
  lastAccessed: Date;
  data: any;
};

// Singleton session store - shared across all routes
export const sessions = new Map<string, Session>();
