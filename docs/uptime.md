# Bot Uptime Hardening

This repo runs the Discord bot as a Docker container on EC2. Uptime comes from a combination of:

- Docker restart policy (host-level supervision)
- In-app crash handling (exit on fatal errors so Docker can restart)
- A Discord connection watchdog (exit if stuck/disconnected too long)
- Health checks (HTTP endpoints and a maintainer slash command)

## Runtime Supervision (EC2)

On EC2 the service is a Docker container:

- Container name: `daily-bible-verse-bot`
- Deploy root: `/opt/daily-bible-verse-bot`
- Compose file: `/opt/daily-bible-verse-bot/app/docker-compose.prod.yml`
- Restart policy (compose): `restart: unless-stopped`

This means:

- If the Node.js process exits non-zero, Docker will restart it.
- If the instance reboots and Docker is enabled, the container will come back automatically.

## Fatal Error Handling (In-App)

In `js/bot.js` we install process-level handlers:

- `uncaughtException`: treated as fatal, logs best-effort, then exits with code 1
- `unhandledRejection`: logs best-effort; exits with code 1 unless `FATAL_ON_UNHANDLED_REJECTION=false`

The goal is "fail fast, restart cleanly" instead of leaving a partially broken process running.

## Discord Connection Watchdog

The watchdog runs in-process and periodically checks Discord connectivity.

If the client is not ready and the websocket status has not changed for too long (suggesting a stuck connection),
the watchdog exits the process with code 1 so Docker can restart the container.

Environment variables:

- `WATCHDOG_ENABLED` (default: `true`)
- `WATCHDOG_INTERVAL_MS` (default: `30000`)
- `WATCHDOG_STARTUP_GRACE_MS` (default: `120000`)
- `WATCHDOG_MAX_STUCK_MS` (default: `300000`)

## Health Checks

### HTTP endpoints

If the HTTP API is enabled (default), the bot exposes:

- `GET /healthz`:
  - Always returns `200 { ok: true }`
  - Liveness only (process is running)
- `GET /readyz`:
  - Returns `200` if Discord client is ready, otherwise `503`
  - Includes a `snapshot` payload with discord/websocket + watchdog metadata

Disable the HTTP API by setting:

- `DISABLE_HTTP_API=true`

### Discord slash command

The `/health` command is intended for maintainers in the dev server. It returns:

- build version + git SHA
- discord ready status + websocket status/ping
- last command timestamp
- last disconnect timestamp/reason
- watchdog last-ok timestamp

## Viewing Logs

Common options on the instance (via SSM):

- Container logs:
  - `docker logs --tail 200 daily-bible-verse-bot`
- Host-level Docker service logs:
  - `systemctl status docker`
  - `journalctl -u docker --since "30 min ago"`
- Bot log file (inside persistent volume):
  - `/opt/daily-bible-verse-bot/logs/bot.log`

## Operational Notes

- Discord operational logging to `#bot-logs` is best-effort.
- If Discord logging fails repeatedly (missing permissions, rate limits, etc), a circuit breaker disables it temporarily.
  The bot will still log locally to stdout/stderr and to its log file.

