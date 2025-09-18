# VOICE_CODEMAP

## Capture & Input (renderer + agent)
- `app/renderer/services/VoiceService.ts:255-276` – Primary microphone capture & STT submission with VAD metrics; emits volume events and handles recording lifecycle.
- `app/renderer/services/LunaVoiceAgent.ts:117-205` – Continuous pipeline (wake-word → transcribe → agent → TTS); currently expects `result.transcription` and will fail with text-only responses.
- `app/renderer/components/VoiceSystemTest.tsx:93-204` – Diagnostic harness acquiring mic access and exercising STT/TTS endpoints for QA.
- `agent/voice/voiceInput.ts:292-344` – Legacy capture service; still appends `model` and `language` fields to FormData but posts to same `/api/voice/transcribe` endpoint.
- `app/main/voiceHandler.ts:24-205` – Electron main orchestrator; enforces presence of `ELEVEN_API_KEY` and pushes audio buffers to renderer via IPC.

## Upload & Transport
- `app/renderer/services/config.ts:62-97` – `apiFetch` wrapper injecting `x-session-id`, dev `x-api-key`, and stripping `Content-Type` for FormData.
- `app/renderer/services/api/voiceClient.ts:22-59` – Voice-specific client wrappers around `apiFetch` for TTS/STT.
- `app/renderer/services/api/sttClient.ts:9-17` – Minimal STT caller used by diagnostic components.
- `app/renderer/services/MemoryClient.ts:39-45` – Adds voice transcripts to memory via `API.STT_TRANSCRIBE`, still reliant on `transcription` field.
- `app/renderer/index.legacy.html:861-908` – Hard-coded `fetch('/api/voice/tts')` and `fetch(base/api/voice/tts/check')`. **Fix note:** refactor to reuse `apiFetch` so headers & constants stay aligned.

## Server Routes
- `backend/routes/voice.ts:16-159` – Core voice router (tts/check, tts, stt alias, transcribe). Duplicate `/stt` handler (lines 95-118) shadows alias bound at line 159.
- `backend/routes/streamingVoice.ts` – REST + WebSocket endpoints for streaming; depends on `StreamingVoiceService` (browser-only today).
- `backend/routes/publicVoiceDiagnostics.ts:9-63` – Public health/status/capabilities endpoints consumed by diagnostics scripts.
- `backend/server.ts:212-320, 456-838` – Global middleware, rate limits, auth mounting, and voice router wiring.

## Providers & Integrations
- `backend/services/elevenLabsService.ts:8-154` – ElevenLabs streaming & caching with circuit breaker; requires `ELEVEN_API_KEY`.
- `backend/routes/voice.ts:58-83` – Fallback OpenAI TTS using `openai.audio.speech.create`.
- `backend/routes/voice.ts:133-138` – Whisper transcription call via OpenAI SDK.
- `backend/services/StreamingVoiceService.ts:72-320` – Intended realtime service but references `navigator.mediaDevices`/`AudioContext`; cannot run on server (hotspot).
- `app/main/voiceHandler.ts:74-203` – Uses ElevenLabs locally via `getElevenLabsAudio`, falling back to browser speech synthesis.

## Playback & Output
- `app/renderer/services/api/voiceClient.ts:63-74` – `playMp3Blob` helper using `Audio` element.
- `app/renderer/services/VoiceService.ts:286-302` – Synthesizes text via `/api/voice/tts`, wraps as Blob, and plays.
- `app/renderer/services/VoiceService.ts:607-755` – Audio analysis, VAD, and UI volume telemetry.
- `app/renderer/services/LunaVoiceAgent.ts:146-173` – TTS call + playback queue.

## Diagnostics & Tooling
- `app/renderer/components/DiagnosticPanel.tsx:162-246` – Polls `/health`, `/api/metrics`, and `/api/voice/tts/check`; surfaces provider availability.
- `scripts/smoke-check.mjs:21-44` – Ensures voice assets exist post-build.
- `voice-probe.ps1:6-27` – Posts `luna_test.wav` to `/api/voice/transcribe` and prints response.
- `tools/smoke1.ps1:64-120` – PowerShell smoke hitting `/api/voice/tts` and `/api/voice/transcribe` using curl/Invoke-RestMethod.
- `DEBUG-VOICE-ROUTES.ps1:98-111` – Lists voice endpoints for manual probing.

## CI & Scripts
- `.github/workflows/build-and-smoke.yml:7-13` – Windows job running `npm run build` + `node scripts/smoke-check.mjs`; no live voice call yet.
- `.github/workflows/ci.yml` – Linux CI (lint/test/build) without voice-specific tests.
- `package.json:72-96` – Provides `test:voice`, `probe:voice`, and `dev` scripts; `probe:voice` wraps `voice-probe.ps1` with real WAV.

## Dependency Edges
- Renderer capture (`VoiceService` / `LunaVoiceAgent`) → `voiceClient`/`apiFetch` → Express `/api/voice/transcribe` → OpenAI Whisper → renderer playback.
- TTS pipeline: renderer components → `/api/voice/tts` → ElevenLabsService (primary) → response Blob → `playMp3Blob` or `VoiceService.synthesize`.
- Diagnostics: renderer `DiagnosticPanel` → `/api/voice/tts/check` + `/api/voice/diagnostics/*` → UI cards; scripts use same endpoints for smoke tests.
- Streaming: `/api/voice/streaming/*` → `StreamingVoiceService` (needs browser APIs) → WebSocket clients (currently unusable on server).

## Hardcoded Endpoint Checks & FormData usage
- Direct `fetch` strings: `app/renderer/index.legacy.html:861-908` (bypass constants). **Fix note:** route through `apiFetch` or delete legacy template.
- `formData.append('file', …)`: voiceClient.ts:47-50; sttClient.ts:9-13; VoiceService.ts:257; VoiceSystemTest.tsx:105-107; MemoryClient.ts:39-41; agent/voice/voiceInput.ts:310-312.
- Additional form fields (`model`, `language`): agent/voice/voiceInput.ts:311-312 – unused by backend.
- `upload.single('file')`: backend/routes/voice.ts:95,158-159 – verifies field alignment with frontend FormData usage.

## Legacy & Rate-Limit Mirrors
- `/api/voice/stt` alias retains separate rate-limit declaration (server.ts:314) and legacy handler (voice.ts:95-118). Once canonical payload includes `transcription`, collapse alias to the shared handler.
- `CHANGELOG.md:10-14` documents legacy surfaces but lacks concrete removal timeline.
- `api/voice/*` wildcard limiter (server.ts:316) ensures parity for diagnostics + future endpoints; update thresholds if streaming endpoints go live.
