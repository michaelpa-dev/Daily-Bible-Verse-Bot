# Release Process (Semver + Release-Only Production Deploys)

This repo enforces **release-only** production deployments:

- Production deploys only from a **published GitHub Release** with a semver tag (`vMAJOR.MINOR.PATCH`) and a Release asset.
- Production does not deploy from branch pushes, PR merges, or non-release tags.

Canary remains an integration environment that is ephemeral and cost-controlled.

## Branch Flow

1. Feature work happens on a feature branch (example: `feat/...`).
2. Open a PR into `canary`.
3. Merge into `canary` to deploy to the ephemeral canary EC2.
4. After canary verification passes, open a promotion PR from `canary` -> `master`.
5. Merge to `master` to trigger automated release tagging and a published GitHub Release.

## Semver Bump Rules (PATCH vs MINOR vs MAJOR)

Exactly one bump intent must be chosen when promoting `canary` -> `master`.

### Default bump: PATCH

Use `release:patch` for:

- Bug fixes
- Dependency patch updates
- Small internal refactors
- Docs-only changes
- CI tweaks

### MINOR bump

Use `release:minor` for additive, backward-compatible changes:

- New bot commands or options
- New API endpoints
- New features that do not break existing command behavior or configuration
- Performance improvements that preserve outputs
- New optional configuration keys

### MAJOR bump

Use `release:major` for breaking changes or changes requiring manual action:

- Renamed/removed commands or endpoints
- Output format changes that break consumers
- Changed required environment variables or secrets
- Database schema changes without backward-compatible migration
- Any change requiring admins to reconfigure the bot or rerun setup steps

## How Bump Intent Is Enforced

Approach: **labels-based bumping**.

- Promotion PRs into `master` must have exactly one release bump label.
- Allowed: `release:patch`
- Allowed: `release:minor`
- Allowed: `release:major`
- Workflow: `.github/workflows/release-label-guard.yml` fails the PR check if the label is missing or multiple are present.

To fully enforce this, configure branch protection for `master` to require the "Release Label Guard" status check.

## Automated Tagging and Release

After merging into `master`:

1. `.github/workflows/auto-tag-release.yml` runs on the `master` push.
2. It finds the PR associated with the merge commit and reads the bump label.
3. It computes the next semver tag and pushes `vMAJOR.MINOR.PATCH`.
4. GitHub does **not** trigger downstream workflows from tag pushes created by `GITHUB_TOKEN` (recursion prevention).
5. `auto-tag-release.yml` therefore dispatches `.github/workflows/build.yml` explicitly for the new tag.
6. `build.yml` builds/tests, packages the release artifact, publishes a GitHub Release, and attaches the asset (`daily-bible-verse-bot-vX.Y.Z.tar.gz`).

## Production Deployment

Workflow: `.github/workflows/deploy-prod.yml`

Triggers:

- `release: published` (preferred)
- `push: tags v*` (only deploys if the tag corresponds to a published, non-prerelease, non-draft GitHub Release)
- `workflow_dispatch` (used for automated chaining + manual rollback, still release-only)

The deploy workflow downloads the **GitHub Release asset** (not the source archive) and deploys via AWS SSM RunCommand.

Note: Releases created by GitHub Actions using `GITHUB_TOKEN` do not reliably trigger `release: published` workflows.
To keep everything automatic without introducing PAT secrets, `build.yml` dispatches `deploy-prod.yml` after publishing a stable Release.
