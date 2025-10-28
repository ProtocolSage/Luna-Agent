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
