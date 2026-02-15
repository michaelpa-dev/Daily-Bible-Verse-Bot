# Deploy Runbook

## Canary Lifecycle (Ephemeral)

Trigger:

- Any push (including merged PRs) to `canary` runs `.github/workflows/build.yml` which publishes a prerelease:
  - Tag: `canary-<commit_sha>`
  - Asset: `daily-bible-verse-bot-canary-<commit_sha>.tar.gz`

Then:

- `.github/workflows/deploy-canary.yml` runs on pushes to `canary` and waits for the `canary-<commit_sha>` prerelease asset to exist before deploying.
- It:
  - Starts the canary EC2 instance if stopped
  - Tags it with `CanaryLastPushEpoch` (resets the 4 hour auto-stop timer)
  - Syncs `BOT_TOKEN` from GitHub environment secrets into SSM Parameter Store (SecureString)
  - Resolves a short-lived signed GitHub download URL for the release asset (so private repos work without putting GitHub tokens on EC2)
  - Runs the deploy via SSM
  - The instance-side deploy script will attempt an automatic rollback if the new container fails to start

Auto-stop:

- A scheduled EventBridge rule invokes a small Lambda every 15 minutes.
- The Lambda stops canary instances (tagged `App=DailyBibleVerseBot`, `Environment=canary`) when:
  - The instance is `running`
  - `now - CanaryLastPushEpoch >= 4 hours`

## Production Deploy / Promotion

Production deployments are **release-driven** and should be gated via GitHub environment approvals.

Promotion flow:

1. Work lands via PRs into `canary`.
2. Canary deploy verifies on ephemeral canary EC2.
3. Create a promotion PR from `canary` -> `master`.
4. Apply exactly one release bump label to the promotion PR:
   - `release:patch`, `release:minor`, or `release:major`
5. Merge the PR to `master`.
6. `auto-tag-release.yml` auto-creates a semver tag `vMAJOR.MINOR.PATCH` on the merge commit.
7. GitHub will not trigger downstream workflows from tags created by `GITHUB_TOKEN`, so `auto-tag-release.yml` dispatches `build.yml` explicitly for the new tag.
8. `build.yml` publishes a **published** GitHub Release + asset (`daily-bible-verse-bot-vX.Y.Z.tar.gz`).
9. `build.yml` dispatches `deploy-prod.yml`, which deploys production **only** from the published GitHub Release asset.

Rollback / manual deploy:

- Run `deploy-prod.yml` via `workflow_dispatch` and provide `release_tag` (e.g., `v0.2.0`).
- The workflow validates the release is published and not a prerelease/draft.

## Rollback

Rollback is implemented as re-deploying a previous GitHub Release tag.

- Use `deploy-prod.yml` `workflow_dispatch` with the older `release_tag`.

## Troubleshooting

Common checks:

- GitHub Actions:
  - Confirm `build.yml` created the expected release tag + asset.
  - Confirm `deploy-canary.yml` / `deploy-prod.yml` captured the SSM command output.
  - If a deploy fails to resolve the signed download URL for a private release asset, add a classic PAT with `repo` scope as `GH_RELEASE_TOKEN` in the relevant GitHub environment (`canary` / `production`).
  - If a production deploy did not run for a tag push: ensure the tag corresponds to a published, non-prerelease GitHub Release.

- SSM:
  - Look up the printed `CommandId` and inspect the invocation output:
    - `aws ssm get-command-invocation --command-id <id> --instance-id <id>`

- Instance logs:
  - The container is named `daily-bible-verse-bot`.
  - You can inspect recent logs from SSM by running a command like:
    - `docker logs --tail 200 daily-bible-verse-bot`
  - If HTTP API is enabled, you can inspect readiness locally on the instance:
    - `curl -fsS http://127.0.0.1:3000/readyz | jq`

- SSM not working:
  - Confirm `amazon-ssm-agent` is running and the instance has its IAM instance profile.
  - Confirm `imds-route.service` is enabled so the instance can reach IMDS for role credentials.

## Cost Leak Guard

Both deploy workflows run a post-deploy check that fails the job if:

- Any EBS volumes exist in `available` (unattached) state.
- Any Elastic IPs exist that are unassociated.

## One-Time / Repair Scripts

From a machine with AWS CLI access (using the `root` profile in this repo):

- Foundation (CloudFormation + instance profiles): `scripts/infra/deploy-foundation.ps1`
- Hardening (remove SSH ingress, release canary EIP): `scripts/infra/harden.ps1`
