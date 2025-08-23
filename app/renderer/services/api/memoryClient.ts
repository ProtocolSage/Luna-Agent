// app/renderer/services/api/memoryClient.ts

export interface MemoryItem {
  id: string;
  content: string;
  type: string;
  timestamp: string;
  sessionId?: string | null;
  metadata?: any;
  score?: number; // present on semantic results
}

export async function addMemory(content: string, type = 'conversation', sessionId?: string, metadata: any = {}) {
  const r = await fetch('/api/memory/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, type, sessionId, metadata })
  });
  if (!r.ok) throw new Error(`addMemory ${r.status}`);
  return await r.json();
}

export async function recent(limit = 20, sessionId?: string): Promise<{ ok: boolean; items: MemoryItem[] }> {
  const u = new URL('/api/memory/recent', window.location.origin);
  u.searchParams.set('limit', String(limit));
  if (sessionId) u.searchParams.set('sessionId', sessionId);
  const r = await fetch(u.pathname + u.search); // Use pathname + search for fetch shim
  if (!r.ok) throw new Error(`memRecent ${r.status}`);
  return await r.json();
}

export async function search(q: string, k = 8, sessionId?: string): Promise<{ ok: boolean; items: MemoryItem[] }> {
  const u = new URL('/api/memory/search', window.location.origin);
  u.searchParams.set('q', q);
  u.searchParams.set('k', String(k));
  if (sessionId) u.searchParams.set('sessionId', sessionId);
  const r = await fetch(u.pathname + u.search); // Use pathname + search for fetch shim
  if (!r.ok) throw new Error(`memSearch ${r.status}`);
  return await r.json();
}

// Compatibility functions for old memory client API
export async function memAdd(content: string, type = 'conversation', sessionId?: string, metadata: any = {}) {
  return addMemory(content, type, sessionId, metadata);
}

export async function memSearch(q: string, k = 8, sessionId?: string) {
  return search(q, k, sessionId);
}

export async function memRecent(limit = 20, sessionId?: string) {
  return recent(limit, sessionId);
}
