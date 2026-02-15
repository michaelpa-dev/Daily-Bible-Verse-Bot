# Description Gap Audit (Contract Check)

Date: 2026-02-15

This document treats the public bot description (and repo docs) as a contract and checks whether
the repo implementation matches the claims.

Scope of audit:
- Repo code (slash command modules, services, DB schema)
- GitHub Actions workflows + deploy scripts
- Slash command registration strategy (how commands are registered with Discord)

Out of scope / limitations:
- This audit does not include live Discord UI screenshots. Evidence is based on command
  definitions and registration logic in code.

## Promise Status Table

Legend:
- Status: Implemented / Partial / Missing / Broken
- Severity: P0 (user-facing broken), P1 (missing promise / high-impact mismatch), P2 (docs mismatch / low impact)
- Complexity: S / M / L (rough estimate for gap closure)

| Promised Item | Status | Evidence (Paths) | Severity | Notes / Recommended Fix | Complexity |
| --- | --- | --- | --- | --- | --- |
| Daily verse subscriptions (DM) | Implemented | `js/commands/subscribe.js`, `js/commands/unsubscribe.js`, `js/bot.js` (cron + delivery), `js/verseSender.js`, `js/db/subscribeDB.js`, `js/db/database.js` | P2 | Works as: user subscribes via slash command, bot DMs daily at 09:00 America/New_York. Improvement: detect DM failures at subscribe-time and warn user. | S |
| Random verse on demand | Implemented | `js/commands/randomVerse.js`, `js/verseSender.js`, `js/services/bibleApi.js` | P2 | Works as: user runs `/randomverse` in a guild, bot replies ephemerally and DMs the verse. | S |
| `/passage` with robust parsing + pagination (channel or DM) | Implemented | `js/commands/passage.js`, `js/services/scriptureReference.js`, `js/services/pagination.js`, `js/services/paginationInteractions.js`, `test/scriptureReference.test.js`, `test/paginationInteractions.test.js` | P2 | Parsing supports ranges + discontiguous verse lists; pagination uses buttons and does not split mid-verse. Note: the command supports DM mode even though invocation is via guild slash command registration. | S |
| `/read` DM reader mode with navigation controls | Implemented | `js/commands/read.js`, `js/services/readSessions.js`, `js/constants/bookGroups.js`, `js/constants/webVerseCounts.js`, `test/readSessionsPaging.test.js` | P2 | DM session includes Prev/Next page, Prev/Next chapter (cross-book), Change book (group + book menu), Jump modal, Close. Pages are cached per session to avoid refetching on button clicks. | S |
| Reading plans persisted to SQLite and scheduled in-process (`/plan ...`) | Partial | `js/commands/plan.js`, `js/services/planScheduler.js`, `js/services/planEngine.js`, `js/db/planDB.js`, `js/db/database.js`, `docs/reading-plans.md` | P1 | Guild plans are implemented and scheduled in-process. However, docs claim `/plan` can be started in DMs to create a per-user DM plan, but slash commands are registered per-guild only (`js/bot.js` uses `guild.commands.set(...)`), so DM invocation is not available. Fix options: (1) register commands globally (and restrict dev-only commands by guild), or (2) add a `/plan start` option to create a per-user plan even when invoked in a guild, or (3) adjust docs to remove DM plan claims. | M |
| Per-user translation preferences (`/settranslation`) | Implemented | `js/commands/settranslation.js`, `js/db/subscribeDB.js`, `js/constants/translations.js`, `js/commands/randomVerse.js`, `js/commands/subscribe.js` | P2 | Translation preferences apply to daily/random verse DMs. `/passage` and `/read` are explicitly WEB-only and do not use per-user translations (docs already call this out). | S |
| Ops commands: `/health`, `/version`, `/release-notes`, `/bootstrap-dev-server` | Implemented | `js/commands/health.js`, `js/commands/version.js`, `js/commands/releaseNotes.js`, `js/commands/bootstrapDevServer.js`, `js/services/permissionUtils.js` | P2 | Ops commands are implemented with owner/Maintainer gating. Note: commands are registered in all guilds; gating happens at runtime (command may be visible but denied). | S |
| Structured bot error logging to `#bot-logs` | Implemented | `js/services/devBotLogs.js`, `js/services/botOps.js`, `js/bot.js` (command start/end + interactions + jobs), `docs/observability.md` | P2 | Always-on in canary + production (default) with batching + circuit breaker. Logs are also emitted as structured JSON to stdout/stderr. | S |
| Automated deployments using GitHub Releases + AWS SSM (no SSH required) | Partial | `.github/workflows/build.yml`, `.github/workflows/deploy-canary.yml`, `.github/workflows/auto-tag-release.yml`, `.github/workflows/deploy-prod.yml`, `scripts/deploy/ssm-deploy.sh`, `docs/deployments/runbook.md`, `docs/release-process.md`, `infra/cloudformation/deploy-foundation.yml` | P1 | The deployment path is SSM-based and release-asset-driven, but deploy workflows currently pass a short-lived signed GitHub asset URL to EC2. If the SSM command is delayed (Pending/InProgress long enough), that signed URL can expire and cause intermittent 403s. Recommended: add a fallback strategy (runner download + SSM transfer for small assets, or token-based GitHub API download in-instance without persisting token). | M |
| Minimal permissions guidance | Implemented | `readme.md`, `docs/discord-dev-server.md`, `js/services/bootstrapDevServer.js` (pinning/templates) | P2 | README provides an explicit minimal permission set. Suggest improvement: split "core bot permissions" vs "dev bootstrap permissions" to avoid over-granting in non-dev servers. | S |

## Command Registration Reality Check

Commands are registered per guild at runtime:
- `js/bot.js` loads all modules in `js/commands/*.js`
- On startup and on guild join, it runs `guild.commands.set(commandPayload)`

Implications:
- Guild slash commands appear quickly in guilds the bot is installed in.
- Slash commands are not registered globally, so they are not available in DMs. Any docs claiming
  "run this slash command in DMs" are likely inaccurate unless global registration is added.

## Gaps Needing Follow-up

P0 gaps found: none

P1 gaps found:
- Reading plan DM start (docs claim DM user plans, but DM slash invocation is not available with current registration strategy)
- Deploy reliability risk: signed GitHub asset URLs can expire before EC2 downloads if SSM is delayed

Issues created for P1 gaps:
- #37 Reading plans: docs claim DM user plans but slash commands are guild-only (user plans unreachable)
- #38 CI/CD: avoid signed GitHub asset URL expiry during SSM deploys (intermittent 403 risk)

## Suggested Gap Closure Order

1. Decide whether DM slash commands are a goal:
   - If yes: implement global command registration plus dev-only command scoping.
   - If no: update docs to remove DM plan start claims and adjust UX to guide guild-only usage.
2. Improve deploy artifact transfer to eliminate the signed-URL expiration failure mode.
