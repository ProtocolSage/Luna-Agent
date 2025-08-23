# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Essential Commands

### Development
- `npm run build:prod` - Production build (compiles TypeScript, webpack bundles)
- `npm run build:dev` - Development build 
- `npm run dev` - Development mode with hot reload
- `npm start` - Build and start Electron app
- `npm run luna` - Production launcher

### Testing
- `npm test` - Run full test suite (Jest)
- `npm run test:coverage` - Generate test coverage report
- `npm run test:offline` - Skip integration tests
- `LUNA_DISABLE_EMBEDDINGS=1 npm test` - Test without embeddings for memory system

### Type Checking & Linting
- `npm run typecheck` - TypeScript type checking without compilation
- `npm run lint` - ESLint with max 0 warnings
- `npm run lint:fix` - Auto-fix linting issues

### Packaging
- `npm run package` - Create distributable package
- `npm run package:win` - Windows-specific package
- `npm run rebuild` - Rebuild native dependencies (better-sqlite3)

## Architecture Overview

### Core System Structure
Luna Agent is an Electron-based AI assistant with a multi-layered architecture:

**Backend (Express Server)**
- Entry: `backend/server.ts` - API server with CORS, model routing
- Routes: `/chat`, `/health`, `/metrics`, `/tts` endpoints
- Multi-LLM support: OpenAI, Anthropic, Ollama (local)

**Agent Core** 
- `agent/orchestrator/modelRouter.ts` - Circuit breaker pattern for LLM failover
- `agent/pipeline/ToolPipeline.ts` - Tool execution pipeline with planning
- `agent/tools/executive.ts` - 50+ tools including filesystem, web, memory
- `agent/validators/piiFilter.ts` - PII detection and prompt injection prevention

**Memory System**
- `memory/MemoryService.ts` - High-level API combining store + embeddings
- `memory/MemoryStore.ts` - SQLite persistence with vector operations
- `memory/EmbeddingService.ts` - OpenAI text-embedding-ada-002 integration
- `agent/memory/vectorStore.ts` - Vector similarity search with fallbacks

**Voice Interface**
- `app/renderer/services/VoiceService.ts` - Main voice orchestrator
- Hybrid STT: Cloud (OpenAI Whisper) + Web Speech API fallbacks
- Continuous conversation with auto-listen after TTS
- Voice Activity Detection and audio streaming

**Frontend (React + Electron)**
- `app/renderer/components/LuxuryApp.tsx` - Main UI with glass morphism
- Streaming conversation interface with real-time token display
- Enhanced voice controls and tools panel
- `app/main/main.ts` - Electron main process

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
- Event-driven architecture: `listening_started` → `transcription_received` → `tts_started` → `tts_ended`
- Sentence-by-sentence streaming TTS during AI response generation  
- Barge-in capability and continuous conversation loops

**Tool Execution**
- Sandboxed tool execution with allowlist security
- Parallel and sequential execution modes
- Automatic retry with exponential backoff

### Critical Configuration

**Environment Variables**
```bash
OPENAI_API_KEY=your-key
ANTHROPIC_API_KEY=your-key
LUNA_DISABLE_EMBEDDINGS=1  # Disables embeddings for testing
LUNA_ENABLE_WHISPER=true   # Enables Whisper STT provider (auto-enabled in development)
```

**Database System**
- Production: better-sqlite3 with WAL mode
- Fallback: In-memory database with SQL emulation (`backend/database.js`)
- Memory persistence in `memory/` directory

**Build System**
- Custom webpack configuration for main + renderer processes
- File polyfills for Node.js APIs in renderer
- Config files copied to `dist/config/` during build

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
- Two voice systems: Legacy VoiceControls (disabled) and new VoiceService
- STT providers in `app/renderer/services/stt/` with fallback hierarchy
- Audio visualization canvas for voice activity feedback

**Memory Development** 
- VectorStore methods are async with `ensureReady()` pattern
- Embedding clearing: Set `embedding: null` explicitly in updates
- Text similarity fallback when embeddings unavailable

**UI Development**
- Glass morphism CSS in `app/renderer/styles/luxury.css`
- Z-index hierarchy: Header (1000) < Panels (10001)
- Enhancement status banner shows system capabilities

**Security Model**
- PII filtering on all user inputs
- Tool sandboxing with path traversal prevention
- Prompt injection detection in chat pipeline
