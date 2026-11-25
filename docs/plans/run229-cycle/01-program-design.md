# Run #229 — Gate 0–3 compact (P2-344 + API hardening bundle)

Lane branch: `lane/run229-p2-344` from origin/staging @ 704a8bc0.
Worktree: ~/worktrees/koralink/run229-p2-344 (real npm ci — runbook §3.9).

## Gate 0 — Retrospective

- **Claims ≠ facts on run-#228 handoff (both directions):**
  - VERIFIED TRUE: PR #295 `d1c771ac` MERGED (reviews page `can(role,'review.moderate')`
    at reviews/page.tsx:52; token in rbac.ts:113/:136). PR #296 `ede223e7` MERGED
    (personal-room `waitlist-promoted` + charged toast, page.tsx:155-165; i18n parity
    machine-checked 1331=1331 pre-run).
  - REFUTED (reviewer claims dissolved by parent code read):
    (1) Reviewer-A hex drift `pwa_raw_fetch 1→2` — FALSE: parent hex-audit reads
    **clean @355/27/1**; useTurnstileEnabled raw fetch is already in the P2-376 baseline.
    (2) Reviewer-B P1 "no push when a backgrounded user is charged on promotion" —
    FALSE: waitlist.service.ts `notifyPromotion` Leg 2 (P2-333, run #200) already sends
    the charged web push (`waitlist_promoted` with amount vars, category 'match').
    (3) Reviewer-A join-lobby "no match-status guard admits queued players into
    Cancelled/Completed rooms" — FALSE: waitlist rows are deleted in the SAME tx as
    cancel (matches.service :3395) / complete (:3242) / kick (:228,:297,:329,:388) —
    the scenario is unreachable (row-presence check is status-safe by construction).
  - REAL residual (kept): Reviewer-A cancelMatch held-flip rowCount note — verified
    cosmetic-in-behavior (WHERE-guarded, idempotent) but observability-only gap → built
    this run as the API hardening item.
- Sentry triage: 1F/1C/1Q/1R families all terminate in the Neon quota error; 1F stack
  paths `/app/apps/api/...` = PROD Render stale build's daily push-subscriptions cleanup —
  zero staging impact, heals at the owner's Coolify cutover. Web project: 3 singleton
  payment-flow errors (1/24h each). Nothing new code-level.
- ADMIN STATE CHECK: apps/admin + partner modules CLEAN (no in-flight owner work).

## Gate 1 — Product spec (P2-344)

- **Problem:** when a player's wallet can't cover join / publish / weekly-repeat /
  no-show fee, the API returns 400 `{ message, code: 'WALLET_INSUFFICIENT' }`
  (matches.service :2404/:2676/:3829/:3870 — PR #262 convention), but the PWA's
  `classifyError` has no WALLET_INSUFFICIENT branch → the error lands in the generic
  `validation` bucket: "Invalid input" copy that says neither what happened (money)
  nor the fix (top up). Violates the error-message standard (what/why/next, EN+AR).
- **User story:** as a player attempting a money action with insufficient balance, I see
  "Your balance is not enough for this. Top up your wallet and try again." (AR mirror)
  instead of a generic validation error.
- **IN:** classifier kind + code mapping + EN/AR copy + test pins. **OUT:** per-amount
  copy (balances never rendered client-side), wallet-surface redesign, new endpoints.

## Gate 2 — Architecture delta

- `apps/player-pwa/src/lib/error-classify.ts`: + `insufficientFunds` ErrorKind,
  + `WALLET_INSUFFICIENT` in CODE_KINDS (code beats 400 status — CODE_KINDS read
  before status in classifyError), + ERROR_KEYS entry. Pure module, no imports —
  hex-clean. PaymentSheet (:103) + any `t(errorKey(classifyError(err)))` consumer
  picks the new copy with zero surface change.
- `apps/api/src/modules/matches/matches.service.ts`: two held-flip sites gain the
  driver-tolerant affected-rows read (rowCount ?? count ?? 1, mirror of the :141
  settle-guard precedent) + `host_payout_hold_lost_race` warn breadcrumb. P2-262:
  two `let refundRecipients` → `const` (lint sweep).
- Files: 3 modified src files + 2 message files + 1 test file. No DB, no endpoints,
  no new surfaces.

## Gate 3 — Contract (verification checklist)

- [x] Every mutation contract unchanged: no endpoint/DTO/service-signature touched;
      behavior identical on the happy path (affected===1 default → no warn).
- [x] Frontend type accepts backend shape: FetchError.code already plumbed
      (fetcher.ts:153-154); CODE_KINDS keys match the API's thrown codes exactly.
- [x] i18n keys exist in BOTH locales: `errors.insufficientFunds` en.json/ar.json
      (parity 1332=1332, machine-checked post-edit).
- [x] No field silently undefined: copy is static text (no interpolation) — no
      ICU args to drift.
- [x] Copy standard: what happened (balance not enough) + why (this action costs
      more than you have) + what next (top up) — EN+AR, no raw backend text.
- [x] Spec pins: code→kind mapping + bare-400 fallback (deploy-skew safety) added
      to test/lib/error-classify.test.ts (18 tests green in-lane).
- [x] Jest touched suites green (money-notify / host-payout / cancel-refund /
      auto-cancel-atomicity + migration tripwires 6/6, 31 tests).
- [x] Full api tsc --noEmit = 0 errors (run-#228 lesson applied).
- [x] Sequential turbo build (--concurrency=1) = 3/3 zero errors.
