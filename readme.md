# Daily Bible Verse Bot

Daily Bible Verse Bot is a Discord bot that delivers daily verses, random verse requests, and server operations tooling for a production-style development workflow.

## Features

- Daily verse delivery to subscribed users.
- Random verse delivery on-demand.
- Per-user translation preferences.
- Dev server bootstrap automation for roles/channels/overwrites/templates.
- Ops commands for health, version, and release notes.
- Structured bot error logging to `#bot-logs`.

## Installation

1. Clone this repository.
2. Install dependencies:
   - `npm install`

## Configuration

Copy `cfg/config-sample.json` to `cfg/config.json` and update values as needed.

Environment variables are preferred for secrets and CI/CD deployments:

- `BOT_TOKEN` (required at runtime, keep out of git)
- `BIBLE_API_URL` (optional override)
- `TRANSLATION_API_URL` (optional override)
- `DEFAULT_TRANSLATION` (optional override)
- `LOG_LEVEL` (optional override)
- `GIT_SHA` or `COMMIT_SHA` (optional, used by `/version` and `/health`)

For managed deployments (`production` / `canary`), set `BOT_TOKEN` in GitHub environment secrets.

## Usage

- Start locally:
  - `npm start`
- Run tests:
  - `npm test`

## Automatic Deployment Pipeline

This repo deploys to EC2 using GitHub Releases + AWS SSM RunCommand (no SSH required).

Workflows:

- `build.yml`: build/test + publish a GitHub Release asset (preferred artifact source)
- `deploy-canary.yml`: start canary (if stopped) and deploy via SSM
- `deploy-prod.yml`: deploy production via SSM (should be gated via GitHub environment approvals)

Triggers:

- Push to `master`:
  - publish a prerelease tagged `canary-<commit_sha>`
  - deploy to `canary`
  - update the `CanaryLastPushEpoch` tag so the canary stays up for 4 hours since the last push
- Tag push `v*`:
  - publish a production GitHub Release asset
  - production deploy is triggered by the release event or can be run manually (rollback)

Canary auto-stop:

- A small Lambda runs every 15 minutes and stops the canary instance after 4 hours of inactivity.

### GitHub Environments and secrets

Create two GitHub environments:

- `production`
- `canary`

Add these secrets in each environment (values differ per environment):

- `BOT_TOKEN`: bot token for that environment

EC2 host prerequisites:

- Docker installed
- Docker Compose plugin (`docker compose`) or `docker-compose` installed
- SSM enabled on the instance (SSM agent + IAM instance profile)
- runtime `.env` file exists at `/opt/daily-bible-verse-bot/.env` for non-token settings (created automatically if missing)

### EC2 + Docker setup checklist

See `docs/deployments/runbook.md` for the operational checklist and troubleshooting commands.

## Slash Commands

- `/subscribe`
- `/unsubscribe`
- `/randomverse`
- `/settranslation`
- `/stats`
- `/support`
- `/health`
- `/version`
- `/release-notes` (Maintainer/Owner)
- `/bootstrap-dev-server` (Maintainer/Owner)

## Discord Dev Server Setup

Target dev guild:
- `1471943418002280451`

### OAuth Scopes

- `bot`
- `applications.commands`

### Minimal Recommended Bot Permissions

Grant only what is required for this project:

- `View Channels`
- `Send Messages`
- `Embed Links`
- `Attach Files`
- `Read Message History`
- `Use Slash Commands`
- `Manage Channels` (bootstrap channel/category creation/repair)
- `Manage Roles` (bootstrap role creation/overwrite repair)
- `Manage Messages` (template pinning and status message updates)

Avoid `Administrator` unless you explicitly need it for debugging.

### How to Run Bootstrap

1. Invite the bot with the scopes and permissions above.
2. Run preview mode:
   - `/bootstrap-dev-server dry_run:true`
3. Apply changes:
   - `/bootstrap-dev-server apply:true`
4. Re-run preview to verify idempotency:
   - `/bootstrap-dev-server dry_run:true`

Detailed server spec is documented in `docs/discord-dev-server.md`.

## Development Notes

- Admin/ops commands are restricted to guild owner or `Maintainer` role.
- Operational logs are written to `#bot-logs` when available.
- Status heartbeat can be maintained in `#bot-status`.

## License

This project is licensed under the [MIT License](LICENSE).
