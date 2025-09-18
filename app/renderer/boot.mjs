// ---- API base init + fetch shim (strict CSP-safe) ----
// Prefer single source of truth: API_BASE passed from main via query/preload
const API_BASE = (window.__LUNA_BOOT && window.__LUNA_BOOT.API_BASE)
  ? window.__LUNA_BOOT.API_BASE
  : 'http://localhost:3000';

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
