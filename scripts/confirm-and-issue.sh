#!/bin/bash
set -e

# CONFIRM & ISSUE Script
# Confirms all PRs are live and creates GitHub issues

echo "=================================================="
echo "CONFIRM & ISSUE — START ✅"
echo "=================================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ============================================================================
# STEP 0: Check Preconditions
# ============================================================================

echo "### Checking Preconditions ###"
echo ""

# Check gh CLI
if ! command -v gh &> /dev/null; then
    echo -e "${RED}❌ BLOCKED: GitHub CLI (gh) is not installed${NC}"
    echo "Install: https://cli.github.com/"
    exit 1
fi

# Check gh auth
if ! gh auth status &> /dev/null; then
    echo -e "${RED}❌ BLOCKED: GitHub CLI is not authenticated${NC}"
    echo "Run: gh auth login"
    exit 1
fi

echo -e "${GREEN}✅ GitHub CLI is installed and authenticated${NC}"
echo ""

# Check we're in the right directory
if [ ! -f "docs/SPRINT_DELIVERABLES.md" ]; then
    echo -e "${RED}❌ BLOCKED: Not in Luna-Agent repository root${NC}"
    exit 1
fi

echo -e "${GREEN}✅ In Luna-Agent repository${NC}"
echo ""

# ============================================================================
# STEP 1: Extract Branch Names and Create/Verify PRs
# ============================================================================

echo "=================================================="
echo "### STEP 1: Creating/Verifying PRs ###"
echo "=================================================="
echo ""

# Define branches and metadata
declare -A BRANCHES=(
    ["claude/platform-electron-sandbox-perms-011CUPXmdrJ9W72iAq21fi1D"]="Security: Enable Electron Sandbox and Fix App Boot|Fixes critical sandbox vulnerability and app boot issue. Enables sandbox mode, adds permission handlers, blocks external navigation.|security,critical,platform"
    ["claude/security-toolpipeline-safe-planning-011CUPXmdrJ9W72iAq21fi1D"]="Security: Remove Unsafe Tool Planning Fallback|Eliminates RCE vulnerability by removing unsafe command execution fallback. Adds safe JSON parser with schema validation.|security,critical,agent"
    ["claude/security-preload-secret-scrub-011CUPXmdrJ9W72iAq21fi1D"]="Security: Remove API Key Exposure in Preload|Removes API key exposure from renderer process. Keys now stay server-side only.|security,critical,electron"
    ["claude/voice-streaming-stt-011CUPXmdrJ9W72iAq21fi1D"]="Voice: Add WebSocket Streaming STT|Adds real-time speech-to-text via WebSocket for low-latency voice input.|voice,enhancement,websocket"
    ["claude/voice-streaming-tts-011CUPXmdrJ9W72iAq21fi1D"]="Voice: Add Chunked Streaming TTS|Adds chunked TTS streaming for improved perceived latency and progressive audio playback.|voice,enhancement,tts"
    ["claude/ci-security-setup-011CUPXmdrJ9W72iAq21fi1D"]="CI: Add Security Scanning for Build Artifacts|Adds fail-closed CI security scanning that detects API keys and secrets in build artifacts.|ci,security,infrastructure"
)

# Arrays to store results
declare -A PR_NUMBERS
declare -A PR_URLS
declare -A PR_STATUS
declare -A PR_FAILING_JOBS

