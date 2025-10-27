#!/bin/bash
#
# PHASE 0: Infrastructure Setup (Duplicate Guard + CODEOWNERS + PR Template + Labels + Branch Protection)
# 
# PURPOSE: Create automation to prevent future duplicate PR chaos
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

echo "🚀 Phase 0: Setting up infrastructure..."
echo "   Repository: $OWNER/$REPO"
echo "   Current directory: $PWD"
echo ""

# Ensure we're on main and up-to-date
echo "📥 Fetching latest from origin..."
git fetch origin
git checkout main
git pull --ff-only

# Create new branch for infrastructure PR
INFRA_BRANCH="chore/ci-duplicate-guard-and-templates"
echo "🌿 Creating branch: $INFRA_BRANCH"
git checkout -b "$INFRA_BRANCH"

# --- 1. Duplicate PR Guard Workflow ---
echo "📝 Creating duplicate PR guard workflow..."
mkdir -p .github/workflows

cat > .github/workflows/duplicate-pr-guard.yml <<'YML'
name: duplicate-pr-guard
on:
  pull_request:
    types: [opened, edited, synchronize, reopened, ready_for_review]
permissions:
  contents: read
  pull-requests: write
  issues: write

jobs:
  detect-duplicates:
    runs-on: ubuntu-latest
    steps:
      - name: Label by agent (branch heuristic)
        uses: actions/github-script@v7
        with:
          script: |
            const pr = context.payload.pull_request;
            const ref = pr.head.ref.toLowerCase();
            const labels = [];
            if (ref.includes('claude')) labels.push('agent:claude');
            if (ref.includes('copilot')) labels.push('agent:copilot');
            if (labels.length) {
              await github.rest.issues.addLabels({
                owner: context.repo.owner, repo: context.repo.repo,
                issue_number: pr.number, labels
              }).catch(() => {});
            }

      - name: Detect potential duplicate PRs
        uses: actions/github-script@v7
        with:
          script: |
            const pr = context.payload.pull_request;
            const owner = context.repo.owner;
            const repo = context.repo.repo;

            const tokenize = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().split(/\s+/).filter(Boolean);
            const jaccard = (a, b) => { const A = new Set(a), B = new Set(b);
              const inter = [...A].filter(x => B.has(x)).length; const uni = new Set([...A, ...B]).size; return uni ? inter/uni : 0; };

            const thisTitleTokens = tokenize(pr.title);
            const thisFiles = await github.paginate(github.rest.pulls.listFiles, { owner, repo, pull_number: pr.number, per_page: 100 });
            const thisPaths = thisFiles.map(f => f.filename);

            const openPRs = await github.paginate(github.rest.pulls.list, { owner, repo, state: 'open', per_page: 100 });

            const suspects = [];
            for (const other of openPRs) {
              if (other.number === pr.number) continue;
              const otherTokens = tokenize(other.title);
              const titleScore = jaccard(thisTitleTokens, otherTokens);

              const otherFiles = await github.paginate(github.rest.pulls.listFiles, { owner, repo, pull_number: other.number, per_page: 100 });
              const otherPaths = otherFiles.map(f => f.filename);
              const pathScore = jaccard(thisPaths, otherPaths);

              if (pathScore >= 0.4 || (titleScore >= 0.5 && pathScore >= 0.2)) {
                suspects.push({ number: other.number, title: other.title, titleScore, pathScore });
              }
            }

            if (suspects.length) {
              await github.rest.issues.addLabels({
                owner, repo, issue_number: pr.number,
                labels: ['duplicate', 'needs triage']
              }).catch(() => {});

              const bullets = suspects.map(s => `- #${s.number} — "${s.title}" (title≈${s.titleScore.toFixed(2)}, paths≈${s.pathScore.toFixed(2)})`).join('\n');
              const body = [
                `Possible duplicate(s) detected based on title/path overlap:`, ``,
                bullets, ``,
                `> If superseded, close older PRs with a note like: "Superseded by #${pr.number}".`
              ].join('\n');

              await github.rest.issues.createComment({ owner, repo, issue_number: pr.number, body });
            }
YML

echo "   ✅ Created: .github/workflows/duplicate-pr-guard.yml"

# --- 2. CODEOWNERS File ---
echo "📝 Creating CODEOWNERS file..."
mkdir -p .github

