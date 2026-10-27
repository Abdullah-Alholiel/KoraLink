# Gate 0 — Retro: locale-aware transactional email (run #168)

## Area audit
- **Premise correction (parent code-read, overrides Reviewer B #167):** `mailer.service.ts:109`
  pins `locale:'ar'` for all bulk recipients, but the claimed `users.locale` column
  (schema.ts:772) does NOT exist on users — that line is `push_subscriptions.locale`. The fix
  is therefore a small vertical slice, not a one-line resolution: add `users.locale`, resolve
  in the mailer, sync from the PWA language toggle.
- **Affected send sites:** `recipientsFor()` (bulk: payout_requested, match_cancelled admin,
  welcome via sendToUsers) + `sendVerificationEmail()` (:173, also pins 'ar').
- **Toggle mechanics:** LanguageToggle (components/common/LanguageToggle.tsx) is THE one
  switcher (2026-09-17 consolidation). It routes through navigatePreservingLocale + full
  reload. Server sync = fire-and-forget PATCH with keepalive, fired in switchTo before the
  reload; silent 401 catch on pre-auth surfaces (/login) is acceptable — documented.
- **Signup-time locale:** OUT OF SCOPE (would touch auth DTOs); new users default 'ar'
  (Saudi market default — matches the mailer's existing hardcode and the product's
  Arabic-first stance). Follow-up note on the board row.
- **DECISIONS.md check:** no design/UX change — mail copy follows the user's own chosen
  language; no ledger conflict. No Defaults+48h-veto row involved (P2-264 is a plain
  Reviewer finding, not a defaulted decision).

## Standing state (verified this run)
- Hex drift +5/+3 = run #167's already-attributed slices; zero new code commits since.
- PR #176 (P2-216) merged Oct 25 — board row stale, closing verified-no-build this run.
- PR #178 (promote) still OPEN+MERGEABLE, gated on P1-52 Neon quota (owner).
- Sentry 24h: 46 quota (P1-52), 130 CORS scanners (prod, pre-P2-110 build — ships with
  #178), 8 push-sweep + 5 venue_favorites failures = ALL the same Neon quota class.
