# Run #35 — Program design: transactional email layer (P1-41)

Compact Gates 1-3 doc (per factory compact mode). Directive: build the full
transactional email surface this run. **Reviewer: glm-5.3-flash.**

## Gate 1 — Scope (product)

IN scope (transactional, triggered by state changes users care about):

| # | Email | Trigger (existing code point) | Recipient |
|---|-------|-------------------------------|-----------|
| E1 | Welcome / account created | first successful OTP verification (auth.service verifyOtp, new-user branch) | new user |
| E2 | Match reminder ("starting soon") | matches.scheduler.ts reminder tick (same once-per-match guard as push) | confirmed players |
| E3 | Match rescheduled | `match_rescheduled` activity creation (matches.service rescheduleMatch) | roster |
| E4 | Match cancelled by admin | `match_cancelled_admin` activity creation | roster |
| E5 | Match auto-cancelled + refund | `match_auto_cancelled` (checkMinPlayers Pass 2, AFTER the refund tx commits) | roster |
| E6 | POTM winner announced | pom finalize tick in matches.scheduler.ts | winner (+ optionally roster) |
| E7 | Wallet refunded | `wallet_refunded` activity creation | affected user |
| E8 | Dispute resolved / rejected | `dispute_resolved` / `dispute_rejected` activity creation | reporter |
| E9 | Report resolved | reports.service resolve (`report_resolved`) | reporter |
| E10 | Suspension / ban / unban | admin moderation service activity creations | affected user |
| E11 | No-show marked | `no_show_marked` activity creation | flagged player |
| E12 | Removed from match by host | `player_removed` activity creation | removed player |
| E13 | Venue ownership added/removed | `venue_ownership_added/removed` activity creations | venue owner |
| E14 | Underfilled-match nudge to host | `host_underfilled_nudge` scheduler tick | host |
| E15 | Account deletion confirmation + 30-day purge warning | PDPL soft-delete path (users service delete) | deleting user |

OUT of scope (explicitly): promo/marketing (enum reserves it), join-request/approval
emails (P1-40 REJECTED by owner — do not build the flow either), chat DM emails
(noise), any email not tied to a real event row.

## Gate 2 — Architecture

```
apps/api/src/modules/mailer/            NEW module
├── mailer.module.ts        registers MailerService, exports it
├── mailer.service.ts       transport client + send() + retry + suppression checks
├── mailer.preferences.ts   resolves email opt-in/kill-switch per user
├── templates/
│   ├── layout.tsx          shared HTML shell (RTL-first, bilingual, brand header/footer)
│   ├── *.tsx               one component per email (E1-E15), props = typed payload
│   └── render.tsx          react-dom/server renderToStaticMarkup + plain-text fallback
└── mailer.spec.ts          unit tests (suppression, template render, payload mapping)
```

**Transport: Resend** (HTTP API, no SMTP ports on the VPS, generous free tier,
HTTP = same egress profile as Sentry/Unifonic/push already in use).
`RESEND_API_KEY` + `MAIL_FROM` in `apps/api/.env` (+ `.env.example` documented,
empty values). Graceful degradation: if the key is missing/empty or the API call
fails, log via Pino (`mailer` context) and NEVER throw into the caller — email is
best-effort side-effect, identical to push semantics. No provider? Feature
self-disables; all tests still pass (transport mocked).

**Addressing (the real constraint): users have NO email column today.**
- Migration (drizzle, next number): `users.email varchar(255) NULL unique-where-not-null`
  + `users.email_verified_at timestamp NULL`. NULL = no email = never emailed (majority
  of existing users; phone-first product).
- Collection points (this run, minimal): optional `email` field on signup completion
  (verifyOtp new-user path) + a small PWA "add email" field on the profile screen
  (optional, clearly marked). Verification flow: send verify link (signed,
  purpose:'email-verify') → set `email_verified_at`. Unverified addresses receive
  only the verification email, never transactional mail.
- Every send path: `WHERE email IS NOT NULL AND email_verified_at IS NOT NULL AND deleted_at IS NULL`.

**Trigger wiring pattern (mirror push, do not invent):** the run adds a
`notifyByEmail(event, payload)` call INSIDE the existing activity/notification creation
points listed in Gate 1 — same transaction boundary as the activity insert where one
exists (push already follows this shape; e.g. auto-cancel emails fire only after the
refund tx commits). No scheduler of its own; the email is emitted where the event row is.

**Preferences (v1, no new UI beyond the profile email field):**
- Column `users.email_muted boolean NOT NULL DEFAULT false` — global kill-switch,
  same shape as `push_muted`. Profile toggle joins the existing notifications-prefs UI.
- Quiet hours: NOT applied to transactional email (emails are not attention-interrupts;
  push keeps quiet hours). Record in report as a deliberate decision.
- Per-category prefs: reuse the P1-20 category enum where a category exists; new
  categories only for events with no push counterpart.

**Bilingual + RTL (KoraLink standard):** every template renders en + ar from
template-level dictionaries (NOT the PWA catalogs — mail is server-rendered; keep
mail copy in `templates/copy.ts` as `{ en, ar }` pairs). Layout: `<html dir>` switches
on recipient locale (users.locale if present, else `ar` — Saudi market default);
times/dates in Asia/Riyadh with Arabic locale formatting on the ar side; money in SAR.
Plain-text alternative generated from the same copy source.

**No client names / no phone numbers in email bodies beyond the recipient's own data.**

## Gate 3 — Contract checklist (verify BEFORE Gate 4)

- [ ] Migration number is next-in-sequence; `npm run db:generate` produces it;
      code + migration committed TOGETHER (Phase 4.5 rule), then `db:migrate`.
- [ ] New module compiles: `npx tsc --noEmit` in apps/api.
- [ ] Template render: unit test renders EACH template in en + ar, asserts
      `dir="rtl"` on ar and zero untranslated keys.
- [ ] Suppression unit tests: no email / unverified / muted / ghost (deleted_at) /
      P1-40-adjacent flows → mailer returns {skipped: reason} and transport never called.
- [ ] Every trigger point answers: which event, which recipients, what payload,
      failure = log-not-throw.
- [ ] `.env.example` documents RESEND_API_KEY + MAIL_FROM; no real secrets committed.
- [ ] `turbo run build` 3/3 green (if admin build OOMs → solo retry per run #21 pitfall).
- [ ] jest suites green; graphify update after new module.

## Gate 4 — Vertical slices (tracer-bullet order)

1. **Slice 1:** migration (email columns) + mailer module skeleton + transport client +
   suppression logic + specs. Commit. (Feature works end-to-end with zero templates.)
2. **Slice 2:** layout + copy dictionary + render pipeline + E5 (auto-cancel + refund)
   as the first wired trigger (money event, highest value). Commit.
3. **Slice 3:** remaining triggers E1-E4, E6-E15 wired; per-template specs; PWA
   profile email field + i18n keys. Commit.
4. **Slice 4:** `.env.example`, docs/plans cycle docs finalized, graphify update.

## Fallback

If Resend is unsuitable at run time (key absent is NOT a blocker — feature
self-disables; but if the owner vetoes the provider), the transport is one file;
swapping to SES/SMTP later touches nothing else. State the swap in the report.

## Out of scope (hard)

- Promo/marketing email. P1-40 join-approval mode (REJECTED — no flow, no emails).
- Bulk/backfill email to existing users (they have no addresses yet; collection
  happens organically via signup/profile).
- In-app notification changes beyond the email hook calls.
