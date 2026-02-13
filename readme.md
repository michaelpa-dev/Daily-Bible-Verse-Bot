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

This repo includes GitHub Actions deployment automation in `.github/workflows/deploy.yml`.

- Trigger:
  - Push to `master` -> deploy `production`
  - Push to `canary` -> deploy `canary`
  - Manual `workflow_dispatch` -> choose `target_environment` (`canary` or `production`)
- Flow:
  1. Run tests (`npm ci` + `npm test`)
  2. Resolve deploy target environment (`production` or `canary`)
  3. Send Discord notification that deploy started (optional)
  4. SSH to the EC2 host for that environment
  5. Pull latest target branch and restart Docker (`docker compose -f docker-compose.prod.yml up -d --build`)
  6. Send Discord success/failure notification (optional)

### GitHub Environments and secrets

Create two GitHub environments:

- `production`
- `canary`

Add these secrets in each environment (values differ per environment):

- `DEPLOY_SSH_KEY`: private SSH key used by GitHub Actions
- `DEPLOY_HOST`: server hostname or IP
- `DEPLOY_USER`: SSH username
- `DEPLOY_PATH`: absolute path to repo on the server
- `DEPLOY_PORT`: optional SSH port (defaults to `22`)
- `BOT_TOKEN`: bot token for that environment
- `DISCORD_DEPLOY_WEBHOOK_URL`: optional Discord webhook URL for deploy notifications

EC2 host prerequisites:

- `git` and Docker installed
- Docker Compose plugin (`docker compose`) or `docker-compose` installed
- repo present at `DEPLOY_PATH` (workflow can auto-clone if missing)
- runtime `.env` file exists at `${DEPLOY_PATH}/.env` for non-token settings (`BIBLE_API_URL`, `TRANSLATION_API_URL`, `DEFAULT_TRANSLATION`, etc.)

### EC2 + Docker setup checklist

1. Create Linux EC2 instances for `production` and `canary`.
2. Install Docker and Docker Compose plugin on the instance.
3. Clone this repository into your chosen deploy path:
   - `git clone https://github.com/<your-org-or-user>/Daily-Bible-Verse-Bot.git <DEPLOY_PATH>`
4. Create `${DEPLOY_PATH}/.env` with required runtime values (excluding `BOT_TOKEN`), for example:
   - `BIBLE_API_URL=https://labs.bible.org/api/?type=json&passage=`
   - `TRANSLATION_API_URL=https://bible-api.com/`
   - `DEFAULT_TRANSLATION=web`
   - `LOG_LEVEL=debug`
5. Ensure SSH access for GitHub Actions using the private key you store in `DEPLOY_SSH_KEY`.
6. Add the GitHub environment secrets listed above for both `production` and `canary`.
7. Push to `master` (production) or `canary` (canary) and verify:
   - Actions run succeeds
   - container is running: `docker compose -f docker-compose.prod.yml ps`
   - Discord deploy notifications appear (if webhook configured)

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
