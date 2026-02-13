# Discord Dev Server Specification

This document defines the desired Discord development server layout and operating model for the Daily Bible Verse Bot.

Target guild:
- `1471943418002280451`

## Categories and Channels

### `📌 INFO` (read-only for most members)

`#welcome`
- Purpose: New member orientation, where to start, and working norms.
- Do post: onboarding instructions and important links.
- Do not post: feature debates or bug threads.

`#rules-and-safety`
- Purpose: Conduct, moderation policy, and safety updates.
- Do post: policy updates and moderation references.
- Do not post: general discussion.

`#roadmap`
- Purpose: Current priorities, milestones, and release goals.
- Do post: roadmap updates and status summaries.
- Do not post: unrelated implementation chatter.

`#changelog`
- Purpose: Release notes and shipped changes.
- Do post: formatted release announcements.
- Do not post: planning discussion.

### `🛠️ DEVELOPMENT`

`#dev-chat`
- Purpose: Day-to-day engineering conversation.
- Do post: implementation plans, blockers, progress.
- Do not post: production incident logs.

`#help-requests`
- Purpose: Focused requests for help.
- Do post: concrete coding or debugging asks.
- Do not post: unrelated social chat.

`#ideas-backlog`
- Purpose: Capture and triage future ideas.
- Do post: proposal drafts and rough concepts.
- Do not post: finalized release notes.

`#design-decisions`
- Purpose: Architecture Decision Records (ADRs) and rationale.
- Do post: context, decision, alternatives, consequences.
- Do not post: unresolved brainstorming without conclusion.

`#pr-reviews`
- Purpose: PR links and review coordination.
- Do post: review requests, approval status, follow-up tasks.
- Do not post: unrelated bug triage.

`#qa-testing`
- Purpose: test plans, bug reports, and verification logs.
- Do post: repro steps, expected/actual outcomes, environment notes.
- Do not post: long roadmap debates.

### `🤖 BOT OPS`

`#bot-status`
- Purpose: heartbeat and periodic bot health summaries.
- Do post: status snapshots and uptime updates.
- Do not post: general conversation.

`#bot-logs`
- Purpose: structured command/runtime error logs.
- Do post: bot-generated logs only.
- Do not post: human discussion. Humans are read-only.

`#alerts` (optional)
- Purpose: high-priority operational alerts.
- Do post: incident notifications and mitigations.
- Do not post: routine development updates.

### `🔊 VOICE` (optional)

`Dev Huddle`
- Purpose: live collaboration, pairing, and standups.
- Do post: N/A (voice channel).
- Do not post: N/A.

## Roles

`Maintainer`
- Scope: owner-delegated operational role for server bootstrap, release notes, and dev-server governance.
- Notes: admin-like workflow role, but not full `Administrator`.

`Reviewer`
- Scope: code review and quality gate participation.

`Tester`
- Scope: QA execution, bug reporting, and verification.

`Contributor`
- Scope: implementation and development discussion.

`Muted`
- Scope: moderation/testing role that blocks message sending in non-mod channels.

## Permission Model

### High-level intent

- `@everyone` can read `📌 INFO` but cannot post there.
- Contributors can write in development channels.
- Testers can write in `#qa-testing`.
- `#bot-logs` is bot-write-only with humans read-only.
- `Muted` denies sending messages in non-mod channels.
- Use per-channel permission overwrites as primary control plane.

### Permission matrix (summary)

| Channel Group | @everyone | Contributor | Tester | Reviewer | Maintainer | Muted |
|---|---|---|---|---|---|---|
| `📌 INFO` | Read, no send | No send unless elevated | No send unless elevated | No send unless elevated | Send allowed | Deny send |
| `🛠️ DEVELOPMENT` | Read, no send | Send allowed | Send allowed | Send allowed | Send allowed | Deny send |
| `#qa-testing` | Read, no send | Send allowed | Send allowed | Send allowed | Send allowed | Deny send |
| `#bot-status` | Read, no send | No send | No send | No send | Optional send | Deny send |
| `#bot-logs` | Read, no send | No send | No send | No send | No send | Deny send |
| `#alerts` | Read, no send | No send | No send | No send | Send allowed | Deny send |

Operational notes:
- Explicit bot member overwrites should allow sending in `#bot-logs`, `#bot-status`, and optionally `#alerts`.
- Existing moderation channels (names/category containing `mod`) are excluded from automatic muted overwrite enforcement.

## Admin Setup Checklist (Discord UI)

1. Enable Community features if needed (`Server Settings -> Enable Community`).
2. Configure Rules or Screening if you require acceptance flow.
3. Confirm role hierarchy places `Maintainer` appropriately under owner control.
4. Set channel topics/descriptions to match this spec.
5. Pin onboarding templates in:
   - `#welcome`
   - `#qa-testing`
   - `#design-decisions`
6. Verify bot has required permissions in this guild:
   - `View Channels`
   - `Send Messages`
   - `Manage Channels`
   - `Manage Roles`
   - `Manage Messages` (for pinning/updating template content)
7. Run bootstrap commands:
   - `/bootstrap-dev-server dry_run:true`
   - `/bootstrap-dev-server apply:true`
8. Re-run dry run to confirm idempotency and minimal/no diffs.

## Contributor Runbook

- Use `#help-requests` for implementation blockers.
- Use `#ideas-backlog` for proposal intake.
- Use `#design-decisions` for ADR-style decisions.
- Use `#pr-reviews` for review requests.
- Use `#qa-testing` for bug and verification workflow.
- Use `/release-notes` (Maintainers only) to publish to `#changelog`.
- Treat `#bot-logs` as an operational stream, not a discussion channel.
