# GitHub Issues for Security & Voice PRs

Run these commands to create tracking issues for each PR:

## Issue 1: Electron Sandbox Security Hardening

```bash
gh issue create --title "Security: Enable Electron Sandbox and Fix App Boot" \
  --body "## Overview
Critical security fix enabling Electron sandbox mode and fixing application startup.

## Problem
- Sandbox disabled (\`sandbox: false\`) - major security vulnerability
- Syntax error in \`app.enableSandbox()\` preventing initialization
- Incorrect port configuration (3000 vs 3001)
- No permission handlers for media access in sandbox

## Solution
✅ Enable sandbox globally (\`app.enableSandbox()\`)
✅ Enable sandbox per-window (\`sandbox: true\`)
✅ Fix syntax error in setupApp()
✅ Add permission request handler for media/notifications
✅ Block external navigation
✅ Update CSP to port 3001

## PR
Branch: \`claude/platform-electron-sandbox-perms-011CUPXmdrJ9W72iAq21fi1D\`

## Tests
- Comprehensive security test suite
- All settings validated
- Regression prevention tests

## Acceptance Criteria
- [ ] Sandbox enabled globally
- [ ] Sandbox enabled per-window
- [ ] Permission handlers configured
- [ ] App boots successfully
- [ ] Voice input works in sandbox mode
- [ ] All security tests pass
- [ ] CI passes

## Priority
🔴 CRITICAL - Blocks app startup, critical security fix

## Reviewers
@ProtocolSage @LunaOps" \
  --label "security,critical,platform" \
  --assignee "@me"
```

## Issue 2: Remove Unsafe Planning Fallback

```bash
gh issue create --title "Security: Remove Unsafe Tool Planning Fallback" \
  --body "## Overview
Critical RCE vulnerability fix in ToolPipeline planning system.

## Vulnerability
When LLM returns malformed JSON, system falls back to:
\`\`\`typescript
{ tool: 'execute_command', args: { command: userRequest } }
\`\`\`
This executes RAW USER INPUT as shell command.

## Solution
✅ Create PlanParser with JSON repair
✅ Schema validation with Zod
✅ Sanitize tool names (prevent injection)
✅ Fail-safe: malformed → empty plan (NOT command execution)

## PR
Branch: \`claude/security-toolpipeline-safe-planning-011CUPXmdrJ9W72iAq21fi1D\`

## New Components
- \`agent/pipeline/planParser.ts\`
- \`test/unit/planParser.test.ts\`

## Key Test
✅ malformed plan → empty plan (no unsafe fallback)

## Acceptance Criteria
- [ ] Unsafe fallback removed
- [ ] PlanParser with repair implemented
- [ ] Schema validation working
- [ ] All tests pass (especially malformed input test)
- [ ] CI passes

## Priority
🔴 CRITICAL - RCE vulnerability

## Reviewers
@ProtocolSage @LunaOps" \
  --label "security,critical,agent" \
  --assignee "@me"
```

## Issue 3: Scrub API Keys from Preload

```bash
gh issue create --title "Security: Remove API Key Exposure in Preload Script" \
  --body "## Overview
Critical secret exposure fix - API keys leaked to renderer process.

## Vulnerability
Preload script exposes API keys via \`contextBridge.exposeInMainWorld\`:
- OPENAI_API_KEY
- ANTHROPIC_API_KEY
- AZURE_SPEECH_KEY
- DEEPGRAM_API_KEY
- GOOGLE_CLOUD_API_KEY
- ELEVEN_API_KEY
- PICOVOICE_ACCESS_KEY

Attack vectors:
1. DevTools: \`window.__ENV.OPENAI_API_KEY\`
2. XSS: Malicious script exfiltration
3. Third-party code: Analytics/tracking access
4. Build artifacts: Keys in bundled code

## Solution
✅ Remove ALL API keys from preload
✅ Only expose non-sensitive config
✅ Renderer calls backend APIs (keys stay server-side)

## PR
Branch: \`claude/security-preload-secret-scrub-011CUPXmdrJ9W72iAq21fi1D\`

## Architecture
Renderer (no keys) → Backend APIs → External Services

## Tests
- No API keys in exposed __ENV
- Regression tests for each key
- ContextBridge safety checks

## Acceptance Criteria
- [ ] All API keys removed from preload
- [ ] Only safe config exposed
- [ ] All tests pass
- [ ] CI secret scan passes
- [ ] Documentation complete

## Priority
🔴 CRITICAL - Secret exposure

## Reviewers
@ProtocolSage @LunaOps" \
  --label "security,critical,electron" \
  --assignee "@me"
```

