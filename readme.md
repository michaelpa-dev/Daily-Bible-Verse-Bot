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

- `BOT_TOKEN` (recommended, keep out of git)
- `BIBLE_API_URL` (optional override)
- `TRANSLATION_API_URL` (optional override)
- `DEFAULT_TRANSLATION` (optional override)
- `LOG_LEVEL` (optional override)
- `GIT_SHA` or `COMMIT_SHA` (optional, used by `/version` and `/health`)

## Usage

- Start locally:
  - `npm start`
- Run tests:
  - `npm test`

## Automatic Deployment Pipeline

This repo includes GitHub Actions deployment automation in `.github/workflows/deploy.yml`.

- Trigger: push to `master` (and manual `workflow_dispatch`).
- Flow:
  1. Run tests (`npm ci` + `npm test`)
  2. SSH to your deployment host
  3. Pull latest `master`
  4. Install production dependencies (`npm ci --omit=dev`)
  5. Reload bot with PM2 (`pm2 reload "Daily Bible Verse Bot" --update-env`)

Configure the following repository secrets in GitHub:

- `DEPLOY_SSH_KEY`: private SSH key used by GitHub Actions
- `DEPLOY_HOST`: server hostname or IP
- `DEPLOY_USER`: SSH username
- `DEPLOY_PATH`: absolute path to repo on the server
- `DEPLOY_PORT`: optional SSH port (defaults to `22`)

Server prerequisites:

- `git`, `node`, `npm`, and `pm2` installed on the server
- the bot repository already cloned to `DEPLOY_PATH`
- bot runtime secrets configured on the server (for example `BOT_TOKEN`)

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
