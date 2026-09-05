# Run #35 — Gate 0 retro: transactional email layer (P1-41)

**Directive lineage:** cron notepad `run_directive` (Abdullah, 2026-09-05 15:45 UTC):
reviewer = glm-5.3-flash; P1-40 REJECTED; build the email layer this run.
**Pre-staged plan — amend the audit with fresh data at run time; the design decisions
are directives, not suggestions.**

## 1. Owner decision on scope

"All things needed to have an email for" = **transactional only** (state changes the user
cares about). NO marketing/newsletter/promo — the notification_type enum comment in
schema.ts explicitly reserves `promo` for the future; do not implement it.

## 2. Fresh audit to run at run time (evidence for 00-retro)

- `git log --oneline -20` — what landed since this plan was staged (especially anything
  touching notifications, matches, wallet, admin).
- `grep -rn "sendPushToUsers\|createNotification\|verb:" apps/api/src --include="*.ts" -l`
  — every trigger point emails must mirror.
- Confirm **no mail dependency exists** in `apps/api` (plan-time: none).
- Confirm schema state: plan-time `users` has NO email column (phone-first product).

## 3. Existing findings baked into this plan

- **No mail transport anywhere.** No nodemailer/resend/SES/SMTP in package.json; no mailer
  module. The only outbound-channel services are `unifonic.service.ts` (SMS OTP) and the
  web-push service (P1-5/P1-20 machinery with categories, quiet hours, prefs).
- **users table is phone-first**: `phone` notNull unique; NO email column (plan-time).
- **Notification events inventory** (ActivityVerb enum + notifications service):
  `created_match, joined_match, followed, messaged, pom_decided, dispute_resolved,
  dispute_rejected, wallet_refunded, match_cancelled_admin, account_suspended,
  account_banned, account_unbanned, no_show_marked, host_underfilled_nudge,
  match_auto_cancelled, player_removed, report_resolved, match_rescheduled,
  venue_ownership_added, venue_ownership_removed` + web-push categories incl.
  `match_starting_soon` (scheduler) + `match_rescheduled`.
- **Prefs machinery already exists** (P1-20, migration-ed columns on users:
  `push_muted`, `quiet_hours_enabled/start/end`, per-category prefs, admin transactions
  notify-prefs). Emails must respect a channel decision, not invent a new system.
- **i18n**: PWA catalogs live in apps/player-pwa/src/messages/{en,ar}.json; admin in
  apps/admin/src/messages. The API has no mail templates today.
- **PDPL**: soft-delete ghosts (`deleted_at`) must never be emailed; hard-purge
  anonymization (phone → "deleted:<id>") shows the compliance bar.
- **Recent ops reality**: Go provider 429 killed runs #33/#34 at boot (fixed 10:45Z);
  DeepSeek probed 402 at plan time (expected, fallback skips it); glm-5.3-flash probe
  200 at plan time.
- **No join-approval emails**: P1-40 REJECTED by owner — do not smuggle approval-flow
  emails into the trigger list.

## 4. Fix:feat ratio / reactive-loop check

Last-20 audit at run time. If the ratio is high, this run is deliberately a
build-forward feature run (owner-directed) — record and proceed.

## 5. Recommendation

Proceed to Gates 1-3 (compact, folded into 01-program-design.md, already pre-staged),
with the one genuine open decision resolved as follows: **transport = Resend**
(pending owner key provisioning; see 01-program-design.md §Fallback).
