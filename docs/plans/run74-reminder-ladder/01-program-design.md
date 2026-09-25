# P2-100 — Match-Start Reminder Ladder (T-24h + T-45m)

**Cycle:** run #74 · **Status:** Gate 4 in progress · **Rotation:** Admin lane, API matches build

## Problem

A joiner added 10 minutes before kickoff can miss the reminder depending on the 15-min tick phase,
and there is no day-ahead "your match is tomorrow" touch (the single most common calendar-anchoring
notification in booking products).

## Scope

IN: second reminder leg at T-24h (window [24h−15m, 24h+15m) ⇒ effective accuracy ±15m at a 15-min
cadence); new `match_starting_24h` PushKey (en/ar); new `match_reminder_24h` mail template (en/ar);
DB stamp `reminders_24h_sent_at` + hand-written migration 0044 (VPS convention) + journal entry.
OUT: per-lead-time user preferences (P0-5 sub-cycle); quiet-hours changes; SMS channel; email
opt-out modeling; reschedule stamp-clearing (migration stamps are NULL → rescheduled/cancelled
matches naturally re-qualify only in future windows; the 45m leg's existing semantics unchanged).

## Exact contract deltas

1. `matches` column: `reminders_24h_sent_at timestamp with time zone NULL` — stamp-once guard for
   the T-24h leg (mirrors reminders_sent_at). NULL = not yet sent.
2. `PushKey += 'match_starting_24h'`; `PushVars += { kickoffDateISO?: string }`.
   CATALOG entry (both locales): title '📅 Match tomorrow' / '📅 مباراتك غدًا'; body interpolates
   the Riyadh-local DATE (Intl.DateTimeFormat en-GB/ar-SA, dateStyle long, Asia/Riyadh) + kickoff
   TIME (existing kickoffTime() en-GB/ar-SA hh:mm). Missing kickoffDateISO → '--' fallback
   (visible-broken marker convention, never fabricate "today").
3. `CATEGORY_BY_KEY['match_starting_24h'] = 'match'`.
4. Mail: `MailTemplateKey += 'match_reminder_24h'`; MAIL_TEMPLATES entry en/ar (subject
   "Tomorrow: {{title}}" / "غدًا: {{title}}"); sent to the same confirmed roster, same details box
   (matchId/matchTitle/when = riyadhLocal(kickoff)); best-effort, never throws.
5. Service: `sendMatchStartReminders()` returns `{ sent45, sent24 }` (call site destructure, log
   line unchanged in shape). T-24h select: `reminders_24h_sent_at IS NULL AND status IN
   ('Open','Full') AND scheduled_at > NOW()+INTERVAL '23 hours 45 minutes' AND scheduled_at <=
   NOW()+INTERVAL '24 hours 15 minutes'`, limit 50, per-match try/catch identical to the 45m leg,
   stamp update `withTimestamp({ reminders_24h_sent_at: new Date() })` after successful fan-out.
6. Worker: `data.type === 'match_starting_24h' && data.matchId` → `/${locale}/match/<id>` (chain
   position immediately after match_starting_soon); tag `<type>:<matchId>` keeps 24h and 45m
   pushes distinct (no renotify replacement collision — run-#70 class).
7. Tests: new `matches.reminder-ladder.spec.ts` (7 cases: 45m leg untouched; 24h selects right
   window predicate via PgDialect.sqlToQuery; push + email fans out once; stamps ONLY the 24h
   column; a match in neither window is untouched; push failure skips the stamp; kickoffDateISO
   fallback '--'). PWA `push-notification-click.test.ts` type list += 'match_starting_24h'
   (cross-layer contract). `mailer.spec.ts` dictionary-iteration picks up the new template
   automatically (both-locale contract enforced).

## Contract verification checklist (Gate 3 — run explicitly)

- [x] Every mutation endpoint returns fully populated object — N/A (scheduler path, no endpoint
  shape change; `sendMatchStartReminders` is internal, return widened with the scheduler call site
  updated in the same commit).
- [x] Frontend types accept the exact JSON — PWA consumes only `data.type`/`data.matchId` in the
  worker (string/any payload) — no typed surface change.
- [x] Adapter functions exist for every API shape — no new API shape (push payload keys are
  consumed by worker/index.js; route added).
- [x] No field silently undefined — kickoffDateISO ALWAYS sent by the API on the 24h path; the
  '--' fallback covers a data bug visibly.
- [x] i18n keys exist both languages — push copy lives in push-text.ts en/ar (server-rendered, PWA
  parity untouched by design); mail template en/ar per mailer.spec dictionary iteration; worker
  deep-links are locale-neutral (`data.locale` injected per subscriber).

## Migration / apply plan (Phase 4.5 discipline)

Code first → gates → commit BOTH code + 0044 sql + journal entry → apply via
`node scripts/migrate-vps.mjs` (sha256-keyed, atomic, gap-guarded) → journal `when` = Date.now()
at apply time (ABOVE live newest 1789846359444 → applies exactly once) → verify
`__drizzle_migrations` + `information_schema.columns` → API restart AFTER build dist exists.
No API restart needed for correctness of staging deploys beyond the fork (services serve the
projects dir; deploy fork unchanged — flagged in report).
