# Deployment Map

This repo deploys a single Discord bot to two EC2 environments:

- `production`: always-on
- `canary`: ephemeral (auto-starts on pushes to `master`, auto-stops after 4 hours of inactivity)

## AWS Inventory (Current)

Region: `us-east-1`

### Production

- Instance ID: `i-06731e8d607a465fa`
- Name tag: `daily-bible-verse-production`
- Elastic IP: `13.217.152.245` (EIP allocation `eipalloc-097d39bec8dced1fc`)
- Tags:
  - `App=DailyBibleVerseBot`
  - `Environment=production`
  - `ManagedBy=codex`
- Instance type: `t3.micro`

### Canary

- Instance ID: `i-046c0cef216d3a3d8`
- Name tag: `daily-bible-verse-canary`
- Public IP: ephemeral when running (canary EIP was released to avoid idle IPv4 charges)
- Tags:
  - `App=DailyBibleVerseBot`
  - `Environment=canary`
  - `ManagedBy=codex`
- Instance type: `t3.micro`
- Ephemeral control tags:
  - `CanaryLastPushEpoch=<unix epoch seconds>`
  - `CanaryLastPushIso=<UTC timestamp>`
  - `CanaryAutoStop=enabled`

## Secrets and Config

- `BOT_TOKEN` (Discord token):
  - Stored in GitHub environment secrets (`production` and `canary`)
  - Synced into SSM Parameter Store as SecureString:
    - `/daily-bible-verse-bot/production/BOT_TOKEN`
    - `/daily-bible-verse-bot/canary/BOT_TOKEN`

- Non-secret runtime settings:
  - Persist on the instance at `/opt/daily-bible-verse-bot/.env`
  - The deploy script creates this file with sane defaults if missing.

## Artifact Production and Consumption

- Artifact source: GitHub Releases
  - `build.yml` produces a `tar.gz` asset:
    - `daily-bible-verse-bot-<release_tag>.tar.gz`
  - Canary releases use tag: `canary-<commit_sha>` and are marked as prereleases.
  - Production releases use tags like `v0.2.0` and are not prereleases.

- Deployment mechanism: AWS SSM RunCommand
  - `deploy-canary.yml` and `deploy-prod.yml` use GitHub OIDC to assume an AWS role.
  - The workflow resolves instances by tags (not hard-coded ids), starts the instance if needed, and runs a deploy script via SSM.
  - The instance downloads the GitHub Release asset, swaps `/opt/daily-bible-verse-bot/app`, and restarts Docker Compose.

## Network / Access

- Instances are managed via SSM; security group ingress is intentionally empty (no SSH required).

## IAM / Roles (CloudFormation)

Provisioned by `infra/cloudformation/deploy-foundation.yml` (stack: `daily-bible-verse-bot-foundation`):

- GitHub Actions deploy role:
  - `arn:aws:iam::446363550367:role/DailyBibleVerseBotGitHubActionsRole`
- EC2 instance profiles:
  - Production: `DailyBibleVerseBotProductionInstanceProfile`
  - Canary: `DailyBibleVerseBotCanaryInstanceProfile`
