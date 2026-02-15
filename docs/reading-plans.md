# Reading Plans

Reading plans are implemented inside the bot process and persisted to SQLite.

Cost principle: there is **no external scheduler** (no paid AWS services). Scheduling is done via in-process cron with state saved to `db/bot.sqlite`.

## Plan Types

- `one-year`
  - Full Bible in 365 days (3-4 chapters/day).
- `new-testament-90`
  - New Testament in 90 days.
- `gospels-30`
  - Matthew, Mark, Luke, John in 30 days.
- `psalms-proverbs`
  - 1 Psalm + 1 Proverb per day (cycles indefinitely).
- `custom`
  - Sequential chapters across a chosen scope/books with a configurable pace.

## Commands

### Start

- `/plan start [target] plan_type:<type> [scope] [books] [chapters_per_day|verses_per_day|minutes_per_day] [timezone] [post_time] [start_date] [channel]`

Notes:

- Slash commands are registered per-server (guild) for fast iteration, so `/plan` is typically invoked from a server channel.
- In a guild, the default `target` is `Server` which creates/overwrites a **guild plan** and posts to the selected channel daily.
- To create/overwrite a **personal plan** that DMs you daily, set `target` to `Me (DM)` (even when invoking from a server).

### Status

- `/plan status [target]`
  - Shows current status, day index, timezone, and post time.

### Today

- `/plan today [target]`
  - Shows today's reading with pagination (ephemeral in guilds to keep channels clean).

### Pause / Resume / Stop

- `/plan pause [target]`
- `/plan resume [target]`
- `/plan stop [target]`

### Skip

- `/plan skip [target] [days]`
  - Skips ahead by N days in the plan sequence.

## Scheduling Behavior

- On startup, the bot loads all active plans and schedules them.
- If the bot was offline at the scheduled post time, it posts once with a "late" note (at most once per day).

## Pagination and API Cost Control

- Bible text is fetched from bible-api.com (WEB).
- Long readings are paginated with buttons and cached in memory for the session lifetime.
- The bible-api client also caches passage responses with a TTL to reduce repeated outbound calls.

