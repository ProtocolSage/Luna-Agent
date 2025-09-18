# VOICE_HEALTH

## CI Status
- **build-and-smoke.yml (windows-latest)** – Installs Node 20, runs `npm ci`, `npm run build`, and `node scripts/smoke-check.mjs` (`.github/workflows/build-and-smoke.yml:7-13`). No live STT/TTS call in pipeline; add `npm run probe:voice` to catch regressions.
- **ci.yml (ubuntu-latest)** – Lint, unit, integration, build, Sonar jobs (`.github/workflows/ci.yml`). No voice-specific tests; `test:voice` script exists but has no suite, leaving voice path untested.
- **Observations** – `ci-logs/` currently empty, so past failures are not archived. Risk remains medium: voice contract changes bypass CI entirely.

## Probes & Fixtures
- **voice-probe.ps1:6-27** – Uses `Invoke-RestMethod` to hit `/api/voice/tts/check` and POST `/api/voice/transcribe` with `luna_test.wav`. Dev header `x-api-key: dev-local` included.
- **Fixture audio** – `luna_test.wav` (root) and `test_audio.wav` (root) provide PCM samples for manual and automated tests.
- **Smoke scripts** – `tools/smoke.ps1` / `tools/smoke1.ps1` issue curl + Invoke-RestMethod checks; `scripts/smoke-check.mjs:21-44` validates VAD assets but does not perform HTTP calls.
- **Recommended** – Run `npm run probe:voice` (package.json:84) in CI and document expected output `{ "transcription": "..." }` vs `{ "text": "..." }` until contract corrected.

## Provider Health & Resiliency
- **ElevenLabs** – Requests time out after 30s and employ circuit breaker thresholds (`backend/services/elevenLabsService.ts:28-118`). Failures fall back to OpenAI or browser TTS (`backend/routes/voice.ts:44-90`, `app/main/voiceHandler.ts:77-101`).
- **OpenAI Whisper** – Invoked synchronously via `client.audio.transcriptions.create` without retry or timeout override (`backend/routes/voice.ts:133-138`). If it fails, route returns `500 { error: "transcription-failed" }`.
- **OpenAI TTS** – Provides fallback when ElevenLabs unavailable (voice.ts:58-83); errors send `details` field downstream.
- **Streaming** – Designed to hit `wss://api.openai.com/v1/realtime` (`backend/services/StreamingVoiceService.ts:118-146`), but dependency on browser APIs prevents production use.
- **Request IDs** – `X-Request-Id` set for all requests (`backend/server.ts:329-358`), enabling correlation with downstream provider logs.

## Security Posture
- **CORS** – Validates origins using `securityService.validateOrigin`; allows credentials and headers `x-session-id`, `x-api-key`, `X-Request-Id`, `X-Client-Version` (`backend/server.ts:218-265`).
- **Sessions** – `apiFetch` injects `x-session-id` from localStorage unless hitting `/api/voice/tts/check` (`app/renderer/services/config.ts:88-91`); backend reads header or cookie via `helpers/session.ts:7-13`.
- **Authentication** – `/api/voice` protected by `authenticateToken` / session fallback (`backend/server.ts:470-473`). `/api/voice/diagnostics/*` intentionally public (server.ts:456-459).
- **Rate limits** – Voice-specific buckets (server.ts:313-316) return `429` with retry hints; handler logs audit events (`backend/server.ts:233-244`).
- **Headers** – Helmet config enforces CSP, disables `crossOriginEmbedderPolicy`, and sets HSTS-like defaults (`backend/server.ts:217-241`). Additional headers: `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, `Referrer-Policy` (`backend/server.ts:334-352`).

## Risks & Gaps
- CI lacks any HTTP verification of `/api/voice/transcribe`; contract changes do not break builds.
- Renderer legacy HTML bypasses session headers, weakening auth guarantees for those views.
- Streaming service un-deployable on server; health endpoints advertise availability regardless.
- No automated check for Whisper quota / latency; consider instrumenting metrics endpoint.
