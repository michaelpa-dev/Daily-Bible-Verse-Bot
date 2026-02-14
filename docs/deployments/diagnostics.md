# Deployment Diagnostics

## What Was Broken

Before the current deployment overhaul, CI/CD used SSH-based deploys:

- GitHub Actions connected to the EC2 host over SSH using a long-lived private key.
- The deploy updated the server by doing `git pull` and rebuilding Docker.
- Canary was deployed from a dedicated branch (`canary`), and production was deployed directly on pushes to `master` (no release gating).

Issues observed:

- GitHub Actions workflows contained tab characters in YAML, causing immediate "workflow file issue" failures until converted to spaces.
- Private-repo artifact downloads were attempted without proper GitHub auth headers, resulting in HTTP 403/404 when fetching Release assets.
- Discord deploy webhook notifications could fail the deploy job (HTTP 403) depending on webhook configuration and error-handling (these were removed from the new pipeline to avoid blocking deploys).
- The EC2 instances did not have IAM instance profiles, so SSM-based deployments were not available.
- Security group ingress allowed SSH from `0.0.0.0/0` (unnecessarily open for a Discord bot with no inbound traffic needs).
- Canary had no enforced auto-stop rule and could run indefinitely (violates the ephemeral-canary requirement).
- `amazon-ssm-agent` was installed and running, but could not obtain instance profile credentials until the IMDS route was fixed.
- Canary retained an Elastic IP even when stopped (unnecessary ongoing public IPv4 cost).

## What Changed

The deploy approach is now:

- Artifact: GitHub Release asset (`tar.gz`) produced by `build.yml`.
- Deploy: AWS SSM RunCommand (`AWS-RunShellScript`), no SSH required.
- Private-safe artifact download: Deploy workflows resolve a short-lived signed download URL via GitHub API on the runner (auth via `GITHUB_TOKEN` or optional `GH_RELEASE_TOKEN`), and pass only that signed URL to EC2 (no GitHub token on EC2).
- Canary: auto-start on pushes to `canary` (via `workflow_run` chain), auto-stop after 4 hours since the last push.
- Production: release-only deploys (published GitHub Release tag + asset).
- AWS Auth for Actions: GitHub OIDC role with scoped permissions (no long-lived AWS keys in GitHub).
- SSH ingress removed (security group has no inbound rules).

Repo changes:

- Replaced the old `.github/workflows/deploy.yml` with:
  - `.github/workflows/build.yml`
  - `.github/workflows/deploy-canary.yml`
  - `.github/workflows/deploy-prod.yml`
- Added idempotent deploy script:
  - `scripts/deploy/ssm-deploy.sh`
- Added CloudFormation IaC:
  - `infra/cloudformation/deploy-foundation.yml`

## Evidence / Notes

- AWS account used during discovery: `446363550367` (root ARN via `sts get-caller-identity`).
- Discovered instances in `us-east-1` via tags:
  - `App=DailyBibleVerseBot`
  - `Environment=production|canary`
- IMDS routing fix:
  - Both instances were missing a direct route to `169.254.169.254`, so IMDS requests were going via the VPC router and timing out.
  - Added a small `imds-route.service` on each instance to ensure the link-scoped route exists on boot.
- Canary EIP:
  - The canary EIP was disassociated and released so a stopped canary does not retain a billable public IPv4 address.