## Issue 4: Streaming STT Foundation

```bash
gh issue create --title "Voice: Add WebSocket Streaming STT" \
  --body "## Overview
Add real-time speech-to-text streaming via WebSocket.

## Features
✅ WebSocket endpoint: \`/api/voice/stream-stt\`
✅ Real-time audio chunk accumulation
✅ Interim transcription events
✅ Final transcription on disconnect

## PR
Branch: \`claude/voice-streaming-stt-011CUPXmdrJ9W72iAq21fi1D\`

## Architecture
- WebSocket server integrated with Express
- Audio buffering for batched processing
- Event-based client notifications

## Future Work
- OpenAI Whisper streaming API integration
- Real-time VAD (voice activity detection)
- Language detection

## Acceptance Criteria
- [ ] WebSocket server running
- [ ] Audio chunk handling
- [ ] Event notifications working
- [ ] Integration tests pass

## Priority
🟡 MEDIUM - Enhancement

## Reviewers
@ProtocolSage @LunaOps" \
  --label "voice,enhancement,websocket" \
  --assignee "@me"
```

## Issue 5: Streaming TTS for Low Latency

```bash
gh issue create --title "Voice: Add Chunked Streaming TTS" \
  --body "## Overview
Add streaming TTS endpoint for improved perceived latency.

## Features
✅ Chunked audio streaming (4KB chunks)
✅ Low-latency playback start
✅ OpenAI TTS integration (tts-1)
✅ Multiple voice support

## Endpoint
\`\`\`
POST /api/voice/tts/stream
Body: { \"text\": \"...\", \"voice\": \"alloy\" }
Response: audio/mpeg stream
\`\`\`

## PR
Branch: \`claude/voice-streaming-tts-011CUPXmdrJ9W72iAq21fi1D\`

## Benefits
- Faster perceived response time
- Progressive audio playback
- Better UX for long responses
- Efficient bandwidth usage

## Integration
\`\`\`javascript
const audio = new Audio();
audio.src = 'http://localhost:3001/api/voice/tts/stream';
audio.play();
\`\`\`

## Acceptance Criteria
- [ ] Streaming endpoint working
- [ ] Chunked delivery implemented
- [ ] Multiple voices supported
- [ ] Integration tests pass

## Priority
🟡 MEDIUM - Enhancement

## Reviewers
@ProtocolSage @LunaOps" \
  --label "voice,enhancement,tts" \
  --assignee "@me"
```

## Issue 6: CI Security Scanning

```bash
gh issue create --title "CI: Add Security Scanning for Secrets in Build Artifacts" \
  --body "## Overview
Add fail-closed CI security scanning for API keys and secrets.

## Features
✅ scripts/ci/scan-bundles.js - Secret scanner
✅ Updated .github/workflows/ci.yml
✅ Scans dist/ after build
✅ Detects OpenAI, Anthropic, AWS, GitHub keys
✅ Fails build if secrets found

## PR
Branch: \`claude/ci-security-setup-011CUPXmdrJ9W72iAq21fi1D\`

## Patterns Detected
- OpenAI keys (sk-...)
- Anthropic keys (sk-ant-...)
- AWS keys (AKIA...)
- GitHub tokens (ghp_...)
- Generic API keys
- Private keys (RSA, SSH)
- Database URLs

## Acceptance Criteria
- [ ] Scanner script created
- [ ] CI workflow updated
- [ ] Scanner runs after build
- [ ] Build fails on secret detection
- [ ] Allowlist patterns work
- [ ] Documentation complete

## Priority
🟡 HIGH - Security infrastructure

## Reviewers
@ProtocolSage @LunaOps" \
  --label "ci,security,infrastructure" \
  --assignee "@me"
```

---

## Execution Instructions

1. Navigate to the Luna-Agent repository directory
2. Ensure you have `gh` CLI installed and authenticated
3. Run each command above in sequence
4. Issues will be created and linked to PRs
5. Assign additional reviewers as needed

## Notes

- All critical security issues are marked with 🔴
- Enhancement issues are marked with 🟡
- Replace `@me` with specific assignees if needed
- Add milestone/project links as appropriate
