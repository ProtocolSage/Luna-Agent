# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Essential Commands

### Development
- `npm run build` - Full production build (backend + renderer with esbuild)
- `npm run build:backend` - TypeScript compilation for backend only
- `npm run build:renderer` - esbuild bundle for renderer (ESM format)
- `npm start` - Start app with backend and Electron
- `npm run dev:full` - Development mode (backend + Electron concurrently)

### Testing
- `npm test` - Run full test suite (Jest)
- `npm run test:coverage` - Generate test coverage report
- `npm run test:offline` - Skip integration tests
- `LUNA_DISABLE_EMBEDDINGS=1 npm test` - Test without embeddings for memory system

### Type Checking & Linting
- `npm run type-check` - TypeScript type checking without compilation
- `npm run lint` - ESLint with max 0 warnings
- `npm run lint:fix` - Auto-fix linting issues

### Build System
- `npm run copy-assets` - Copy wake word assets to dist
- `npm run extract-assets` - Extract Porcupine assets from npm package
- `npm run rebuild` - Rebuild native dependencies for Electron

## Architecture Overview

### Core System Structure
Luna Agent is an Electron-based AI assistant with a premium voice interface:

**Backend (Express Server - Port 3001)**
- Entry: `backend/server.ts` - Secure API server with CORS, model routing
- Routes: `/api/agent/chat`, `/api/voice/transcribe`, `/api/voice/tts`, `/health`
- Multi-LLM support: OpenAI GPT-4, Anthropic Claude, Ollama (local)
- Voice endpoints: OpenAI Whisper STT and TTS integration

**Agent Core**
- `agent/orchestrator/modelRouter.ts` - Circuit breaker pattern for LLM failover
- `agent/pipeline/ToolPipeline.ts` - Tool execution pipeline with planning
- `agent/tools/executive.ts` - 44+ registered tools (filesystem, web, memory, system)
- `agent/validators/piiFilter.ts` - PII detection and prompt injection prevention

**Memory System**
- `memory/MemoryService.ts` - High-level API combining store + embeddings
- `memory/MemoryStore.ts` - SQLite persistence with vector operations
- `memory/EmbeddingService.ts` - OpenAI text-embedding-ada-002 integration
- `agent/memory/vectorStore.ts` - Vector similarity search with fallbacks
- In-memory fallback when better-sqlite3 unavailable (working correctly)

**Voice Interface**
- `backend/routes/voice.ts` - OpenAI Whisper transcription endpoint
- `backend/services/VoiceInputService.ts` - Backend voice processing service
- OpenAI Whisper-1 model for speech-to-text
- OpenAI TTS (tts-1 model) for voice responses
- MediaRecorder API for high-quality audio capture in renderer

**Premium Frontend (React + Electron)**
- `app/renderer/components/PremiumLuxuryApp.tsx` - Main premium UI component
- `app/renderer/styles/premium-luxury.css` - Luxury dark theme with glass morphism
- Real-time backend connectivity monitoring
- Live transcription and auto-send functionality
- `app/main/main.ts` - Electron main process
- `app/renderer/renderer.tsx` - Renderer entry point with error boundaries

### Key Design Patterns

**Circuit Breaker Pattern**
- ModelRouter implements circuit breakers for each LLM
- States: CLOSED → OPEN → HALF_OPEN with automatic recovery
- Prevents cascade failures and enables graceful degradation

**Memory Architecture**
- Vector embeddings for semantic search with text fallback
- In-memory database fallback when better-sqlite3 unavailable
- Automatic embedding generation with service availability checks

**Voice Processing Pipeline**
1. User clicks microphone → MediaRecorder starts
2. Audio captured in webm/wav format
3. Stop recording → Audio sent to `/api/voice/transcribe`
4. OpenAI Whisper processes audio → Returns text
5. Text auto-fills input and auto-sends to chat
6. AI responds → Text sent to `/api/voice/tts`
7. Audio plays back via HTML5 Audio API

**Tool Execution**
- Sandboxed tool execution with allowlist security
- Parallel and sequential execution modes
- Automatic retry with exponential backoff

### Critical Configuration

**Environment Variables**
```bash
# Required
OPENAI_API_KEY=sk-proj-...        # For GPT-4, Whisper STT, TTS
ANTHROPIC_API_KEY=sk-ant-...      # For Claude models

# Optional
ELEVEN_API_KEY=...                # ElevenLabs TTS (fallback)
PICOVOICE_ACCESS_KEY=...          # Wake word detection
LUNA_DISABLE_EMBEDDINGS=1         # Disable embeddings for testing
```

