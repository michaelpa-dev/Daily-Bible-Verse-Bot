# Bug Sweep Audit (PR: audit/bug-sweep)

Date: 2026-02-14

This document records the scope, findings, fixes, and verification steps for a full-repo bug and
stability audit. It is not a claim of “no bugs”; it is a best-effort hardening pass with automated
guards to prevent regressions.

## Phase 0: Repo Understanding

### Runtime / language
- Node.js (CommonJS) Discord bot using `discord.js`
- Logging via `log4js`
- Persistence via SQLite using `node:sqlite` (Node experimental API)
- Lightweight HTTP server via `node:http` (health + random verse endpoints)
- Deployments to EC2 via Docker + Docker Compose, orchestrated by AWS SSM RunCommand
- GitHub Releases are the artifact source for both canary and production

### Entry points and key modules
- Entrypoint: `js/bot.js`
- Commands: `js/commands/*.js`
- HTTP API: `js/api/httpServer.js` and `js/api/scriptureApi.js`
- Bible API clients:
  - `js/services/bibleApiWeb.js` (bible-api.com WEB translation, with TTL cache)
  - `js/services/bibleApi.js` (labs.bible.org + bible-api.com translation fetch for legacy DM verse flows)
- Persistence:
  - `js/db/database.js`, `js/db/*DB.js`
- Scheduling:
  - `node-cron` in `js/bot.js` for status + daily verse
  - plan scheduler in `js/services/planScheduler.js`
- Deploy scripts:
  - `scripts/deploy/ssm-deploy.sh`
- CI/CD:
  - `.github/workflows/ci.yml`, `.github/workflows/build.yml`,
    `.github/workflows/deploy-canary.yml`, `.github/workflows/deploy-prod.yml`

## Phase 1: Static Analysis & Style Gates

### What was added
- ESLint + Prettier baseline formatting:
  - `eslint.config.js`
  - `.prettierrc.json`
  - `.prettierignore`
- CI enforcement on PRs:
  - `npm run lint`
  - `npm run format:check`
  - `npm test`

### Why
- Prevent obvious correctness regressions (unused vars, accidental globals, etc.)
- Ensure code reviews aren’t swamped by inconsistent formatting

## Phase 2: Crash / Error-Path Hardening

### Issues found
1. Error logging could crash the bot
   - `js/services/botOps.js` built an embed field containing a very long GitHub issue URL.
   - Discord embed field values have a hard limit (1024 chars). When exceeded, discord.js throws,
     which caused an `unhandledRejection` loop in production logs.

2. Fatal runtime errors did not reliably restart the bot
   - `js/bot.js` logged `unhandledRejection` / `uncaughtException` but did not exit afterwards,
     which can leave the process in a corrupted state.

3. Bot status refresh was overly frequent
   - `js/bot.js` had a cron schedule for status message refresh every 5 seconds, which risks
     rate limiting and increased instability.

### Fixes shipped
- `js/services/botOps.js`
  - Shortened/safer issue URL generation (removed stack from URL body).
  - Truncation applied to embed fields to stay under Discord limits.
  - Embed build is wrapped in a try/catch with a text fallback.
  - `sendBotLogMessage` logs a warning when Discord send fails (best-effort).
- `js/bot.js`
  - Exit non-zero on unhandled rejections / uncaught exceptions after best-effort logging.
  - Reduced bot status refresh schedule to once per minute.
  - Added throttling when registering slash commands across many guilds on startup.

## Phase 3: Deployment & Pipeline Reliability

### Issues found
1. SSM commands stuck in `Pending` and the GitHub Actions waiter timed out
   - Deploy workflows relied on `aws ssm wait command-executed`, which can time out while the
     command remains `Pending` (especially if the agent is not online yet).

2. Canary prereleases were unbounded
   - Canary builds created `canary-<sha>` prereleases without cleanup.

3. Deploy script downtime risk
   - `scripts/deploy/ssm-deploy.sh` stopped the running container before building the replacement,
     increasing downtime risk during build failures.

### Fixes shipped
- `.github/workflows/deploy-canary.yml`
  - Wait for SSM `PingStatus=Online` before sending RunCommand.
  - Replace waiter usage with explicit polling of `get-command-invocation` status.
- `.github/workflows/build.yml`
  - Prune canary prereleases: keep newest 5 `canary-*` prereleases; delete older releases + tags.
- `docker-compose.prod.yml` + `scripts/deploy/ssm-deploy.sh`
  - Tag docker images by `${RELEASE_TAG}`.
  - Pre-build the next image before stopping the current container.
  - Record last successful release tag and attempt rollback on failure.

## Phase 4: Tests & Runtime Verification

### Commands run locally
- `npm run lint`
- `npm run format:check`
- `npm test`

### Added / improved tests
- `test/botOps.test.js`
  - Added coverage ensuring error log payload building truncates fields and does not throw.

### Notes / limits
- I cannot guarantee “no downtime” during AWS-level incidents like SSM agent connectivity loss, but
  the deploy script changes reduce downtime during normal deployments (build-before-stop) and add a
  rollback path.
- This PR does not fully implement “send nearly all logs to Discord #bot-logs”; it fixes a major
  bug that prevented error logs from being safely emitted and improves crash/restart behavior.

## Risk Items / Follow-ups (Not Fully Verifiable Here)
- Production and canary instances can still lose SSM connectivity due to host/network issues. The
  workflows now wait for SSM Online and poll invocation status, but AWS-level health remains a
  dependency.
- The deprecation warnings about `ephemeral: true` were observed in production logs. They are noisy
  but not currently fatal. (A follow-up PR can migrate to `flags: MessageFlags.Ephemeral` across
  all interaction replies.)

