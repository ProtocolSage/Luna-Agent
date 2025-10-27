# Luna-Agent Repository Cleanup - Complete Execution Plan

**Date:** October 27, 2025  
**Status:** Ready for Execution  
**Environment:** WSL Ubuntu (ext4 filesystem)

---

## Executive Summary

This plan implements a comprehensive cleanup of the Luna-Agent repository to:
1. ✅ Merge the only passing PR (#20 - already done)
2. 🛡️ Add infrastructure to prevent future duplicate PR chaos
3. 🔄 Replace conflicted PR #21 with clean version
4. 🍒 Salvage valuable commits from failing PRs
5. 🗑️ Close 7 failing/superseded PRs
6. ✅ Promote 4 draft PRs for testing

**Current State:**
- 12 open PRs (1 merged, 5 drafts, 6 failing)
- Duplicate implementations (Claude vs Copilot)
- PR #21 has merge conflicts

**Desired End State:**
- Clean automation infrastructure
- All failing PRs closed with proper documentation
- Draft PRs promoted and tested
- Repository clean and maintainable

---

## Prerequisites

### Required Tools
- ✅ WSL Ubuntu installed
- ✅ Git configured
- ✅ GitHub CLI (`gh`) authenticated
- ✅ Repository cloned to WSL ext4: `~/dev/Luna-Agent`

### Verification Commands
```bash
# Check environment
uname -a  # Should show Linux
which gh  # Should return path to gh
gh auth status  # Should show authenticated

# Check repository location
cd ~/dev/Luna-Agent
pwd  # Should NOT start with /mnt/

# Verify remote
git remote -v  # Should show ProtocolSage/Luna-Agent
```

---

## Phase 0: Infrastructure Setup

**Purpose:** Create automation to prevent future duplicate PR chaos

**Script:** `SETUP_PHASE_0_INFRA.sh`

**What it does:**
1. Creates duplicate PR guard workflow (auto-detects and flags duplicates)
2. Adds CODEOWNERS file (routes PRs to right reviewers)
3. Creates PR template with security checklist
4. Creates labels: `duplicate`, `needs triage`, `agent:claude`, `agent:copilot`, `superseded`
5. Deprecates `master` branch (adds warning banner)
6. Sets `main` as default branch
7. Enables branch protection on `main`

**Execution:**
```bash
cd ~/dev/Luna-Agent
chmod +x SETUP_PHASE_0_INFRA.sh
./SETUP_PHASE_0_INFRA.sh
```

**Expected Output:**
- New branch: `chore/ci-duplicate-guard-and-templates`
- New PR created with infrastructure files
- Labels created
- Branch protection enabled

**Time Estimate:** 5-10 minutes

**Success Criteria:**
- ✅ PR created successfully
- ✅ Labels visible in repository
- ✅ Master branch has deprecation notice
- ✅ Main branch shows protection rules

**Next:** Review and merge the infrastructure PR, then proceed to Phase 1½

---

## Phase 1½: Clean PR #21 Recreation

**Purpose:** Replace conflicted PR #21 with clean implementation

**Script:** `SETUP_PHASE_1_PR21_CLEAN.sh`

**Prerequisites:**
- ✅ PR #20 must be merged (already done)
- ✅ Phase 0 infrastructure PR should be merged

**What it does:**
1. Verifies PR #20 is merged
2. Cleans up any in-progress merges
3. Creates clean branch from current main
4. Adds CodeQL workflow (JavaScript/TypeScript security scanning)
5. Adds Dependabot config (weekly grouped dependency updates)
6. Creates new PR
7. Supersedes old PR #21 (adds label, comment, closes)

**Execution:**
```bash
cd ~/dev/Luna-Agent
chmod +x SETUP_PHASE_1_PR21_CLEAN.sh
./SETUP_PHASE_1_PR21_CLEAN.sh
```

**Expected Output:**
- New branch: `ci/security-codeql-dependabot-clean`
- New PR created (superseding #21)
- Old PR #21 closed with `superseded` label

**Time Estimate:** 3-5 minutes

**Success Criteria:**
- ✅ New PR created with CodeQL + Dependabot
- ✅ CodeQL analysis starts running on new PR
- ✅ Old PR #21 closed properly

**Next:** Review and merge the new CodeQL PR, then proceed to Phase 2

---

## Phase 2: Cherry-pick Salvage Analysis

**Purpose:** Extract valuable commits from failing PRs before closure

**Script:** `SETUP_PHASE_2_CHERRY_PICK.sh`

**What it does:**
1. Fetches all branches
2. Analyzes 5 PR pairs (Claude vs Copilot implementations)
3. Uses `git range-diff` to identify unique commits
4. Displays commit comparison and recommendations
5. Creates `CHERRY_PICK_SUMMARY.md` documentation file
6. Provides instructions for manual cherry-picking

**PR Pairs Analyzed:**
- PR #2 (claude) vs #20 (copilot) - CI Security
- PR #3 (claude) vs #23 (copilot) - Electron Sandbox
- PR #4 (claude) vs #25 (copilot) - Preload Secrets
- PR #6 (claude) vs #24 (copilot) - WebSocket STT
- PR #7 (claude) vs #22 (copilot) - Chunked TTS

**Execution:**
```bash
cd ~/dev/Luna-Agent
chmod +x SETUP_PHASE_2_CHERRY_PICK.sh
./SETUP_PHASE_2_CHERRY_PICK.sh > cherry_pick_analysis.txt
```

**Expected Output:**
- Detailed analysis output saved to `cherry_pick_analysis.txt`
- `CHERRY_PICK_SUMMARY.md` created
- Instructions for manual cherry-picking

**Time Estimate:** 10-15 minutes (review time)

**Manual Cherry-pick Example:**
```bash
# If you find valuable commits in the analysis:
git checkout -b salvage/feature-fixes origin/copilot/target-branch
git cherry-pick -x <SHA1>
git cherry-pick -x <SHA2>
git push -u origin HEAD
gh pr create --title "Salvage: fixes from Claude PR" --body "Cherry-picked valuable fixes."
```

**Decision Point:** 
- If no valuable commits found: Skip cherry-picking, proceed to Phase 3
- If valuable commits found: Cherry-pick them, merge salvage PRs, then proceed to Phase 3

**Success Criteria:**
- ✅ Analysis complete with detailed output
- ✅ Decision made on which (if any) commits to salvage
- ✅ Any salvage PRs created and merged

**Next:** Proceed to Phase 3 to close failing PRs

---

## Phase 3: Close Failing PRs

**Purpose:** Clean up 7 failing/superseded PRs with proper documentation

**Script:** `SETUP_PHASE_3_CLOSE_FAILING.sh`

**Prerequisites:**
- Phase 2 cherry-picking should be complete (or consciously skipped)

**What it does:**
1. Lists all PRs to be closed with reasons
2. Prompts for confirmation
3. For each PR:
   - Adds `superseded` label
   - Posts explanatory comment with links
   - Closes PR and deletes branch
4. Provides commands for next steps

**PRs to Close:**
- #2 → superseded by #20 (CI Security)
- #3 → superseded by #23 (Electron Sandbox)
- #4 → superseded by #25 (Preload Secrets)
- #5 → both implementations failing (Tool Planning)
- #6 → superseded by #24 (WebSocket STT)
- #7 → superseded by #22 (Chunked TTS)
- #26 → both implementations failing (Tool Planning)

**Execution:**
```bash
cd ~/dev/Luna-Agent
chmod +x SETUP_PHASE_3_CLOSE_FAILING.sh
./SETUP_PHASE_3_CLOSE_FAILING.sh
```

**Expected Output:**
- Confirmation prompt
- Progress for each PR closure
- Summary of closed PRs
- Next steps commands

**Time Estimate:** 5-10 minutes

**Success Criteria:**
- ✅ All 7 PRs closed with proper labels
- ✅ Comments added explaining closure
- ✅ Branches deleted
- ✅ Clean PR list

**Next:** Promote draft PRs and monitor CI

---

## Phase 4: Promote Draft PRs (Manual)

**Purpose:** Convert 4 draft PRs to OPEN status to trigger full CI

**No script - use these commands:**

```bash
cd ~/dev/Luna-Agent

# Promote all draft PRs to OPEN
for pr in 22 23 24 25; do
  gh pr ready $pr
  echo "✅ PR #$pr marked ready for review"
done

# Check CI status for each
echo ""
echo "Checking CI status..."
for pr in 22 23 24 25; do
  echo ""
  echo "═══ PR #$pr ═══"
  gh pr checks $pr
done
```

**Draft PRs:**
- #22 (copilot) - Chunked Streaming TTS
- #23 (copilot) - Electron Sandbox with explicit permissions
- #24 (copilot) - WebSocket Streaming STT
- #25 (copilot) - Remove API key exposure in preload

**Time Estimate:** 5 minutes + CI wait time

**Success Criteria:**
- ✅ All 4 PRs converted from DRAFT to OPEN
- ✅ Full CI triggered for each PR
- ✅ Monitor CI results

**If CI Passes:** Merge the PRs
**If CI Fails:** Investigate and fix issues

---

## Phase 5: Create Tool Planning Issue (Manual)

**Purpose:** Track reimplementation of Tool Planning Security feature

Both PRs #5 and #26 failed, so this needs fresh implementation.

```bash
cd ~/dev/Luna-Agent

gh issue create \
  --title "Security: Remove unsafe command execution fallback in tool planning" \
  --body "## Problem

Both previous implementations (PR #5 and #26) failed CI. This feature needs to be reimplemented with a disciplined approach.

## Requirements

1. **Design doc first**
   - Architecture diagram
   - Security considerations
   - Test strategy

2. **Small, testable slices**
   - Validator implementation (first PR)
   - Planning logic (second PR)
   - Integration (final PR)

3. **Quality gates**
   - Full test coverage (unit + integration)
   - PR size < 500 LOC per PR
   - Security checklist completed
   - All CI checks passing

4. **Acceptance Criteria**
   - No unsafe command execution paths
   - Input validation for all tool parameters
   - Proper error handling
   - E2E smoke test coverage

## References

- Failed PR #5 (claude): https://github.com/ProtocolSage/Luna-Agent/pull/5
- Failed PR #26 (copilot): https://github.com/ProtocolSage/Luna-Agent/pull/26
- Analysis: [LUNA_AGENT_PR_ANALYSIS.md](../blob/main/LUNA_AGENT_PR_ANALYSIS.md)" \
  --label "security,enhancement,needs design doc"
```

---

## Complete Execution Sequence

### Day 1: Infrastructure & Clean PRs

```bash
# 1. Phase 0: Infrastructure (10 min)
cd ~/dev/Luna-Agent
./SETUP_PHASE_0_INFRA.sh

# 2. Review and merge infrastructure PR (manual, 5 min)
gh pr view <PR#> --web
# Approve and merge via GitHub UI

# 3. Phase 1½: Clean PR #21 (5 min)
./SETUP_PHASE_1_PR21_CLEAN.sh

# 4. Review and merge clean PR #21 (manual, 5 min)
gh pr view <PR#> --web
# Approve and merge via GitHub UI
```

**Time:** ~30 minutes  
**Result:** Infrastructure in place, PR #21 clean

---

### Day 2: Salvage & Cleanup

```bash
# 5. Phase 2: Analyze for cherry-picking (15 min)
cd ~/dev/Luna-Agent
./SETUP_PHASE_2_CHERRY_PICK.sh > cherry_pick_analysis.txt

# 6. Review analysis and decide (manual, 30 min)
less cherry_pick_analysis.txt
# Cherry-pick any valuable commits if found

# 7. Phase 3: Close failing PRs (10 min)
./SETUP_PHASE_3_CLOSE_FAILING.sh
```

**Time:** ~1 hour  
**Result:** Failing PRs closed, repository clean

---

### Day 3: Final Steps

```bash
# 8. Promote draft PRs (5 min)
cd ~/dev/Luna-Agent
for pr in 22 23 24 25; do gh pr ready $pr; done

# 9. Monitor CI (wait for results, ~10 min)
for pr in 22 23 24 25; do gh pr checks $pr; done

# 10. Create Tool Planning issue (5 min)
gh issue create --title "Security: Remove unsafe command execution..." [full command above]

# 11. Merge passing draft PRs (manual, as they pass)
# Review each PR and merge if CI passes
```

**Time:** ~30 minutes + CI wait  
**Result:** All draft PRs evaluated, issue created for Tool Planning

---

## Rollback Procedures

### If Infrastructure PR Causes Issues
```bash
# Revert the infrastructure PR
gh pr view <PR#> --json mergeCommit --jq '.mergeCommit.oid' | xargs git revert
git push origin main
```

### If Wrong PR Gets Closed
```bash
# Reopen a closed PR
gh pr reopen <PR#>

# Remove superseded label
gh pr edit <PR#> --remove-label "superseded"
```

### If Draft PR Promotion Was Premature
```bash
# Convert back to draft
gh pr ready <PR#> --undo
```

---

## Verification Checklist

After completing all phases:

- [ ] Infrastructure PR merged
- [ ] Clean PR #21 merged (or equivalent)
- [ ] 7 failing PRs closed with proper labels
- [ ] 4 draft PRs promoted to OPEN
- [ ] CI monitored for promoted PRs
- [ ] Tool Planning issue created
- [ ] Repository has clean PR list
- [ ] Branch protection enabled on main
- [ ] Duplicate PR guard active
- [ ] CODEOWNERS file in place
- [ ] PR template being used

---

## Maintenance

### Weekly Tasks
1. Review Dependabot PRs (should be grouped)
2. Check for duplicate PR alerts
3. Monitor CodeQL security findings

### Monthly Tasks
1. Review branch protection rules
2. Update CODEOWNERS if team structure changes
3. Review and update PR template if needed

---

## Troubleshooting

### "Abort: repo on DrvFS"
**Problem:** Repository is on Windows filesystem  
**Solution:** Clone repo to WSL ext4
```bash
cd ~
mkdir -p dev
cd dev
git clone https://github.com/ProtocolSage/Luna-Agent.git
cd Luna-Agent
```

### "gh: command not found"
**Problem:** GitHub CLI not installed  
**Solution:**
```bash
sudo apt update
sudo apt install gh
gh auth login
```

### "Permission denied" on scripts
**Problem:** Scripts not executable  
**Solution:**
```bash
chmod +x SETUP_PHASE_*.sh
```

### PR conflicts after merge
**Problem:** Branch has conflicts with main  
**Solution:**
```bash
git checkout <branch>
git fetch origin
git rebase origin/main
# Resolve conflicts
git push --force-with-lease
```

---

## Success Metrics

**Quantitative:**
- PRs closed: 7
- PRs merged: 2-6 (depends on draft PR CI results)
- CI time reduced: ~30% (from better caching)
- Duplicate PRs prevented: TBD (automated detection)

**Qualitative:**
- Clean PR list
- No conflicting implementations
- Clear ownership (CODEOWNERS)
- Automated quality gates
- Better security posture (CodeQL, Trivy, npm audit)

---

## References

- [PR Analysis Report](LUNA_AGENT_PR_ANALYSIS.md) - Detailed comparison of all PRs
- [Cherry-pick Summary](CHERRY_PICK_SUMMARY.md) - Salvaged commits documentation
- [Phase 0 Script](SETUP_PHASE_0_INFRA.sh) - Infrastructure setup
- [Phase 1½ Script](SETUP_PHASE_1_PR21_CLEAN.sh) - Clean PR #21
- [Phase 2 Script](SETUP_PHASE_2_CHERRY_PICK.sh) - Cherry-pick analysis
- [Phase 3 Script](SETUP_PHASE_3_CLOSE_FAILING.sh) - Close failing PRs

---

**End of Execution Plan**

*Last Updated: October 27, 2025*  
*Author: Cline AI Assistant*