**API Endpoints**
- Backend: `http://localhost:3001`
- Health: `http://localhost:3001/health`
- Chat: `POST http://localhost:3001/api/agent/chat`
- Whisper STT: `POST http://localhost:3001/api/voice/transcribe` (multipart/form-data)
- TTS: `POST http://localhost:3001/api/voice/tts` (JSON body with text)

**Database System**
- Production: better-sqlite3 with WAL mode (if native bindings available)
- Fallback: In-memory database with SQL.js emulation
- Memory persistence in `memory/` directory
- **Note:** In-memory fallback is working correctly - no action needed

**Build System**
- esbuild for renderer (fast, ESM format)
- TypeScript compilation for backend and main process
- Node.js built-ins (fs, path, util) are EXTERNAL - not bundled in renderer
- Electron and better-sqlite3 marked as external
- Assets copied from `app/renderer/public/assets/` to `dist/app/renderer/assets/`

### Testing Strategy

**Memory System Tests**
- `test/unit/vectorStore.test.ts` - Vector operations, async patterns
- `test/integration/memory.e2e.test.ts` - Full memory lifecycle tests
- Use `LUNA_DISABLE_EMBEDDINGS=1` for deterministic testing

**Model Router Tests**
- Circuit breaker state transitions
- Rate limiting and retry logic
- Failover between models

### Development Notes

**Voice Development**
- Frontend uses MediaRecorder API for audio capture
- Backend handles Whisper transcription via OpenAI SDK
- TTS uses OpenAI tts-1 model (alloy voice by default)
- Auto-send after transcription with 300ms delay
- Real-time status updates during recording/processing

**Renderer Process Restrictions**
- NEVER import Node.js built-ins (fs, path, util) directly in renderer
- Use relative paths for assets: `./assets/filename`
- Logger in renderer only uses console (no file writes)
- MediaRecorder and Web APIs are safe to use

**Premium UI Components**
- `PremiumLuxuryApp.tsx` - Main component with all functionality
- Premium color scheme: Dark (#0a0a0f) with purple (#8b7ff5) and gold (#d4af37) accents
- SF Pro Display/Text fonts for Apple-quality typography
- Glass morphism with backdrop-filter blur
- Animations: typing indicator, voice pulse, message slide-ins
- Responsive design with mobile breakpoints

**Build Process**
1. `npm run build:backend` - Compiles TypeScript to `dist/`
2. `npm run build:renderer` - Bundles React app with esbuild
3. Assets automatically copied during renderer build
4. Script tag in HTML uses `type="module"` for ESM

**Common Issues & Solutions**
- **better-sqlite3 bindings error**: Expected, in-memory fallback works fine
- **"Empty transcription"**: Fixed with better null checking
- **Node module errors in renderer**: Add to external array in build-renderer.js
- **Double closing script tag**: Fixed in build-renderer.js regex

**Security Model**
- PII filtering on all user inputs
- Tool sandboxing with path traversal prevention
- Prompt injection detection in chat pipeline
- CORS configured for local development
- No sensitive data in renderer process

## Quick Start Guide

```bash
# Install dependencies
npm install

# Build the application
npm run build

# Start Luna Agent
npm start
```

The app will:
1. Start backend on port 3001
2. Launch Electron window with premium UI
3. Connect to OpenAI for Whisper STT and GPT-4 chat
4. Enable voice input via microphone button

## File Structure

```
luna-agent-v1.0-production-complete-2/
├── app/
│   ├── main/               # Electron main process
│   │   ├── main.ts         # Main entry point
│   │   └── preload.ts      # Preload script (IPC bridge)
│   └── renderer/           # React frontend
│       ├── components/
│       │   └── PremiumLuxuryApp.tsx  # Main UI component
│       ├── styles/
│       │   └── premium-luxury.css     # Premium styling
│       ├── utils/
│       │   └── logger.ts              # Renderer-safe logger
│       └── renderer.tsx               # Entry point
├── backend/
│   ├── server.ts           # Express server
│   ├── routes/
│   │   └── voice.ts        # Whisper STT/TTS routes
│   └── services/
│       └── VoiceInputService.ts
├── agent/                  # AI agent logic
├── memory/                 # Memory system
├── scripts/                # Build scripts
└── dist/                   # Build output
```

## Troubleshooting

**App won't start:**
- Check port 3001 is available
- Verify OPENAI_API_KEY in .env
- Run `npm run build` first

**Voice not working:**
- Check microphone permissions in browser
- Verify OPENAI_API_KEY is set
- Check browser console for errors

**Build errors:**
- Delete `node_modules` and `dist`
- Run `npm install` then `npm run build`
- Check for TypeScript errors with `npm run type-check`

**Database warnings:**
- better-sqlite3 warnings are expected
- In-memory fallback works correctly
- No action needed unless you need persistence
