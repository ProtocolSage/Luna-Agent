# Immediate Technical Priorities (post 2025-10-16 session)

## 1. Logging & Observability
- Introduce a shared logger (winston already in dependencies) with log levels and rotating files.
- Replace `console.log`/`console.error` in `LuxuryApp.tsx`, services, and backend routers.
- Capture structured telemetry for voice pipeline (start/stop reasons, transcript latency).

## 2. Database Persistence on Windows
- Rebuild `better-sqlite3` from a native Windows shell (`npm rebuild better-sqlite3`) after switching to the project root on Windows.
- Add a post-install guard that verifies the native module architecture and logs a clear warning if a mismatch is detected.
- Consider dual persistence (better-sqlite3 + SQL.js fallback) with migration tooling.

## 3. Wake Word Completion
- Copy `pv_porcupine.wasm` and `porcupine_worker.js` from `@picovoice/porcupine-web` into `dist/app/renderer/assets`.
- Update `WakeWordListener` to use local assets and surface status in the UI.
- Provide a settings toggle so users can enable/disable wake word and view diagnostics.

## 4. Error Boundaries & Recovery
- Wrap conversational components with React error boundaries (renderer already has `VoiceErrorBoundary` — extend usage).
- Add backend try/catch middleware to send consistent error responses and structured logging.

## 5. Component Refactoring
- Split `LuxuryApp.tsx` into smaller modules: conversation view, composer, voice controller, status bar.
- Move service initialisation into custom hooks (`useVoiceService`, `useSecuritySession`) for reuse and testing.

## 6. Automated Testing
- Add unit tests around `handleSendMessage` (including override path) and security sanitisation.
- Create integration smoke test for voice pipeline using mock transcription events.

## 7. Bundle & Performance
- Enable code-splitting for heavy vendor modules (Three.js, Supabase) and audit dynamic imports.
- Replace bespoke animations with CSS transforms where possible to lighten renderer bundle.

