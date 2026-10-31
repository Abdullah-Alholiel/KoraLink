# Run #107 — LIKE-escape sweep (P2-158) + CSV wallet null (P2-157) + reschedule success i18n (P2-159)

**Lane:** DB & Infra rotation (107%4=3). Slot directive: P2-147 HOLD STRICT (clock elapses
10:16:xxZ; this run fired 10:16:38Z — building 38s into the window would gut the 48h veto;
#108 builds it). Strix: not due (Nov 1–3). Budget ~3h.

## Gate 0 — Retrospective (what this touches)

- **DECISIONS.md consulted FIRST** (owner-standards doctrine): no entry conflicts with any
  item below. Both fixes ARE standards enforcement (csvAmount money contract; EN+AR copy).
- **P2-156 verified (claims ≠ facts):** (1) route is `PATCH :id/schedule` (matches.controller
  :252) — deployed dist carries it; live probe 401 via :8443 (guard fires; route present);
  (2) `rescheduleWalletShortfall` present in the served PWA chunk (match detail page chunk);
  (3) tree gates re-run green this run. P2-156 → DONE.
- **Admin state check (mandatory):** `git status apps/admin + partner/admin modules` → clean;
  `koralink-admin.service` active; last admin commits 9891e46/749b915/92639cc. No owner WIP →
  P2-157 GO.
- Run #105/#106 left no in-flight half-work; tree was clean at lock acquisition (10:16Z).
- Service snapshot: api/pwa/admin all active; API /health 200; **zero** journal errors 5h.
  Sentry: no new P0/P1 signatures (API-B = localhost CORS probes 09-03; API-1C = frozen
  old-project 09-25; API-1B = P1-41 log-only email; WEB-* = known SW/hydration noise).
  Per-IP OTP proof point still open (zero send-otp traffic in window).

## Findings driving the build (both reviewers, glm-5.3-flash, ~110s each)

- Reviewer A (DB/Infra lane): standing bug classes all CLEAN (::uuid casts, FOR UPDATE
  coverage, console.*, CSP/CORS, trust-proxy/OTP caps, snapshot parity 0043–0045). One
  IMPORTANT: **LIKE wildcards unescaped — not 1 site (board row P2-158) but 6** (venues
  city+search, admin venues search+city, admin users, admin pitches, matches neighborhood,
  users handle search). audit.controller.ts:24-27 already escapes (the precedent).
- Reviewer B: P2-156 verified ✓; parity 1032/1032; ONE new defect: **hardcoded English
  success toast** `useMatchActions.ts:359` — boarded as P2-159, built this run.

## Gates 1–3 (compact contracts)

1. **P2-158** — `escapeLikePattern(term: string): string` in
   `apps/api/src/common/utils/escape-like.ts` (regex `/[\\%_]/g` → `'\\' + m`, identical to
   audit.controller). Every touched ILIKE gains `ESCAPE '\'`. No API shape change (search
   results only). Spec: `escape-like.spec.ts` (3 tests: wildcards escaped, plain terms
   untouched, reference-parity). **Live-PG verified before writing code**: runtime
   `ESCAPE '\'` (single backslash) valid — literal `%` hit=true, non-literal miss=false.
   (Template-literal trap: on-disk `\\` in a TS template yields a runtime single `\`; the
   JSON-encoded tool output displaying 4 chars was a display artifact, resolved by probe.)
2. **P2-157** — users CSV wallet cell: `csvAmount(u.wallet_balance)` (null → blank, matches
   transactions/settlements exporters). Karma/no-show stay `String(?? 0)` (counts, not
   money; null≈0 legitimate). No schema/API change.
3. **P2-159** — `reschedule.success` key EN+AR; hook uses `useTranslations('reschedule')`.
   Parity 1033/1033 after (+1 key both locales).

Gate 3 checklist: no mutation-shape changes (read-path only) ✓; frontend types untouched ✓;
adapters untouched ✓; i18n keys added both locales before wiring ✓.

## Gate 4 — Vertical slices (built, PR flow per v1.5.0)

| Item | PR | Commit | Verification |
|---|---|---|---|
| P2-158 | [#87](https://github.com/Abdullah-Alholiel/KoraLink/pull/87) | 01c3b69 | jest 98/883 + escape-like 3/3; tsc 0; live-PG semantics probe |
| P2-157 | [#88](https://github.com/Abdullah-Alholiel/KoraLink/pull/88) | 98e0531 | admin build green (turbo 3/3); matches existing csvAmount tests |
| P2-159 | [#89](https://github.com/Abdullah-Alholiel/KoraLink/pull/89) | dc3027c | vitest 122f/898t green (grep-confirmed); type-check 0; parity 1033/1033 |

Full-tree gates before push: `npx turbo run build --concurrency=1` 3/3 exit 0; PWA vitest
122/122 files, 898/898 tests; API jest 98 suites / 883 tests; pwa `npm run type-check` 0.
