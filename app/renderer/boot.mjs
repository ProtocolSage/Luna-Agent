// ---- Dynamic API base discovery + fetch shim (strict CSP-safe) ----
const DEFAULT_PORTS = [3000, 3001, 3002, 3003, 3004, 3005];

async function probeBase() {
  const bases = [];
  if (window.__LUNA_BOOT?.API_BASE) bases.push(window.__LUNA_BOOT.API_BASE);
  for (const p of DEFAULT_PORTS) bases.push(`http://localhost:${p}`);

  for (const base of bases) {
    try {
      const r = await fetch(`${base}/health`, { method: 'GET', cache: 'no-store' });
      if (r.ok) return base;
    } catch {
      // ignore and try next
    }
  }
  return 'http://localhost:3000'; // last resort
}

const API_BASE = await probeBase();

// merge into global
window.__LUNA_BOOT = Object.assign(
  {}, window.__LUNA_BOOT || {}, { API_BASE }
);

// fetch shim: rewrite relative /api/* to resolved API_BASE
const __origFetch = window.fetch.bind(window);
window.fetch = (input, init) => {
  let url = typeof input === 'string' ? input : input.url;
  if (url.startsWith('/api/')) url = API_BASE + url;
  const req = (typeof input === 'string') ? url : new Request(url, input);
  return __origFetch(req, init);
};

console.log(`[Boot] API_BASE = ${API_BASE}`);

// ---- (keep your GPU/matrix/localStorage toggles below if you had them) ----