# Process each branch
for BRANCH in "${!BRANCHES[@]}"; do
    IFS='|' read -r TITLE BODY LABELS <<< "${BRANCHES[$BRANCH]}"

    echo "Processing branch: $BRANCH"
    echo "  Title: $TITLE"

    # Check if branch exists on remote
    if ! git ls-remote --heads origin "$BRANCH" | grep -q "$BRANCH"; then
        echo -e "  ${RED}❌ Branch does not exist on remote${NC}"
        continue
    fi

    # Check if PR already exists
    PR_NUMBER=$(gh pr list --head "$BRANCH" --json number --jq '.[0].number' 2>/dev/null || echo "")

    if [ -z "$PR_NUMBER" ]; then
        echo "  Creating new PR..."

        # Create PR
        PR_URL=$(gh pr create \
            --base main \
            --head "$BRANCH" \
            --title "$TITLE" \
            --body "$BODY" \
            --label "$LABELS" 2>&1)

        if [ $? -eq 0 ]; then
            # Extract PR number from URL
            PR_NUMBER=$(echo "$PR_URL" | grep -oP 'pull/\K\d+')
            echo -e "  ${GREEN}✅ Created PR #$PR_NUMBER${NC}"
            echo "  URL: $PR_URL"
        else
            echo -e "  ${RED}❌ Failed to create PR${NC}"
            echo "  Error: $PR_URL"
            continue
        fi
    else
        PR_URL=$(gh pr view "$PR_NUMBER" --json url --jq '.url')
        echo -e "  ${GREEN}✅ PR already exists: #$PR_NUMBER${NC}"
        echo "  URL: $PR_URL"
    fi

    # Store PR info
    PR_NUMBERS[$BRANCH]=$PR_NUMBER
    PR_URLS[$BRANCH]=$PR_URL

    echo ""
done

# ============================================================================
# STEP 2: Check CI Status for Each PR
# ============================================================================

echo "=================================================="
echo "### STEP 2: Checking CI Status ###"
echo "=================================================="
echo ""

for BRANCH in "${!PR_NUMBERS[@]}"; do
    PR_NUMBER=${PR_NUMBERS[$BRANCH]}

    echo "Checking CI for PR #$PR_NUMBER ($BRANCH)..."

    # Get CI status
    CI_STATUS=$(gh pr checks "$PR_NUMBER" --json name,conclusion --jq '.' 2>/dev/null || echo "[]")

    if [ "$CI_STATUS" = "[]" ]; then
        echo -e "  ${YELLOW}⚠️  NO_CHECKS - No CI checks found${NC}"
        PR_STATUS[$BRANCH]="NO_CHECKS"
    else
        # Check if all checks passed
        FAILED_CHECKS=$(echo "$CI_STATUS" | jq -r '.[] | select(.conclusion != "success" and .conclusion != "skipped") | .name' 2>/dev/null || echo "")

        if [ -z "$FAILED_CHECKS" ]; then
            echo -e "  ${GREEN}✅ PASS - All CI checks passed${NC}"
            PR_STATUS[$BRANCH]="PASS"
        else
            echo -e "  ${RED}❌ FAIL - Some CI checks failed:${NC}"
            echo "$FAILED_CHECKS" | while read -r job; do
                echo "    - $job"
            done
            PR_STATUS[$BRANCH]="FAIL"
            PR_FAILING_JOBS[$BRANCH]="$FAILED_CHECKS"
        fi
    fi

    echo ""
done

# ============================================================================
# STEP 3: Execute Issue Creation Commands
# ============================================================================

echo "=================================================="
echo "### STEP 3: Creating GitHub Issues ###"
echo "=================================================="
echo ""

# Arrays to store issue results
declare -a ISSUE_RESULTS
declare -a ISSUE_URLS
declare -a ISSUE_ERRORS

# Issue 1: Electron Sandbox
echo "Creating Issue 1: Electron Sandbox Security..."
ISSUE_URL=$(gh issue create --title "Security: Enable Electron Sandbox and Fix App Boot" \
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
PR: ${PR_URLS[claude/platform-electron-sandbox-perms-011CUPXmdrJ9W72iAq21fi1D]:-TBD}

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
  --label "security,critical,platform" 2>&1)

if [ $? -eq 0 ]; then
    echo -e "  ${GREEN}✅ CREATED${NC}"
    echo "  URL: $ISSUE_URL"
    ISSUE_RESULTS+=("Issue 1|CREATED|$ISSUE_URL")
else
    echo -e "  ${RED}❌ FAILED${NC}"
    echo "  Error: $ISSUE_URL"
    ISSUE_RESULTS+=("Issue 1|FAILED|$ISSUE_URL")
