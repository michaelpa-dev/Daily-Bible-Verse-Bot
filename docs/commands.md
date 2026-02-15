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
  - Human-friendly reference parsing:
    - Ordinals: `1 sam 3`, `i sam 3`, `first samuel 3`
    - Abbreviations: `ps 23`, `jn 3`, `1 cor 13:4-7`
    - Punctuation/spacing: `1samuel 3`, `1-sam 3`, `ps23`
    - Multi-word books: `song of songs 2:8`
  - Ambiguity handling:
    - If your book input is ambiguous (example: `sam 3`), the bot will ask you to confirm via a select menu.
    - The bot will show what it resolved to (example: `Resolved: 1 Samuel (1SA) 3`).
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

