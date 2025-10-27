#!/bin/bash
#
# PHASE 2: Cherry-pick Salvage from Failing Claude PRs
#
# PURPOSE: Extract valuable commits from failing PRs before closing them
# EXECUTE FROM: ~/dev/Luna-Agent (WSL ext4, NOT /mnt/*)
# REQUIREMENTS: gh CLI authenticated, git configured
#

set -euo pipefail

# Safety check: abort if on Windows DrvFS
if [[ $PWD == /mnt/* ]]; then
  echo "❌ ABORT: Repository is on Windows DrvFS (/mnt/*)"
  echo "   Move to WSL ext4 first: ~/dev/Luna-Agent"
  exit 1
fi

OWNER="ProtocolSage"
REPO="Luna-Agent"

echo "🚀 Phase 2: Salvaging commits from failing PRs..."
echo "   Repository: $OWNER/$REPO"
echo "   Current directory: $PWD"
echo ""

# Fetch all branches
echo "📥 Fetching all branches..."
git fetch --all --prune

# Define PR branch pairs (claude -> copilot)
# Format: "PR#:claude-branch:copilot-branch:feature-name"
declare -a pairs=(
  "2:claude/ci-security-setup-011CUPXmdrJ9W72iAq21fi1D:copilot/add-security-scanning:CI Security"
  "3:claude/platform-electron-sandbox-perms-011CUPXmdrJ9W72iAq21fi1D:copilot/enable-electron-sandbox:Electron Sandbox"
  "4:claude/security-preload-secret-scrub-011CUPXmdrJ9W72iAq21fi1D:copilot/remove-api-key-exposure:Preload Secrets"
  "6:claude/voice-streaming-stt-011CUPXmdrJ9W72iAq21fi1D:copilot/add-websocket-streaming-stt:WebSocket STT"
  "7:claude/voice-streaming-tts-011CUPXmdrJ9W72iAq21fi1D:copilot/add-chunked-streaming-tts:Chunked TTS"
)

# Function to perform range-diff and display results
analyze_pair() {
  local pr_num=$1
  local claude_branch=$2
  local copilot_branch=$3
  local feature_name=$4

  echo ""
  echo "════════════════════════════════════════════════════════════════"
  echo "📊 Analyzing: $feature_name (PR #$pr_num)"
  echo "   Claude branch:  $claude_branch"
  echo "   Copilot branch: $copilot_branch"
  echo "════════════════════════════════════════════════════════════════"

  # Check if branches exist
  if ! git rev-parse --verify "origin/$claude_branch" >/dev/null 2>&1; then
    echo "   ⚠️  Claude branch not found: $claude_branch"
    return
  fi
  if ! git rev-parse --verify "origin/$copilot_branch" >/dev/null 2>&1; then
    echo "   ⚠️  Copilot branch not found: $copilot_branch"
    return
  fi

  # Get commit counts
  local claude_commits=$(git rev-list --count "origin/$copilot_branch..origin/$claude_branch" 2>/dev/null || echo "0")
  local copilot_commits=$(git rev-list --count "origin/$claude_branch..origin/$copilot_branch" 2>/dev/null || echo "0")

  echo "   📈 Commit comparison:"
  echo "      Claude has $claude_commits commits not in Copilot"
  echo "      Copilot has $copilot_commits commits not in Claude"

  if [[ "$claude_commits" -eq 0 ]]; then
    echo "   ✅ No unique commits in Claude branch - nothing to salvage"
    return
  fi

  echo ""
  echo "   🔍 Unique commits in Claude branch:"
  git log --oneline "origin/$copilot_branch..origin/$claude_branch" 2>/dev/null || echo "      (error reading commits)"

  echo ""
  echo "   📝 Performing range-diff analysis..."
  git range-diff "origin/$copilot_branch" "origin/$claude_branch" 2>/dev/null || echo "      (no common base for range-diff)"

  echo ""
  echo "   ❓ Decision needed:"
  echo "      - Review the commits above"
  echo "      - If any look valuable, note their SHA"
  echo "      - Use: git cherry-pick -x <SHA> to salvage them"
  echo ""
}

# Analyze all pairs
for pair in "${pairs[@]}"; do
  IFS=':' read -r pr_num claude_branch copilot_branch feature_name <<< "$pair"
  analyze_pair "$pr_num" "$claude_branch" "$copilot_branch" "$feature_name"
done

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "📋 Cherry-pick Instructions"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "To salvage specific commits:"
echo ""
echo "1. Choose a target branch (copilot branch to enhance)"
echo "   Example: copilot/add-websocket-streaming-stt"
echo ""
echo "2. Create salvage branch:"
echo "   git checkout -b salvage/stt-fixes origin/copilot/add-websocket-streaming-stt"
echo ""
echo "3. Cherry-pick valuable commits (use SHAs from analysis above):"
echo "   git cherry-pick -x <SHA1>"
echo "   git cherry-pick -x <SHA2>"
echo "   # etc."
echo ""
echo "4. Push and create PR:"
echo "   git push -u origin HEAD"
echo "   gh pr create --title \"Salvage: fixes from Claude PR onto Copilot branch\" \\"
echo "     --body \"Cherry-picked valuable fixes from failing Claude PR before closure.\""
echo ""
echo "5. After salvage PRs are merged, proceed to Phase 3 to close failing PRs"
echo ""
echo "════════════════════════════════════════════════════════════════"

# Create a summary file
SUMMARY_FILE="CHERRY_PICK_SUMMARY.md"
echo "📄 Creating summary file: $SUMMARY_FILE"

cat > "$SUMMARY_FILE" <<'SUMMARY'
# Cherry-pick Salvage Summary

This file documents commits salvaged from failing Claude PRs before closure.

## Branch Pairs Analyzed

| PR # | Claude Branch | Copilot Branch | Feature | Status |
|------|---------------|----------------|---------|--------|
| #2   | claude/ci-security-setup-011CUPXmdrJ9W72iAq21fi1D | copilot/add-security-scanning | CI Security | - |
| #3   | claude/platform-electron-sandbox-perms-011CUPXmdrJ9W72iAq21fi1D | copilot/enable-electron-sandbox | Electron Sandbox | - |
| #4   | claude/security-preload-secret-scrub-011CUPXmdrJ9W72iAq21fi1D | copilot/remove-api-key-exposure | Preload Secrets | - |
| #6   | claude/voice-streaming-stt-011CUPXmdrJ9W72iAq21fi1D | copilot/add-websocket-streaming-stt | WebSocket STT | - |
| #7   | claude/voice-streaming-tts-011CUPXmdrJ9W72iAq21fi1D | copilot/add-chunked-streaming-tts | Chunked TTS | - |

## Commits Salvaged

Document any cherry-picked commits here:

### Feature: [Name]
- **SHA:** `<commit-sha>`
- **Message:** [commit message]
- **Reason:** [why this commit was valuable]
- **Salvage PR:** #[PR number]

(Add more as needed)

## Notes

- Use `git range-diff` output from Phase 2 script to identify valuable commits
- Cherry-pick with `-x` flag to maintain attribution
- Create separate salvage PRs for each feature area
- Update this file as commits are salvaged
SUMMARY

echo "   ✅ Created: $SUMMARY_FILE"
echo ""
echo "✅ Phase 2 analysis complete!"
echo ""
echo "Next steps:"
echo "  1. Review the analysis output above"
echo "  2. Cherry-pick any valuable commits following the instructions"
echo "  3. After salvage is complete, run SETUP_PHASE_3_CLOSE_FAILING.sh"
