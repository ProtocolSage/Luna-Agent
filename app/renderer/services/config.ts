/**
 * Configuration service for Luna Agent
 * Reads API base URL from environment or defaults to localhost:3000
 */

function safeGetQueryParam(name: string): string | null {
  try {
    if (typeof window !== 'undefined' && typeof window.location !== 'undefined') {
      return new URLSearchParams(window.location.search).get(name);
    }
  } catch {}
  return null;
}

function computeApiBase(): string {
  // 1) Main process injects apiBase via BrowserWindow.loadFile(..., { query: { apiBase } })
  const fromQuery = safeGetQueryParam('apiBase');
  if (fromQuery) return fromQuery;

  // 2) Remembered override
  try {
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('luna-api-base') : null;
    if (stored) return stored;
  } catch {}

  // 3) Preload-exposed env (see app/main/preload.ts)
  const ENV = (globalThis as any).__ENV || {};
  if (ENV?.LUNA_API_BASE) return ENV.LUNA_API_BASE as string;
  if (ENV?.API_BASE) return ENV.API_BASE as string;

  // 4) Build-time env (if DefinePlugin provided)
  if (typeof process !== 'undefined' && (process as any).env) {
    const penv = (process as any).env as Record<string, string | undefined>;
    if (penv.LUNA_API_BASE) return penv.LUNA_API_BASE;
    if (penv.API_BASE) return penv.API_BASE;
  }

  // 5) Safe fallback
  return 'http://localhost:3000';
}

export const API_BASE = computeApiBase();

console.log('API_BASE =', API_BASE);

/**
 * Session management functions for bulletproof session handling
 */
export function saveSessionId(id: string) {
  try { localStorage.setItem('luna-session-id', id); } catch {}
}

export function getSessionId(): string | null {
  try { return localStorage.getItem('luna-session-id'); } catch { return null; }
}

/**
 * Helper function for making API calls with proper base URL and credentials
 */
type ApiFetchInit = Omit<RequestInit, 'body'> & { body?: any };

export async function apiFetch(path: string, init: ApiFetchInit = {}) {
  const url = `${API_BASE}${path}`;
  const finalInit: RequestInit = { ...init };
  const headers = new Headers(init.headers as HeadersInit | undefined);
  const body = init.body;

  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  const isBlob = typeof Blob !== 'undefined' && body instanceof Blob;
  const isArrayBuffer = typeof ArrayBuffer !== 'undefined' && (body instanceof ArrayBuffer || ArrayBuffer.isView(body as any));
  const isReadableStream = typeof ReadableStream !== 'undefined' && body instanceof ReadableStream;
  const isURLSearchParams = typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams;
  const isPlainObject = !!body && typeof body === 'object' && body.constructor === Object;
  const shouldJsonify = isPlainObject && !isFormData && !isBlob && !isArrayBuffer && !isReadableStream && !isURLSearchParams;

  if (isFormData) {
    headers.delete('Content-Type');
  } else if (shouldJsonify) {
    headers.set('Content-Type', 'application/json');
    finalInit.body = JSON.stringify(body);
  }

  const isDev = typeof process !== 'undefined' && (process as any).env?.NODE_ENV === 'development';
  if (isDev && path.startsWith('/api/voice/')) {
    headers.set('x-api-key', 'dev-local');
  }

  if (path !== '/api/voice/tts/check') {
    const sid = getSessionId();
    if (sid) headers.set('x-session-id', sid);
  }

  finalInit.credentials = finalInit.credentials ?? 'include';
  finalInit.headers = headers;

  return fetch(url, finalInit);
}

/**
 * Auth bootstrap functions for bulletproof session management
 */
export async function createSession() {
  const deviceInfo = {
    platform: (typeof navigator !== 'undefined' && navigator.platform) ? navigator.platform : 'unknown',
    userAgent: (typeof navigator !== 'undefined' && navigator.userAgent) ? navigator.userAgent : 'unknown'
  };

  const res = await apiFetch('/api/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ deviceInfo })
  });
  if (!res.ok) throw new Error(`session create failed: ${res.status}`);
  const data = await res.json().catch(() => ({}));
  if (data?.sessionId) saveSessionId(data.sessionId);
  return data?.sessionId;
}

export async function validateSession(): Promise<boolean> {
  const res = await apiFetch('/api/auth/validate', { method: 'GET' });
  if (res.status === 200) return true;
  if (res.status === 401) return false;
  throw new Error(`validate error ${res.status}`);
}

export async function initializeSecureSession() {
  const MAX = 3;
  for (let attempt = 1; attempt <= MAX; attempt++) {
    const ok = await validateSession().catch(() => false);
    if (ok) return true;

    // 401 or invalid → get new session and retry
    await createSession();
    await new Promise(r => setTimeout(r, 2 ** (attempt - 1) * 1000));
  }
  throw new Error('Session validation failed after multiple attempts');
}

/**
 * Configuration constants
 */
export const CONFIG = {
  API_BASE,
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000,
  SESSION_TIMEOUT: 30 * 60 * 1000, // 30 minutes
} as const;