fi
echo ""

# Issue 2: Tool Planning
echo "Creating Issue 2: Remove Unsafe Planning Fallback..."
ISSUE_URL=$(gh issue create --title "Security: Remove Unsafe Tool Planning Fallback" \
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
PR: ${PR_URLS[claude/security-toolpipeline-safe-planning-011CUPXmdrJ9W72iAq21fi1D]:-TBD}

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
  --label "security,critical,agent" 2>&1)

if [ $? -eq 0 ]; then
    echo -e "  ${GREEN}✅ CREATED${NC}"
    echo "  URL: $ISSUE_URL"
    ISSUE_RESULTS+=("Issue 2|CREATED|$ISSUE_URL")
else
    echo -e "  ${RED}❌ FAILED${NC}"
    echo "  Error: $ISSUE_URL"
    ISSUE_RESULTS+=("Issue 2|FAILED|$ISSUE_URL")
fi
echo ""

# Issue 3: Preload Secrets
echo "Creating Issue 3: Scrub API Keys from Preload..."
ISSUE_URL=$(gh issue create --title "Security: Remove API Key Exposure in Preload Script" \
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
PR: ${PR_URLS[claude/security-preload-secret-scrub-011CUPXmdrJ9W72iAq21fi1D]:-TBD}

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
  --label "security,critical,electron" 2>&1)

if [ $? -eq 0 ]; then
    echo -e "  ${GREEN}✅ CREATED${NC}"
    echo "  URL: $ISSUE_URL"
    ISSUE_RESULTS+=("Issue 3|CREATED|$ISSUE_URL")
else
    echo -e "  ${RED}❌ FAILED${NC}"
    echo "  Error: $ISSUE_URL"
    ISSUE_RESULTS+=("Issue 3|FAILED|$ISSUE_URL")
fi
echo ""

