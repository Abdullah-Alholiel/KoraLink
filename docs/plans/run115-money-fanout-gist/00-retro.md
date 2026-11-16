# Run #115 — Gate 0 Retrospective (compact, autonomous mode)

**Cycle:** DB & Infra lane (115 % 4 = 3) · HEAD at start `c2027bc` · 2026-10-09 01:16Z

## DECISIONS.md check (Gate-0 supremacy)
Read first. No design/UX change proposed this run touches a ledger standard
(Drawer RIGHT untouched; EN+AR untouched; money rules extend P2-4, they do not
contradict it). Veto-clock rows NOT touched: elapse 2026-10-09T02:30Z is ~1h14m
after this run's fire (01:16Z) — per run #113's clock-math correction, run #116
(10:15Z) is the first eligible builder.

## Recent-commit audit (last 6 on touched area)
- `c2027bc` run #114 docs · `8fc8a26` P2-170 owner LEFT JOIN · `058574c` P2-166 i18n labels
- `2000157` P2-167 venues LEFT JOIN sweep + UuidParamPipe · `8940913` P2-165 entry points
- fix:feat ratio healthy (hardening + review-driven fixes; no feature churn).

## Tech-debt / hotspots found
1. **GiST journal gap (→ P2-171, built this run):** `matches_location_gist_idx`
   lived only in `gist_indexes.sql` (docker initdb); 0036 had fixed venues but
   skipped matches. Found by Reviewer A this run; fresh-DB rebuilds silently
   lost the discovery-feed index.
2. **Float money paths (→ P2-168, built this run):** reschedule/create cost
   derivation + floor messages still on `parseFloat`; wallet guards could 500
   on a vanished user row (`parseFloat(undefined)`).
3. **Silent fan-outs (→ P2-169, built this run):** 8 `.catch(() => undefined)`
   sites hid notification/push/email failures (P2-125 discipline).

## Sentry / error-log triage (Phase 1.6)
- `KORALINK-API-1H/1J/1K/1M` (staging, Oct 7 02:04Z, 6 events): favorites
  500-cluster. Verified = run #109's own pre-migration probe window (table
  missing at 02:04:11 → GROUP BY bug at 02:04:28 after apply; source fixed same
  day). LIVE E2E this run: dev-login → add 201 → ids 200 → list 200 → remove
  200; zero journal errors. MINOR/no new row (P2-161 already DONE).
- `KORALINK-API-1C/1E` (production, Sep 24-25): old-prod Neon quota errors —
  pre-cutover history. MINOR.
- `KORALINK-API-B` CORS `127.0.0.1:3402` ×124: local probe noise. MINOR.
- `KORALINK-WEB-6` viewport-diagnostic ×54/24h: ViewportHeightSync.tsx
  diagnostic capture (known accepted noise). MINOR.
- `KORALINK-WEB-2/-8/-C/-B` SW registration errors: kora-link-player-pwa.vercel
  .app SW scope/security — PWA-vercel deploy surface, pre-existing. MINOR.
- No P0/P1-new signatures. Email errors = known P1-41 blocker (owner pending).

## Contract verification checklist (Gate 3, run before Gate 4)
- [✓] No new endpoints; mutation contract untouched (no `findOne` changes).
- [✓] `moneyToNumber/centsFromMoneyString` preserve legacy values exactly
      (85.50 → 85.50); spec pins the round-trip + the 0.1+0.2 → 0.30 case.
- [✓] Error-message format UNCHANGED (`Required: SAR x, Available: SAR y`) —
      regex-pinned by existing reschedule specs (parity requirement).
- [✓] Migration 0047 journal entry = FULL run-#39/#103 contract (version:'7',
      breakpoints:true, prevId-linked snapshot). First bare-shape attempt was
      CAUGHT by the gate tripwire suites — the guard works; fixed same run.
- [✓] fanout helper never rethrows; `.catch` semantics preserved (best-effort).
- [✓] i18n: no new user-facing strings (API-side only).

## Verdict
Proceed to Gate 4 (vertical slices): slice 1 = money math + fanout helper +
specs; slice 2 = migration 0047 + journal/snapshot contract. Both shipped in
PR #100 (squash `b11a137`).
