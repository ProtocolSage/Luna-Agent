#!/bin/bash
#
# PHASE 1½: Clean Recreation of PR #21 (CodeQL + Dependabot)
#
# PURPOSE: Create clean replacement for the conflicted PR #21
# EXECUTE FROM: ~/dev/Luna-Agent (WSL ext4, NOT /mnt/*)
# REQUIREMENTS: gh CLI authenticated, git configured, Phase 0 complete
# PREREQUISITE: PR #20 must be merged first
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

echo "🚀 Phase 1½: Creating clean CodeQL + Dependabot PR..."
echo "   Repository: $OWNER/$REPO"
echo "   Current directory: $PWD"
echo ""

# Check if PR #20 is merged
echo "🔍 Checking if PR #20 is merged..."
PR20_STATE=$(gh pr view 20 --json state,mergedAt --jq '.state' 2>/dev/null || echo "UNKNOWN")
if [[ "$PR20_STATE" != "MERGED" ]]; then
  echo "❌ ERROR: PR #20 must be merged first!"
  echo "   Current state: $PR20_STATE"
  echo "   Please merge PR #20 before running this script"
  exit 1
fi
echo "   ✅ PR #20 is merged"

# Ensure main is current
echo "📥 Fetching latest from origin..."
git fetch origin
git checkout main
git pull --ff-only

# If a merge is in progress from old #21 attempt, abort it
echo "🧹 Cleaning up any in-progress merges..."
git merge --abort 2>/dev/null && echo "   ℹ️  Aborted in-progress merge" || echo "   ✅ No merge in progress"
git rebase --abort 2>/dev/null && echo "   ℹ️  Aborted in-progress rebase" || echo "   ✅ No rebase in progress"

# Check if branch exists and delete if it does
CLEAN_BRANCH="ci/security-codeql-dependabot-clean"
if git show-ref --verify --quiet "refs/heads/$CLEAN_BRANCH"; then
  echo "🗑️  Deleting existing local branch: $CLEAN_BRANCH"
  git branch -D "$CLEAN_BRANCH"
fi

# Create clean branch
echo "🌿 Creating clean branch: $CLEAN_BRANCH"
git checkout -b "$CLEAN_BRANCH"

# --- 1. CodeQL Workflow ---
echo "📝 Creating CodeQL workflow..."
mkdir -p .github/workflows

cat > .github/workflows/codeql.yml <<'YML'
name: codeql
on:
  push:
    branches: [ "main" ]
  pull_request:
    branches: [ "main" ]
  schedule:
    - cron: '0 0 * * 1'  # Weekly on Monday
permissions:
  contents: read
  security-events: write
  actions: read
jobs:
  analyze:
    name: Analyze JavaScript/TypeScript
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Initialize CodeQL
        uses: github/codeql-action/init@v3
        with:
          languages: javascript
          queries: security-extended,security-and-quality

      - name: Perform CodeQL Analysis
        uses: github/codeql-action/analyze@v3
        with:
          category: "/language:javascript"
YML

echo "   ✅ Created: .github/workflows/codeql.yml"

# --- 2. Dependabot Configuration ---
echo "📝 Creating Dependabot configuration..."

cat > .github/dependabot.yml <<'YML'
version: 2
updates:
  # npm dependencies
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
      time: "07:00"
    # Group minor and patch updates to reduce PR spam
    groups:
      production-dependencies:
        applies-to: version-updates
        patterns:
          - "*"
        exclude-patterns:
          - "@types/*"
          - "*-dev"
          - "eslint*"
          - "prettier*"
        update-types:
          - "minor"
          - "patch"
      development-dependencies:
        applies-to: version-updates
        patterns:
          - "@types/*"
          - "*-dev"
          - "eslint*"
          - "prettier*"
          - "jest*"
          - "vitest*"
        update-types:
          - "minor"
          - "patch"
      security-updates:
        applies-to: security-updates
    # Limit number of open PRs
    open-pull-requests-limit: 10
    # Auto-label
    labels:
      - "dependencies"
      - "automated"
    # Ignore Electron major versions (breaking changes)
    ignore:
      - dependency-name: "electron"
        update-types: ["version-update:semver-major"]

  # GitHub Actions
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
      time: "07:00"
    groups:
      actions-updates:
        patterns:
          - "*"
        update-types:
          - "minor"
          - "patch"
    open-pull-requests-limit: 5
    labels:
      - "dependencies"
      - "github-actions"
YML

echo "   ✅ Created: .github/dependabot.yml"

# --- 3. Update package.json if format:check is missing ---
echo "📝 Checking package.json for format:check script..."
if ! grep -q '"format:check"' package.json 2>/dev/null; then
  echo "   ℹ️  Adding format:check script to package.json..."
  # This is a placeholder - actual implementation depends on your setup
  # You may need to manually add: "format:check": "prettier --check ."
  echo "   ⚠️  MANUAL ACTION REQUIRED: Add 'format:check' script to package.json"
else
  echo "   ✅ format:check script already exists"
fi

# Commit changes
echo "💾 Committing changes..."
git add .github/workflows/codeql.yml .github/dependabot.yml
git commit -m "ci(security): add CodeQL analysis and weekly grouped Dependabot"

# Push to remote
echo "📤 Pushing to origin..."
git push -u origin HEAD

# --- 4. Open Clean PR ---
echo "📬 Creating PR..."
gh pr create \
  --title "CI/Security: CodeQL + Dependabot (clean rebase of #21)" \
  --body "Reimplements #21 without conflicts on top of current main after PR #20 merge.

**Changes:**
- ✅ CodeQL static analysis (JavaScript/TypeScript)
  - Security-extended query suite
  - Runs on push to main, PRs, and weekly schedule
- ✅ Dependabot configuration
  - Weekly updates (Monday 7 AM)
  - Grouped updates to reduce PR spam
  - Separate groups for prod/dev dependencies
  - Ignores Electron major version bumps
  - Limits: 10 npm PRs, 5 actions PRs

**Supersedes:** #21 (had merge conflicts)

**Testing:**
- CodeQL analysis will run on this PR
- Dependabot will start monitoring after merge" \
  --base main

echo "   ✅ PR created"

# --- 5. Supersede old PR #21 ---
echo "🏷️  Marking old PR #21 as superseded..."

# Get the new PR number
NEW_PR=$(gh pr view --json number --jq '.number' 2>/dev/null || echo "")

if [[ -n "$NEW_PR" ]]; then
  gh pr comment 21 --body "Superseded by clean rebase #${NEW_PR}. Closing due to merge conflicts with main." 2>/dev/null || echo "   ℹ️  Could not comment on PR #21"
  gh pr edit 21 --add-label "superseded" 2>/dev/null || echo "   ℹ️  Could not label PR #21"
  gh pr close 21 --delete-branch 2>/dev/null || echo "   ℹ️  Could not close PR #21"
  echo "   ✅ Old PR #21 marked as superseded"
else
  echo "   ⚠️  Could not determine new PR number"
  echo "   Please manually supersede PR #21"
fi

echo ""
echo "✅ Phase 1½ complete!"
echo ""
if [[ -n "$NEW_PR" ]]; then
  echo "📋 New PR created: #${NEW_PR}"
  echo "   View: gh pr view $NEW_PR --web"
fi
echo ""
echo "Next steps:"
echo "  1. Review and merge the new CodeQL + Dependabot PR"
echo "  2. Run SETUP_PHASE_2_CHERRY_PICK.sh to salvage fixes from failing PRs"
