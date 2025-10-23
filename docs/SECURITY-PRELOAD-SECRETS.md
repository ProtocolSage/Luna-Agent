# Preload Secret Scrubbing - Security Fix

## Vulnerability

The preload script was exposing API keys directly to the renderer process via `contextBridge.exposeInMainWorld`:

```typescript
// INSECURE - DO NOT DO THIS
contextBridge.exposeInMainWorld('__ENV', {
  AZURE_SPEECH_KEY: process.env.AZURE_SPEECH_KEY,          // ❌ EXPOSED
  DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY,          // ❌ EXPOSED
  GOOGLE_CLOUD_API_KEY: process.env.GOOGLE_CLOUD_API_KEY,  // ❌ EXPOSED
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,              // ❌ EXPOSED
  ELEVEN_API_KEY: process.env.ELEVEN_API_KEY,              // ❌ EXPOSED
  PICOVOICE_ACCESS_KEY: process.env.PICOVOICE_ACCESS_KEY   // ❌ EXPOSED
});
```

### Attack Vectors

1. **DevTools Inspection:**
   - User opens DevTools: `window.__ENV.OPENAI_API_KEY`
   - Attacker sees plaintext API key

2. **XSS Exploitation:**
   - If XSS vulnerability exists in renderer
   - Attacker script can read `window.__ENV` and exfiltrate keys

3. **Third-party Scripts:**
   - Analytics, error tracking, or malicious dependencies
   - Can access global `window.__ENV` object

4. **Build Artifact Leaks:**
   - Keys embedded in renderer bundle
   - Visible in production bundles if webpack externals misconfigured

## Solution

### 1. Remove API Keys from Preload

```typescript
// SECURE - Only non-sensitive config
contextBridge.exposeInMainWorld('__ENV', {
  LUNA_API_BASE: process.env.LUNA_API_BASE,
  API_BASE: process.env.API_BASE,
  VOICE_AUTO_LISTEN: process.env.VOICE_AUTO_LISTEN === 'true',
  WAKE_WORD_ENABLED: process.env.WAKE_WORD_ENABLED === 'true',
  // ... other non-sensitive flags

  // Configuration only (NOT keys)
  STT_PROVIDER: process.env.STT_PROVIDER || 'azure',
  AZURE_SPEECH_REGION: process.env.AZURE_SPEECH_REGION,  // Region is OK
  WAKE_WORD: process.env.WAKE_WORD || 'luna'
});
```

### 2. Use Backend APIs for Service Calls

**Before (Insecure):**
```typescript
// Renderer directly calls OpenAI with key from window.__ENV
const response = await fetch('https://api.openai.com/v1/chat/completions', {
  headers: {
    'Authorization': `Bearer ${window.__ENV.OPENAI_API_KEY}`  // ❌ KEY EXPOSED
  }
});
```

**After (Secure):**
```typescript
// Renderer calls backend API, backend uses key server-side
const response = await fetch('http://localhost:3001/api/voice/transcribe', {
  method: 'POST',
  body: audioFormData
  // No API key in renderer - backend handles it
});
```

### 3. Architecture

```
┌─────────────────────────────────────────┐
│ Renderer Process (Sandboxed)           │
│ ✅ No API keys                          │
│ ✅ Calls backend APIs                   │
│ ✅ Cannot access Node.js                │
└──────────────┬──────────────────────────┘
               │ HTTP/WebSocket
               ▼
┌─────────────────────────────────────────┐
│ Backend Server (Express on port 3001)  │
│ ✅ Holds API keys securely              │
│ ✅ Validates requests                    │
│ ✅ Makes service calls                   │
│ └─► OpenAI (Whisper, TTS)              │
│ └─► Anthropic (Claude)                 │
│ └─► ElevenLabs (TTS fallback)          │
└─────────────────────────────────────────┘
```

## Migration Guide

### For Voice Features

**Old Pattern:**
```typescript
// renderer.tsx - INSECURE
const apiKey = window.__ENV.OPENAI_API_KEY;
const response = await openai.audio.transcriptions.create(audio, {
  apiKey
});
```

**New Pattern:**
```typescript
// renderer.tsx - SECURE
const formData = new FormData();
formData.append('audio', audioBlob);
const response = await fetch('http://localhost:3001/api/voice/transcribe', {
  method: 'POST',
  body: formData
});
```

### For Chat Features

**Old Pattern:**
```typescript
// INSECURE
const chat = new OpenAI({ apiKey: window.__ENV.OPENAI_API_KEY });
```

**New Pattern:**
```typescript
// SECURE
const response = await fetch('http://localhost:3001/api/agent/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: userInput })
});
```

## Verification

### 1. DevTools Check
```javascript
// In renderer DevTools console
console.log(window.__ENV);
// Should NOT contain any API keys
// Expected: { LUNA_API_BASE, STT_PROVIDER, WAKE_WORD, ... }
```

### 2. CI Secret Scan
The CI pipeline now runs `scripts/ci/scan-bundles.js` which will:
- Scan `dist/` for API key patterns
- Fail the build if secrets detected
- Patterns: `sk-...`, `sk-ant-...`, `/AKIA.../`, etc.

### 3. TypeScript Check
```typescript
// This should cause a type error if keys removed from __ENV
const key = window.__ENV.OPENAI_API_KEY;  // ❌ Should not exist
```

## Testing

See `test/unit/preload-security.test.ts` for comprehensive tests covering:
- ✅ No API keys in exposed __ENV
- ✅ Only safe config values present
- ✅ Type definitions match actual exposed values
- ✅ Regression tests for each removed key

## Rollout Plan

1. **Phase 1:** Backend APIs already support all features
   - `/api/voice/transcribe` (Whisper STT)
   - `/api/voice/tts` (OpenAI/ElevenLabs TTS)
   - `/api/agent/chat` (Claude/GPT-4)

2. **Phase 2:** Remove keys from preload (this PR)
   - Renderer continues to work via backend APIs
   - No code changes needed in renderer (already using backend)

3. **Phase 3:** Verify with CI
   - Secret scanner runs on every build
   - Prevents regression

## Security Impact

**Before:**
- 🔴 API keys exposed in renderer global scope
- 🔴 Accessible via DevTools
- 🔴 Vulnerable to XSS exfiltration
- 🔴 May leak in bundled artifacts

**After:**
- 🟢 Zero secrets in renderer process
- 🟢 Keys stay in backend only
- 🟢 XSS cannot steal keys
- 🟢 CI enforces secret-free bundles

**Risk Reduction:** Critical → Minimal

## References

- [Electron Security Best Practices](https://www.electronjs.org/docs/latest/tutorial/security)
- [OWASP: Protecting Secrets](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [Context Isolation Documentation](https://www.electronjs.org/docs/latest/tutorial/context-isolation)
