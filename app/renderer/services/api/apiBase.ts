// Simple API fetch wrapper that respects apiBase specified by Electron main
// Usage: apiFetch('/api/voice/tts', { method: 'POST', body: ... })

function getApiBase(): string {
  try {
    const url = new URL(window.location.href);
    const fromQuery = url.searchParams.get("apiBase");
    if (fromQuery) return fromQuery.replace(/\/$/, "");
  } catch {}

  // Fallback to environment variable injected at build-time or localhost
  const envBase =
    (process as any)?.env?.LUNA_API_BASE || (process as any)?.env?.API_BASE;
  if (typeof envBase === "string" && envBase.length > 0) {
    return envBase.replace(/\/$/, "");
  }
  return "http://localhost:3000";
}

export const API_BASE = getApiBase();

export async function apiFetch(
  input: string,
  init?: RequestInit,
): Promise<Response> {
  const base = getApiBase();
  const path = input.startsWith("http")
    ? input
    : `${base}${input.startsWith("/") ? "" : "/"}${input}`;
  return fetch(path, {
    // You can add credentials mode here if backend uses cookies/sessions
    // credentials: 'include',
    ...init,
  });
}