cat > .github/CODEOWNERS <<'OWN'
# Critical security & infra
/.github/workflows/*            @ProtocolSage/devops
/security/*                     @ProtocolSage/security

# Electron core + preload
/electron-main/**               @ProtocolSage/electron @ProtocolSage/security
/app/electron/**                @ProtocolSage/electron @ProtocolSage/security
/app/preload/**                 @ProtocolSage/electron @ProtocolSage/security

# Voice pipeline
/voice/**                       @ProtocolSage/voice

# Agent/tooling
/agent/**                       @ProtocolSage/agents
/tools/**                       @ProtocolSage/agents

# Data & memory
/server/db/**                   @ProtocolSage/backend
/server/memory/**               @ProtocolSage/backend
OWN

echo "   ✅ Created: .github/CODEOWNERS"

# --- 3. PR Template ---
echo "📝 Creating PR template..."

cat > .github/pull_request_template.md <<'MD'
## Summary
- **Scope:** _What this PR changes (1–2 lines)._
- **Motivation:** _Why this matters (bug/security/perf/feature)._
- **Links:** _Issues, specs, tickets._

## Risks & Rollback
- **Risk level:** ☐ Low ☐ Medium ☐ High  
- **Rollback plan:** _How to revert safely if needed._

## Tests
- **Unit:** _Added/updated? Which files?_
- **Integration/Smoke:** _Steps or CI job names that validate behavior._
- **Security checks:** _Trivy/npm-audit/CodeQL clean?_

## Electron / Preload Security (checklist)
- [ ] `contextIsolation: true`
- [ ] `sandbox: true`
- [ ] `nodeIntegration: false`
- [ ] `@electron/remote` **not** used
- [ ] Preload exposes a **minimal, validated** API
- [ ] IPC requests **schema-validated** (zod/yup/io-ts) and tested

## CI Signals
- **Affects workflows?:** ☐ No ☐ Yes → which: ___
- **Large change (>500 LOC)?:** ☐ No ☐ Yes (justify scope control)

## Supersedes / Related PRs
- _Optional:_ "Supersedes #___" or "Related to #___"

## Screenshots / Logs
_(optional)_
MD

echo "   ✅ Created: .github/pull_request_template.md"

# Commit and push
echo "💾 Committing files..."
git add .github
git commit -m "chore(ci): duplicate PR guard action, CODEOWNERS, PR template"

echo "📤 Pushing to origin..."
git push -u origin HEAD

# --- 4. Create Labels (idempotent) ---
echo "🏷️  Creating labels..."

make_label() {
  local name=$1 color=$2 desc=$3
  gh label create "$name" --color "$color" --description "$desc" 2>/dev/null && echo "   ✅ Created: $name" || echo "   ℹ️  Already exists: $name"
}

make_label "duplicate"      "B60205" "Potential duplicate PR"
make_label "needs triage"   "D93F0B" "Requires maintainer triage"
make_label "agent:claude"   "5319E7" "Authored by Claude branch"
make_label "agent:copilot"  "0E8A16" "Authored by Copilot branch"
make_label "superseded"     "6A737D" "Replaced by a newer PR"

# --- 5. Open Infrastructure PR ---
echo "📬 Creating PR..."
gh pr create \
  --title "CI: duplicate PR guard + CODEOWNERS + PR template" \
  --body "Adds an auto-flag for duplicate PRs, introduces CODEOWNERS for security-critical paths, and a tighter PR template with Electron security checklist." \
  || echo "   ⚠️  PR creation failed (may already exist)"

# --- 6. Deprecate master branch ---
echo "🔒 Deprecating master branch..."
git fetch origin

# Use worktree to safely edit master without disrupting current work
if git worktree list | grep -q "Luna-Agent-master"; then
  echo "   ℹ️  Worktree already exists, removing first..."
  git worktree remove ../Luna-Agent-master --force 2>/dev/null || true
fi

git worktree add ../Luna-Agent-master origin/master 2>/dev/null || echo "   ⚠️  Could not create worktree for master"

if [ -d ../Luna-Agent-master ]; then
  pushd ../Luna-Agent-master > /dev/null

  cat > README.md <<'TXT'
# ⚠️ Deprecated Branch: `master`

This branch is deprecated. Use **`main`** for all work.

- Default branch: `main`
- PRs to `master` will be closed.
TXT

  git add README.md
  git commit -m "docs: deprecate master branch (use main)"
  git push origin HEAD || echo "   ⚠️  Could not push to master"
  
  popd > /dev/null
  git worktree remove ../Luna-Agent-master
  echo "   ✅ Master branch deprecated"
else
  echo "   ⚠️  Could not access master branch"
fi

# --- 7. Set default branch to main ---
echo "🔀 Setting default branch to main..."
gh api -X PATCH repos/$OWNER/$REPO -f default_branch=main >/dev/null 2>&1 && echo "   ✅ Default branch set to main" || echo "   ℹ️  Already set or insufficient permissions"

# --- 8. Protect main branch ---
echo "🛡️  Protecting main branch..."

gh api \
  -X PUT \
  repos/$OWNER/$REPO/branches/main/protection \
  -H "Accept: application/vnd.github+json" \
  --input - <<'JSON' 2>/dev/null && echo "   ✅ Branch protection enabled" || echo "   ⚠️  Could not set protection (may need admin rights)"
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["ci", "voice-smoke", "trivy", "codeql"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": true,
    "required_approving_review_count": 1
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_linear_history": true
}
JSON

echo ""
echo "✅ Phase 0 complete!"
echo ""
echo "Next steps:"
echo "  1. Review the PR that was created"
echo "  2. Merge the PR once approved"
echo "  3. Run SETUP_PHASE_1_PR21_CLEAN.sh"
