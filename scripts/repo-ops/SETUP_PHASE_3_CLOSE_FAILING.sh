#!/bin/bash
#
# PHASE 3: Close Failing/Superseded PRs
#
# PURPOSE: Clean up failing Claude PRs and failing Tool Planning PR
# EXECUTE FROM: ~/dev/Luna-Agent (WSL ext4, NOT /mnt/*)
# REQUIREMENTS: gh CLI authenticated, git configured
# PREREQUISITE: Phase 2 cherry-picking should be complete (or consciously skipped)
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

echo "🚀 Phase 3: Closing failing/superseded PRs..."
echo "   Repository: $OWNER/$REPO"
echo "   Current directory: $PWD"
echo ""

# PRs to close
# Format: "PR#:reason:superseded-by"
declare -a close_list=(
  "2:Failing CI, superseded by cleaner implementation:#20"
  "3:Failing CI, superseded by cleaner implementation:#23"
  "4:Failing CI, superseded by cleaner implementation:#25"
  "5:Failing CI, both implementations failing:none"
  "6:Failing CI, superseded by cleaner implementation:#24"
  "7:Failing CI, superseded by cleaner implementation:#22"
  "26:Failing CI, both implementations failing:none"
)

echo "📋 PRs to close:"
for item in "${close_list[@]}"; do
  IFS=':' read -r pr_num reason superseded_by <<< "$item"
  echo "   • PR #$pr_num: $reason"
done
echo ""

# Confirmation prompt
read -p "❓ Proceed with closing these PRs? (y/N): " confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
  echo "❌ Aborted by user"
  exit 0
fi

# Function to close a single PR
close_pr() {
  local pr_num=$1
  local reason=$2
  local superseded_by=$3

  echo ""
  echo "════════════════════════════════════════════════════════════════"
  echo "🔒 Closing PR #$pr_num"
  echo "   Reason: $reason"
  if [[ "$superseded_by" != "none" ]]; then
    echo "   Superseded by: $superseded_by"
  fi
  echo "════════════════════════════════════════════════════════════════"

  # Check if PR exists and is open
  local pr_state=$(gh pr view "$pr_num" --json state --jq '.state' 2>/dev/null || echo "NOT_FOUND")
  
  if [[ "$pr_state" == "NOT_FOUND" ]]; then
    echo "   ⚠️  PR #$pr_num not found, skipping..."
    return
  fi

  if [[ "$pr_state" != "OPEN" ]]; then
    echo "   ℹ️  PR #$pr_num is already $pr_state, skipping..."
    return
  fi

  # Add superseded label
  echo "   🏷️  Adding 'superseded' label..."
  gh pr edit "$pr_num" --add-label "superseded" 2>/dev/null && echo "      ✅ Label added" || echo "      ⚠️  Could not add label"

  # Add comment
  echo "   💬 Adding closure comment..."
  local comment_body
  if [[ "$superseded_by" != "none" ]]; then
    comment_body="Closing this PR.

**Reason:** $reason

**Superseded by:** $superseded_by

See [PR Analysis Report](../blob/main/LUNA_AGENT_PR_ANALYSIS.md) for detailed comparison and rationale."
  else
    comment_body="Closing this PR.

**Reason:** $reason

This feature needs to be reimplemented with a fresh approach. A new issue will be created to track the work.

See [PR Analysis Report](../blob/main/LUNA_AGENT_PR_ANALYSIS.md) for details."
  fi

  gh pr comment "$pr_num" --body "$comment_body" 2>/dev/null && echo "      ✅ Comment added" || echo "      ⚠️  Could not add comment"

  # Close PR and delete branch
  echo "   🗑️  Closing PR and deleting branch..."
  if gh pr close "$pr_num" --delete-branch 2>/dev/null; then
    echo "      ✅ PR #$pr_num closed successfully"
  else
    echo "      ⚠️  Could not close PR #$pr_num (may need manual intervention)"
  fi
}

# Close each PR
for item in "${close_list[@]}"; do
  IFS=':' read -r pr_num reason superseded_by <<< "$item"
  close_pr "$pr_num" "$reason" "$superseded_by"
  sleep 2  # Rate limiting courtesy
done

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "✅ Phase 3 complete!"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "📊 Summary:"
echo "   • Closed failing Claude PRs: #2, #3, #4, #6, #7"
echo "   • Closed failing Tool Planning PRs: #5, #26"
echo ""
echo "Next steps:"
echo "  1. Verify PRs are closed: gh pr list --state closed"
echo "  2. Promote draft PRs (#22, #23, #24, #25) from DRAFT to OPEN"
echo "  3. Monitor CI for draft PRs"
echo "  4. Create new issue for Tool Planning Security feature"
echo ""
echo "Commands for next steps:"
echo ""
echo "# Promote draft PRs to OPEN (triggers full CI)"
echo "for pr in 22 23 24 25; do"
echo "  gh pr ready \$pr"
echo "  echo \"PR #\$pr marked ready for review\""
echo "done"
echo ""
echo "# Check CI status"
echo "for pr in 22 23 24 25; do"
echo "  echo \"PR #\$pr:\""
echo "  gh pr checks \$pr"
echo "  echo \"\""
echo "done"
echo ""
echo "# Create issue for Tool Planning Security"
echo "gh issue create \\"
echo "  --title \"Security: Remove unsafe command execution fallback in tool planning\" \\"
echo "  --body \"Both previous implementations (#5 and #26) failed CI. Need fresh approach with:"
echo "- Design doc first"
echo "- Small, testable slices"
echo "- Full test coverage"
echo "- PR size <500 LOC\""
