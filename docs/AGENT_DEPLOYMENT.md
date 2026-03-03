# Agent Deployment Plan — Luna Voice Agent

> If you had to deploy an initial agent into this codebase, what would it be assigned to and what tasks would it take on?

## Initial Agent Assignment: **Codebase Health & DevOps Agent**

The first agent deployed into Luna should be a **Codebase Health & DevOps Agent** — an autonomous helper that continuously validates builds, enforces quality gates, and streamlines the developer experience. This agent targets the areas with the highest return on stability before any feature-level agents are introduced.

---

## Phase 1 — Build & Launch Reliability

| Task | Description | Files Involved |
|------|-------------|----------------|
| **Port validation** | Verify backend, Electron, and dev scripts all agree on port 3001 | `backend/server.ts`, `main.js`, `app/main/main.ts`, `package.json` |
| **Pre-flight health check** | After `npm run build`, hit `/health` and confirm 200 before launching Electron | `scripts/launch-electron.cjs`, `backend/server.ts` |
| **Environment audit** | Scan `.env` for required keys (`OPENAI_API_KEY`) and warn before startup | `check-env.js`, `backend/server.ts` |
| **Native module guard** | After `npm install`, verify `better-sqlite3` loads or surface a clear fallback message | `scripts/rebuild.js`, `memory/MemoryStore.ts` |

## Phase 2 — Test & Quality Automation

| Task | Description | Files Involved |
|------|-------------|----------------|
| **Test runner** | Run `LUNA_DISABLE_EMBEDDINGS=1 npm test` on every commit; surface failures | `jest.config.cjs`, `test/` |
| **Type-check gate** | Run `npm run type-check` and block merges on errors | `tsconfig.json` |
| **Lint enforcement** | Run `npm run lint` with zero-warning policy | `eslint.config.mjs` |
| **Dead code detection** | Flag unused exports in `agent/tools/`, `backend/routes/`, `app/renderer/services/` | Across codebase |

## Phase 3 — Agent Intelligence Tasks

| Task | Description | Files Involved |
|------|-------------|----------------|
| **Circuit breaker monitoring** | Watch `ModelRouter` health metrics; alert when a model enters OPEN state | `agent/orchestrator/modelRouter.ts` |
| **Memory lifecycle testing** | Validate add → search → update → delete cycles against the memory store | `memory/MemoryService.ts`, `memory/MemoryStore.ts` |
| **Tool allowlist audit** | Verify all registered tools in `executive.ts` have security constraints and tests | `agent/tools/executive.ts` |
| **PII filter validation** | Run PII test corpus and confirm filter catches SSN, email, credit card, API key patterns | `agent/validators/piiFilter.ts` |

## Phase 4 — Voice Pipeline Validation

| Task | Description | Files Involved |
|------|-------------|----------------|
| **STT endpoint smoke test** | POST a sample WAV to `/api/voice/transcribe` and verify non-empty response | `backend/routes/voice.ts`, `fixtures/hello_luna.wav` |
| **TTS roundtrip** | Send text to `/api/voice/tts` and confirm audio bytes returned | `backend/routes/voice.ts` |
| **Wake word asset check** | Verify Porcupine WASM/worker assets exist in `dist/app/renderer/assets/` after build | `scripts/copy-assets.js` |
| **Hybrid STT fallback** | Simulate cloud STT failure and confirm Whisper fallback activates | `agent/voice/VoiceEngine.ts` |

---

## Recommended Agent Stack

```
┌──────────────────────────────────────────┐
│         Luna DevOps Agent (Phase 1)      │
│                                          │
│  ┌────────────┐  ┌────────────────────┐  │
│  │ Build Gate  │  │ Health Monitor     │  │
│  │ npm build   │  │ /health polling    │  │
│  │ type-check  │  │ circuit breaker    │  │
│  │ lint        │  │ memory lifecycle   │  │
│  └────────────┘  └────────────────────┘  │
│                                          │
│  ┌────────────┐  ┌────────────────────┐  │
│  │ Test Runner │  │ Security Scanner   │  │
│  │ jest --ci   │  │ PII filter check   │  │
│  │ coverage    │  │ tool allowlist     │  │
│  │ e2e smoke   │  │ dependency audit   │  │
│  └────────────┘  └────────────────────┘  │
└──────────────────────────────────────────┘
```

## Launch Checklist for the Initial Agent

1. **Install & build** — `npm install && npm run build`
2. **Run tests** — `LUNA_DISABLE_EMBEDDINGS=1 npm test`
3. **Type-check** — `npm run type-check`
4. **Start backend** — `node dist/backend/server.js` (port 3001)
5. **Health check** — `curl http://localhost:3001/health`
6. **Start Electron** — `npm run electron` or full stack via `npm start`

## What This Agent Does NOT Cover (Future Agents)

- **Conversation Agent** — handles multi-turn dialogue, context windowing, tool dispatch (Phase 5+)
- **Memory Agent** — proactive embedding generation, semantic search optimization (Phase 5+)
- **Voice UX Agent** — latency measurement, audio quality monitoring, wake word tuning (Phase 6+)

---

*This document is the reference for deploying the first autonomous agent into the Luna codebase. Start with build reliability and quality gates; add intelligence tasks only after the foundation is solid.*
