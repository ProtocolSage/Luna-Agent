# Luna Agent State Flow (2025-10-16)

## Overview

The renderer keeps the majority of interactive state inside `app/renderer/components/LuxuryApp.tsx`. After duplicate voice subsystems were removed, the surviving state buckets are:

- **Conversation context** – `messages`, `currentConversationId`, streaming flags.
- **Voice runtime** – `voiceState` plus derived booleans for speaking/listening.
- **Security/session** – `securityStatus`, CSRF/session identifiers, rate‑limit budget.
- **System health** – `systemHealth`, `connectionStatus`.
- **UI controls** – dark mode, tool panel toggle, persona/model selection, etc.

## State Flow Highlights

1. **Initialization**
   - Security → Database → Session handshake (`initializeSecureSessionWithResilience`)  
   - Voice service boot (`initializeVoiceService`) → registers listeners that dispatch into `voiceState`, `inputValue`, and `handleSendMessage`.
   - Health + heartbeat timers drive `systemHealth` and `connectionStatus`.

2. **Voice → Message Pipeline**
   - `transcription_received` event sanitises text, sets `inputValue`, and calls `handleSendMessage(transcript)` directly.
   - `handleSendMessage` now accepts an override parameter to avoid stale state; it logs lifecycle steps, clears `inputValue`, queues the user message, stores it, and spins up the assistant response (streaming or buffered).
   - `finally` block restarts listening when `VOICE_AUTO_LISTEN` env is true.

3. **Cleanup**
   - Effect teardown cancels recovery/heartbeat intervals and destroys the core voice and security services.  
   - Enhanced voice ref + panel were removed to avoid duplicate initialisation/state.

## Simplifications Completed

- Removed the unused `voiceEnabled`, `autoListen`, `showEnhancedControls` flags.
- Deleted the dormant `EnhancedVoiceService` initialisation, controls panel, and transcript/error handlers.
- Collapsed the duplicate text input (only the footer composer remains).
- Added granular console logging for input value changes and send lifecycle.

## Remaining Consolidation Opportunities

- **VoiceState shape** – several booleans (`isListening`, `isProcessing`, `isSpeaking`) could be converted to a single enum with derived selectors to prevent contradictory states.
- **Timers** – `recoveryTimeoutRef`, `healthCheckInterval`, `heartbeatInterval` could be centralised in a scheduler helper.
- **Security state** – consider elevating security/session management into a dedicated context provider to decouple from UI rendering.
- **Message storage** – the optimistic append + later merge for assistant responses could move into a reducer to make streaming vs non-streaming behaviour explicit.

## Testing Notes

- Verify the voice auto-send path after every change by watching the new `[INPUT]` and `[SEND]` logs in DevTools.
- When adding new state, ensure hooks are memoised; broad dependencies on objects (`securityStatus`) will re-instantiate callbacks every render.

