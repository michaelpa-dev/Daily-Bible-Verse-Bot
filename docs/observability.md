# Observability

This bot is designed to be debuggable without SSH.

## Always-On `#bot-logs` (Canary + Production)

Both **canary** and **production** builds post operational logs into the development Discord server
channel `#bot-logs` by default.

Key properties:
- **Always on in canary + production**: the Discord log sink is enabled by default when
  `DEPLOY_ENVIRONMENT` is `canary` or `production`.
- **Safe by design**: log delivery failures never crash the bot (batched queue + circuit breaker).
- **Structured**: logs are emitted as JSON to stdout/stderr and formatted into readable batches for Discord.

## What Gets Logged

The `#bot-logs` channel is intended to have high coverage for:
- Bot startup/shutdown
- Command start/end (duration, user/guild/channel)
- Component interactions (buttons/select menus/modals)
- External API calls (bible-api.com, etc) with status + duration
- Errors (stack traces truncated to safe lengths)
- Reference resolution events (useful for debugging human-input parsing)

## Configuration (Environment Variables)

The Discord log sink is controlled via these environment variables:
- `DEV_LOGGING_ENABLED`
  - `true`/`false`
  - Default: `true` in canary + production, `false` otherwise.
- `DEV_LOG_LEVEL`
  - One of: `debug`, `info`, `warn`, `error`
  - If unset, the sink falls back to `LOG_LEVEL`.
  - Default: `info`
- `DEV_GUILD_ID`
  - Discord guild (server) ID that contains `#bot-logs`.
  - Default: the repo's development server ID.
- `DEV_BOT_LOGS_CHANNEL_ID`
  - Optional explicit channel ID for `#bot-logs`.
  - If unset, the bot finds the channel by name (`bot-logs`) within `DEV_GUILD_ID`.

Advanced tuning:
- `DEV_LOG_FLUSH_INTERVAL_MS` (default `2000`)
- `DEV_LOG_MAX_BATCH_ITEMS` (default `20`)
- `DEV_LOG_MAX_QUEUE_ITEMS` (default `500`)
- `DEV_LOG_COALESCE_WINDOW_MS` (default `15000`)
- `DEV_LOG_STARTUP_RETRY_ATTEMPTS` (default `5`)

## Failure Modes / Circuit Breaker

If posting logs to Discord fails repeatedly (missing permissions, rate limits, channel not found):
- the sink opens a **circuit breaker** (cooldown increases with consecutive failures)
- events are **dropped** while the circuit is open
- the bot continues operating and logs locally to stdout/stderr

You can view sink health in:
- `/status` (maintainer command)
- the dev `#bot-status` message fields

