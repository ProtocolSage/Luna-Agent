# Migration Guide: MoltBot → OpenClaw

This document records the final migration command and process for transitioning from MoltBot to OpenClaw within the Luna Agent ecosystem.

---

## Background

**MoltBot** was the original internal bot identity / orchestration layer used during early development. **OpenClaw** is the successor agent framework that Luna Agent now targets for tool execution, model routing, and pipeline orchestration.

The migration touches:
- Agent identity and prompt references
- Tool registration namespace
- Pipeline configuration
- Environment variable prefixes

---

## Final Migration Command

```bash
# The final migration command from MoltBot to OpenClaw:
npx ts-node scripts/migrate.ts --direction up --target openclaw
```

This runs all pending migrations through `scripts/migrate.ts`, applying the schema and configuration changes needed to complete the OpenClaw transition.

### What the migration does

1. **Schema update** — applies `migrations/001_initial_schema.sql` (and any subsequent migration files) via the `MigrationManager` in `scripts/migrate.ts`
2. **Config namespace** — any `MOLTBOT_*` environment variables are read and mapped to their `OPENCLAW_*` / standard equivalents
3. **Agent identity** — system prompts and tool namespaces reference the OpenClaw identity

### Rollback

```bash
# Roll back the most recent migration:
npx ts-node scripts/migrate.ts --direction down --steps 1
```

---

## Environment Variable Mapping

| MoltBot (legacy) | OpenClaw / Luna (current) | Notes |
|---|---|---|
| `MOLTBOT_API_KEY` | `OPENAI_API_KEY` | Standard OpenAI key |
| `MOLTBOT_MODEL` | Model set in `modelRouter.ts` | Now multi-model with circuit breaker |
| `MOLTBOT_DB_PATH` | SQLite in `memory/` directory | better-sqlite3 or in-memory fallback |
| `MOLTBOT_PORT` | `PORT` (default 3001) | Unified port config |

---

## Verification Steps

After running the migration:

```bash
# 1. Build to compile any schema changes
npm run build

# 2. Run tests to verify nothing broke
LUNA_DISABLE_EMBEDDINGS=1 npm test

# 3. Start the server and check health
node dist/backend/server.js &
curl http://localhost:3001/health

# 4. Verify migration status
npx ts-node scripts/migrate.ts --status
```

---

## Quick Reference

| Action | Command |
|--------|---------|
| **Run migration (up)** | `npx ts-node scripts/migrate.ts --direction up --target openclaw` |
| **Rollback** | `npx ts-node scripts/migrate.ts --direction down --steps 1` |
| **Check status** | `npx ts-node scripts/migrate.ts --status` |
| **Full rebuild after migration** | `npm run build && npm test` |

---

*This is the canonical reference for the MoltBot → OpenClaw migration. If you need to re-run the migration on a fresh install, the command above is all that is needed.*
