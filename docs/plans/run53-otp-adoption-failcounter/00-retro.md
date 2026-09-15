# Run #53 Cycle — Dead-run adoption + API security slices

## Gate 0 — Retrospective (compact)

**Baseline:** origin/staging @ 03626a2 (run #52 report commit).

**Context:** the 2026-09-14T15:17Z factory fire DIED mid-run (lock pid 277842 dead,
0 STATE updates) but left behind: (1) a committed-but-unpushed OTP-hardening commit
`1bdf0fc` (single-use verifies via per-key mutex, run-#53-labelled, jest-claimed
green), and (2) an uncommitted coherent slice (OfflineBanner on match detail +
structure test). This run adopted both per the proven dead-run recovery recipe
(STATE OPS note, run #52).

**Findings at adoption:**
- 1bdf0fc re-verified locally before push: API jest 65 suites / 525 tests green;
  Reviewer A ( dispatched this run) verdict **APPROVE** — lock releases on throw
  (`tail.finally(release)`, otp-store.service.ts:142-150), no same-key nesting,
  `otpMatches` genuinely constant-time (timingSafeEqual + dummy burn), token mint
  outside the lock. Pushed as-is.
- Adopted PWA slice re-verified: pwa tsc 0, structure test 2/2, then full gates
  (turbo 3/3, vitest 80f/548t) → committed `a4adca6`, pushed.
- Standing bug-class sweep CLEAN (parent + Reviewer A): `::uuid` 0, `eq(col,null)` 0,
  console.* 0, FOR UPDATE on all four match transitions + wallet atomic-delta path.
  Reviewer A's `withTimestamp` findings (reports/disputes) REFUTED on inspection —
  all 5 sites already wrap `withTimestamp(...)`; the bare `match_players` set is
  correct (table has no `updated_at` — the known 500 trap).
- Reviewer B: run #52's 3 in-review claims ALL CONFIRMED (ecfab67 useNow posture +
  lib/format helpers + 4 MatchDetailsForm sites + time-ns i18n both locales;
  86723ea venueDetail 18=18 keys + EmptyState in 5 surfaces; 1066a29 club banner
  rendered). PWA i18n parity 947/947. → all promoted DONE.
- Sentry: WEB-D still accumulating (n=7) but latest event (23:10Z) is the known
  `:10000` zombie-tab signature (port closed, prod release 6bb22d3c pre-fix) —
  continuation, NOT a 5th survivor; root fix reaches prod at next promote.
  API: zero new issues since Sep 11.

**Layer rotation:** run 53 % 4 = 1 → API modules, security-lens emphasis. Matches
this cycle's picks (OTP verify paths).

## Gates 1-3 — Program design (the new slice: fail-counter charge-on-miss)

**Problem (Reviewer A minor, verified real):** `verifyPhoneChange`
(users.service.ts ~:609) charges the shared fail counter ONLY when the claim
returned a code (`if (storedCode) incrementFail`). A missed claim — expired code,
replayed code, or one consumed by a concurrent verify — returns 401 WITHOUT
charging. An attacker racing replays gets unlimited free guesses against the
6-digit space per code window; the lockout never advances.

**User story:** as the auth system, I must charge every failed phone-change verify
attempt so the FAIL_LIMIT lockout bounds all brute-force paths, not just
wrong-code ones.

**Contract (unchanged externally):** all failure shapes stay identical
(401 Invalid/expired, 429 lockout, 409 phone-taken). Only the counter side-effect
changes: `incrementFail(newPhone)` becomes unconditional on the failure path
(after the lockout check, which throws 429 without charging further). This mirrors
the login + email-verify flows, which charge on ANY wrong-or-missing code.

**Scope:** users.service.ts (one guard removal + comment), users.phone-change.spec.ts
(new case: missed claim charges; existing cases unaffected). NO DB, NO i18n, NO PWA.

**Gate 3 checklist:**
- [x] No API response shape change — 401/429/409 payloads byte-identical
- [x] No frontend type affected (no DTO/controller change)
- [x] Spec additions mirror the real claim/consume mock semantics already in the file
- [x] Observability: no new surface (counter is in the existing OtpStore cache)

## Gate 4 — slices
1. `a4adca6` — adopted OfflineBanner slice (committed + pushed, gates green).
2. 1bdf0fc — dead session's OTP hardening (verified + pushed).
3. THIS — charge-on-miss fail counter + spec (this doc's subject).

## ADMIN STATE CHECK
Item touches neither apps/admin nor partner/admin API modules — check not required
this cycle (no admin-area item picked).
