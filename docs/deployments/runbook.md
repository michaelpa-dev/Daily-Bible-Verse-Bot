# Deploy Runbook

## Canary Lifecycle (Ephemeral)

Trigger:

- Any push to `master` runs `.github/workflows/build.yml` which publishes a prerelease:
  - Tag: `canary-<commit_sha>`
  - Asset: `daily-bible-verse-bot-canary-<commit_sha>.tar.gz`

Then:

- `.github/workflows/deploy-canary.yml` triggers from the successful build workflow run.
- It:
  - Starts the canary EC2 instance if stopped
  - Tags it with `CanaryLastPushEpoch` (resets the 4 hour auto-stop timer)
  - Syncs `BOT_TOKEN` from GitHub environment secrets into SSM Parameter Store (SecureString)
  - Runs the deploy via SSM

Auto-stop:

- A scheduled EventBridge rule invokes a small Lambda every 15 minutes.
- The Lambda stops canary instances (tagged `App=DailyBibleVerseBot`, `Environment=canary`) when:
  - The instance is `running`
  - `now - CanaryLastPushEpoch >= 4 hours`

## Production Deploy / Promotion

Production deployments are release-driven and should be gated via GitHub environment approvals.

Option A (recommended):

1. Create a git tag like `v0.2.1` on `master`.
2. Push the tag.
3. `build.yml` publishes a GitHub Release for that tag (asset: `daily-bible-verse-bot-v0.2.1.tar.gz`).
4. `deploy-prod.yml` triggers on the release event and deploys to production.

Option B (rollback / manual deploy):

- Run `deploy-prod.yml` via `workflow_dispatch` and provide `release_tag` (e.g., `v0.2.0`).

## Rollback

Rollback is implemented as re-deploying a previous GitHub Release tag.

- Use `deploy-prod.yml` `workflow_dispatch` with the older `release_tag`.

## Troubleshooting

Common checks:

- GitHub Actions:
  - Confirm `build.yml` created the expected release tag + asset.
  - Confirm `deploy-canary.yml` / `deploy-prod.yml` captured the SSM command output.

- SSM:
  - Look up the printed `CommandId` and inspect the invocation output:
    - `aws ssm get-command-invocation --command-id <id> --instance-id <id>`

- Instance logs:
  - The container is named `daily-bible-verse-bot`.
  - You can inspect recent logs from SSM by running a command like:
    - `docker logs --tail 200 daily-bible-verse-bot`

- SSM not working:
  - Confirm `amazon-ssm-agent` is running and the instance has its IAM instance profile.
  - Confirm `imds-route.service` is enabled so the instance can reach IMDS for role credentials.

## One-Time / Repair Scripts

From a machine with AWS CLI access (using the `root` profile in this repo):

- Foundation (CloudFormation + instance profiles): `scripts/infra/deploy-foundation.ps1`
- Hardening (remove SSH ingress, release canary EIP): `scripts/infra/harden.ps1`
