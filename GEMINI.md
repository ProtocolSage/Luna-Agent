# Luna Agent Coding Standards & Architecture

Canonical standards for building the Luna voice agent, a Windows-first desktop assistant. This document reflects the actual implementation and all new work must conform to these specifics.

## 1. Tech Stack & Target OS

*   **Target OS**: Windows 11 (primary), macOS (tier-2).
*   **Application Framework**: Electron `^28.3.2`
*   **Frontend**: React `^18.2.0` with TypeScript (strict).
*   **Backend**: Node.js `^18.0.0` with Express `^4.18.2`.
*   **Database**: `better-sqlite3` for local data storage.
*   **AI Providers**: OpenAI and Anthropic SDKs for language models.
*   **Packaging**: `electron-builder` for creating NSIS installers on Windows.
*   **Configuration**: Managed via `.env` files and `dotenv` package.

## 2. Voice Assistant Architecture

The system is divided into three main parts: the Electron main process, the frontend (renderer process), and a local backend server.

*   **Frontend (app/renderer)**: Handles all UI, including wake word detection.
*   **Backend (backend)**: An Express server that manages AI logic, tool execution, and voice services.
*   **Agent Core (agent)**: Contains the core logic for the agent, including the pipeline, orchestrator, and memory services.

### Voice Pipeline

1.  **Wake Word Detection**: The frontend uses `@picovoice/porcupine-web` to listen for the "Hey Luna" wake word. This is implemented in `app/renderer/components/WakeWordListener.tsx`.
2.  **Speech-to-Text (STT)**: When the wake word is detected, the frontend captures audio and sends it to the backend for transcription. The backend uses a cloud-based STT service.
3.  **Agent Orchestration**: The transcribed text is sent to the `ReasoningEngine` (`agent/orchestrator/reasoningEngine.ts`), which decides whether to respond directly or use a tool.
4.  **Tool Execution**: If a tool is needed, the `ToolExecutive` (`agent/tools/executive.ts`) is invoked.
5.  **Text-to-Speech (TTS)**: The agent's response text is sent to the `VoiceService` (`agent/services/voiceService.ts`), which uses the `ElevenLabsService` (`backend/services/elevenLabsService.ts`) to generate and stream audio back to the user.

## 3. Code Quality & Style

*   **Typing**: TypeScript `strict` mode is enforced across the entire codebase.
*   **Linting & Formatting**: ESLint and Prettier are used for all TypeScript files. Configuration is in `eslint.config.js` and `.prettierrc`.
*   **Error Handling**: Errors are explicitly handled and logged. The backend includes a global error handler in `backend/server.ts`.

## 4. Repository Structure

```
/
├── app/              # Electron frontend (Renderer & Main process code)
│   ├── main/           # Electron main process
│   └── renderer/       # React UI components
├── backend/          # Express.js server
│   ├── routes/         # API endpoints
│   └── services/       # Business logic (e.g., ElevenLabs)
├── agent/            # Core AI agent logic
│   ├── memory/         # Vector store and memory management
│   ├── orchestrator/   # Model routing and reasoning
│   ├── pipeline/       # Tool execution pipeline
│   └── voice/          # Voice-related utilities
├── assets/           # Static assets (e.g., wake word model)
├── dist/             # Compiled output from TypeScript
├── scripts/          # Build and utility scripts
├── .env.example      # Environment variable template
└── package.json      # Project dependencies and scripts
```

## 5. Audio I/O & Providers

*   **Wake Word**: `@picovoice/porcupine-web` `^3.0.3` is used for wake word detection. The model is located at `assets/Hey-Luna_en_wasm_v3/Hey-Luna_en_wasm_v3_0_0.ppn`.
*   **TTS**: `ElevenLabsService` provides text-to-speech functionality, streaming audio directly from the ElevenLabs API. It includes features like voice switching and interruption.
*   **Audio Playback**: The backend uses the `speaker` package to play the received audio stream.

## 6. Security & Privacy

*   **Backend Security**: The Express server uses `helmet` for security headers, `cors` for cross-origin resource sharing, and `express-rate-limit` to prevent abuse.
*   **Authentication**: Session management is handled via cookies and JWTs, with security logic in `backend/utils/SecurityService.ts`.
*   **PII Filtering**: A `PIIFilter` (`agent/validators/piiFilter.ts`) is used to scrub sensitive information before it is sent to AI models.
*   **Secrets**: API keys and other secrets are managed through `.env` files and accessed via `process.env`.

## 7. Testing

*   **Framework**: Jest is the primary testing framework, configured in `jest.config.cjs`.
*   **E2E Testing**: Playwright is set up for end-to-end testing, configured in `playwright.config.ts`.
*   **Unit & Integration Tests**: Tests are located in the `test/` directory, with subdirectories for unit and integration tests.

## 8. Build & Deployment

*   **Build Process**: The `build` script in `package.json` orchestrates the compilation of all TypeScript code and the bundling of the renderer.
*   **Packaging**: `electron-builder` is used to create a distributable `.exe` installer for Windows.
*   **CI/CD**: Workflows for CI/CD are defined in the `.github/workflows` directory.

## 9. Agent Self-Validation

*   ✅ **Types everywhere**: The project is fully typed with TypeScript in strict mode.
*   ✅ **Dependencies declared**: All dependencies are listed in `package.json`.
*   ✅ **Secrets handled securely**: Secrets are loaded from `.env` and not hardcoded.
*   ✅ **Modular architecture**: The code is organized into distinct modules for the frontend, backend, and agent core.
*   ✅ **Voice services are specific**: The agent uses ElevenLabs for TTS and Picovoice for wake word detection, with dedicated services for each.