# Issue 4: Streaming STT
echo "Creating Issue 4: WebSocket Streaming STT..."
ISSUE_URL=$(gh issue create --title "Voice: Add WebSocket Streaming STT" \
  --body "## Overview
Add real-time speech-to-text streaming via WebSocket.

## Features
✅ WebSocket endpoint: \`/api/voice/stream-stt\`
✅ Real-time audio chunk accumulation
✅ Interim transcription events
✅ Final transcription on disconnect

## PR
Branch: \`claude/voice-streaming-stt-011CUPXmdrJ9W72iAq21fi1D\`
PR: ${PR_URLS[claude/voice-streaming-stt-011CUPXmdrJ9W72iAq21fi1D]:-TBD}

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
  --label "voice,enhancement,websocket" 2>&1)

if [ $? -eq 0 ]; then
    echo -e "  ${GREEN}✅ CREATED${NC}"
    echo "  URL: $ISSUE_URL"
    ISSUE_RESULTS+=("Issue 4|CREATED|$ISSUE_URL")
else
    echo -e "  ${RED}❌ FAILED${NC}"
    echo "  Error: $ISSUE_URL"
    ISSUE_RESULTS+=("Issue 4|FAILED|$ISSUE_URL")
fi
echo ""

# Issue 5: Streaming TTS
echo "Creating Issue 5: Chunked Streaming TTS..."
ISSUE_URL=$(gh issue create --title "Voice: Add Chunked Streaming TTS" \
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
PR: ${PR_URLS[claude/voice-streaming-tts-011CUPXmdrJ9W72iAq21fi1D]:-TBD}

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
  --label "voice,enhancement,tts" 2>&1)

if [ $? -eq 0 ]; then
    echo -e "  ${GREEN}✅ CREATED${NC}"
    echo "  URL: $ISSUE_URL"
    ISSUE_RESULTS+=("Issue 5|CREATED|$ISSUE_URL")
else
    echo -e "  ${RED}❌ FAILED${NC}"
    echo "  Error: $ISSUE_URL"
    ISSUE_RESULTS+=("Issue 5|FAILED|$ISSUE_URL")
fi
echo ""

# Issue 6: CI Security Scanning
echo "Creating Issue 6: CI Security Scanning..."
ISSUE_URL=$(gh issue create --title "CI: Add Security Scanning for Secrets in Build Artifacts" \
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
PR: ${PR_URLS[claude/ci-security-setup-011CUPXmdrJ9W72iAq21fi1D]:-TBD}

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
  --label "ci,security,infrastructure" 2>&1)

if [ $? -eq 0 ]; then
    echo -e "  ${GREEN}✅ CREATED${NC}"
    echo "  URL: $ISSUE_URL"
    ISSUE_RESULTS+=("Issue 6|CREATED|$ISSUE_URL")
else
    echo -e "  ${RED}❌ FAILED${NC}"
    echo "  Error: $ISSUE_URL"
    ISSUE_RESULTS+=("Issue 6|FAILED|$ISSUE_URL")
fi
echo ""

# ============================================================================
# Generate Final Report
# ============================================================================

echo "=================================================="
echo "### FINAL REPORT ###"
echo "=================================================="
echo ""

echo "## PRs Status"
echo ""
echo "| Branch | PR# | URL | CI Status | Failing Jobs |"
echo "|--------|-----|-----|-----------|--------------|"

for BRANCH in "${!PR_NUMBERS[@]}"; do
    PR_NUM=${PR_NUMBERS[$BRANCH]}
    PR_URL=${PR_URLS[$BRANCH]}
    STATUS=${PR_STATUS[$BRANCH]}
    FAILING=${PR_FAILING_JOBS[$BRANCH]:-"N/A"}

    # Truncate branch name for table
    SHORT_BRANCH=$(echo "$BRANCH" | sed 's/claude\///' | cut -c1-30)

    echo "| $SHORT_BRANCH | #$PR_NUM | $PR_URL | $STATUS | $FAILING |"
done

echo ""
echo "## Issues Created"
echo ""
echo "| Issue | Result | URL/Reason |"
echo "|-------|--------|------------|"

for RESULT in "${ISSUE_RESULTS[@]}"; do
    IFS='|' read -r ISSUE STATUS URL <<< "$RESULT"
    echo "| $ISSUE | $STATUS | $URL |"
done

echo ""
echo "## Summary"
echo ""

# Count statuses
PASS_COUNT=$(for status in "${PR_STATUS[@]}"; do echo "$status"; done | grep -c "PASS" || echo "0")
FAIL_COUNT=$(for status in "${PR_STATUS[@]}"; do echo "$status"; done | grep -c "FAIL" || echo "0")
NO_CHECKS=$(for status in "${PR_STATUS[@]}"; do echo "$status"; done | grep -c "NO_CHECKS" || echo "0")

CREATED_COUNT=$(for result in "${ISSUE_RESULTS[@]}"; do echo "$result"; done | grep -c "CREATED" || echo "0")
FAILED_COUNT=$(for result in "${ISSUE_RESULTS[@]}"; do echo "$result"; done | grep -c "FAILED" || echo "0")

echo "### PR CI Status:"
echo "  ✅ PASS: $PASS_COUNT"
echo "  ❌ FAIL: $FAIL_COUNT"
echo "  ⚠️  NO_CHECKS: $NO_CHECKS"
echo ""

echo "### Issues:"
echo "  ✅ CREATED: $CREATED_COUNT"
echo "  ❌ FAILED: $FAILED_COUNT"
echo ""

if [ "$FAIL_COUNT" -gt 0 ]; then
    echo "### Next Actions:"
    echo "  1. Review failing CI jobs above"
    echo "  2. Fix issues in failing branches"
    echo "  3. Push fixes and wait for CI"
    echo "  4. Request reviews once CI passes"
else
    echo "### Next Actions:"
    echo "  ✅ All PRs have passing or pending CI"
    echo "  ✅ Request reviews from @ProtocolSage @LunaOps"
    echo "  ✅ Merge critical security PRs first (1, 2, 3)"
fi

echo ""
echo "=================================================="
echo "CONFIRM & ISSUE — COMPLETE ✅"
echo "=================================================="
