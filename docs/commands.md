# Slash Commands

This bot is primarily operated via Discord slash commands.

## User Commands

- `/subscribe`
  - Subscribe to the daily verse DM.
- `/unsubscribe`
  - Unsubscribe from the daily verse DM.
- `/randomverse [translation]`
  - DM a random verse.
- `/settranslation <translation>`
  - Set your preferred translation for daily/random verse DMs.
- `/passage <reference> [mode]`
  - Fetch a specific passage (WEB) with robust parsing.
  - Examples:
    - `matt 25:31-33,46`
    - `1 cor 13:4-7`
    - `Ps 23`
    - `Song of Solomon 2:8`
  - `mode`:
    - `Channel` posts in-channel (default)
    - `DM` sends the passage to your DMs (recommended for long passages)
- `/read <reference>`
  - Starts a DM “page-turner” reader session with buttons:
    - Prev/Next page
    - Prev/Next chapter (cross-book navigation supported)
    - Change book (group + book selector)
    - Jump to reference (modal)
- `/plan ...`
  - Reading plans (see `docs/reading-plans.md`).
- `/stats`
  - Show basic usage stats.
- `/support`
  - Link to the GitHub issue tracker for help/bugs.

## Ops / Maintainer Commands

- `/health`
  - Show bot runtime health information.
- `/version`
  - Show build/version metadata.
- `/release-notes`
  - Release notes (restricted to owner / Maintainer role).
- `/bootstrap-dev-server`
  - Dev server bootstrap automation (restricted to owner / Maintainer role).

