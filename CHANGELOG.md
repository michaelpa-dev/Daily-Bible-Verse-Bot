# Changelog

## v0.5.0 - 2026-02-17

### Features
- Added `/give` command with a support embed, GitHub Sponsors button, and plain-text fallback when `Embed Links` is unavailable.

### Fixes
- No direct runtime bug fixes in this release.

### Chores
- Added `.github/FUNDING.yml` to enable the GitHub Sponsors button on the repository.
- Updated release note generation in `.github/workflows/build.yml` to include `/give` and Sponsors entries when applicable.
- Updated documentation for `/give` in `readme.md` and `docs/commands.md`.
- Standardized Prettier line-ending behavior and scoped lint/format scripts for faster CI feedback.
