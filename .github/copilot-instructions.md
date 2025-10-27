## Quick orientation — what this repo is

Luna is an Electron-based voice-first AI assistant (backend Express API + React renderer + agent orchestration). Key subsystems you should know right away:

- Backend: `backend/` — Express server and voice routes (entry: `backend/server.ts`).
- Renderer: `app/renderer/` — React UI (entry: `app/renderer/renderer.tsx`, main UI: `PremiumLuxuryApp.tsx`).
- Electron main/preload: `app/main/main.ts`, `app/main/preload.ts` — IPC bridge and process boundaries.
- Agent core: `agent/` — model router, pipeline and tools (`agent/orchestrator/modelRouter.ts`, `agent/pipeline/ToolPipeline.ts`, `agent/tools/*`).
- Memory: `memory/` — embedding, vector store and SQLite persistence (`memory/MemoryService.ts`, `memory/MemoryStore.ts`).

## Important developer workflows & commands

- Install: `npm install`
- Full build: `npm run build` (backend TS compile + renderer esbuild + assets)
- Renderer build only: `npm run build:renderer`
- Backend compile only: `npm run build:backend`
- Dev (backend + electron): `npm run dev:full` or `npm start` (see `package.json` scripts)
- Rebuild native modules (Windows / better-sqlite3): `npm run rebuild` — required when updating Electron or native deps.
- Copy wake-word assets: `npm run copy-assets` (run automatically during build/start)
- Tests: `npm test` (use `LUNA_DISABLE_EMBEDDINGS=1 npm test` to skip embedding network calls)
- Typecheck / lint: `npm run type-check`, `npm run lint`

## Key runtime conventions and gotchas (do not change these lightly)

- Renderer must not import Node built-ins (fs/path) — use backend routes or the IPC preload bridge. See `app/renderer/services/api/*` for client patterns.
- Wake-word / WASM assets are copied into `dist/app/renderer/assets` — update `scripts/copy-assets.js` when changing asset packaging.
- better-sqlite3 native bindings are rebuilt by `scripts/rebuild.js`; on Windows always run `npm run rebuild` after native dependency changes.
- Memory fallback: the project supports an in-memory SQLite fallback when native bindings fail — don't assume persistence unless better-sqlite3 is present.
- Voice state uses a single VoiceMode enum (idle|listening|processing|speaking) rather than multiple booleans — follow that pattern in UI/state changes (`app/renderer/components/VoiceControl.tsx`).

## Patterns & architecture notes useful for code changes

- Circuit breaker model routing: `agent/orchestrator/modelRouter.ts` implements circuit breakers (CLOSED → OPEN → HALF_OPEN). When adding new LLM endpoints, register them there and wire failure thresholds.
- Tool pipeline: `agent/pipeline/ToolPipeline.ts` + `agent/tools/executive.ts` implement tool discovery, allowlist constraints, and retry/backoff. Use `PipelineService` for queued/async execution.
- Memory and embeddings: `memory/EmbeddingService.ts` centrally generates embeddings; environment toggle `LUNA_DISABLE_EMBEDDINGS=1` forces deterministic tests.
- Voice flow: frontend records via MediaRecorder → POST `/api/voice/transcribe` → backend uses Whisper → frontend auto-sends chat → POST `/api/agent/chat` → TTS endpoint `/api/voice/tts` plays audio.

## Where to look for examples & integration points

- Chat and voice APIs: `backend/routes/voice.ts`, `backend/server.ts`
- Agent orchestration examples: `agent/pipeline/README.md` and `agent/pipeline/ToolPipeline.ts`
- Frontend API client patterns (use these; prefer them over raw fetch): `app/renderer/services/api/` (e.g. `voiceClient.ts`, `memoryClient.ts`)
- Rebuild/copy scripts: `scripts/rebuild.js`, `scripts/copy-assets.js`, and `deploy-refactoring.ps1` (Windows deployment flow)
- Logging: lightweight logger at `src/utils/logger.ts` and `app/renderer/utils/logger.ts`; logs written to `logs/luna.log` on desktop builds.

## Guidance for automated agents editing this repo

- Before changing the renderer, verify you did not introduce Node builtin imports into `app/renderer/` — add tests or a quick grep for `from 'fs'` / `require('path')`.
- If edits touch native modules or package versions, add `npm run rebuild` and verify Electron runs with `npm start` locally (or CI equivalent).
- For changes that affect embeddings or external LLM usage, include a note to respect `LUNA_DISABLE_EMBEDDINGS` and to mock network calls in tests.
- When adding new agent tools, register them in `agent/tools/executive.ts`, add security constraints and unit tests for allowlist behavior.

## Quick examples (copyable patterns)

- Call chat API (backend):

  POST /api/agent/chat with JSON { message, sessionId } → see `app/renderer/services/api/index.ts` for client example.

- Transcribe flow (frontend):

  transcribe(audioBlob) -> POST /api/voice/transcribe (multipart/form-data) -> response.text

## PR checklist for AI changes

- Run `npm run type-check` and `npm run lint` locally; fix or document any errors.
- If touching native modules: run `npm run rebuild` and sanity-start `npm start`.
- Add or update a short test for behaviour changes (memory or model routing) and run `npm test` with `LUNA_DISABLE_EMBEDDINGS=1` where appropriate.
- Update `scripts/copy-assets.js` / `webpack` config if adding renderer assets; ensure assets end up in `dist/app/renderer/assets`.

---
If anything in this guidance is unclear, tell me which area (build, native modules, renderer constraints, or agent tools) you want expanded and I will iterate. 
