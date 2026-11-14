# Run #131 — Cycle: P2-189 AR-polish batch (PWA lane)

Cycle dir: `docs/plans/run131-p2-189-ar-polish/`

## Gate 0 — Retrospective (compact, autonomous mode)

**Baseline commit:** `ae4209f` (run #130's last code commit) → HEAD `7da2b0c` (docs only since).

**Recent-commit pattern (last 5 code cycles):** #126–#130 all shipped as PRs (#118–#126) with
bot checks + squash; fix:feat ratio healthy (2 fixes in 5, both caught by PR-Agent/live E2E,
not post-merge incidents). No reactive-fix loop.

**DECISIONS.md consulted FIRST (Gate-0 supremacy):** Drawer stays RIGHT (d0862a7) — this
cycle's RTL work is arrow-mirroring only, no direction flips; EN+AR always (both message
files touched for any new key); defaults+48h-veto register has NO open clocks. No contradiction.

**Verification of run #130's claims (claims ≠ facts, done BEFORE picking the build item):**
- P2-192: `typeof dto.version === 'number'` guard at disputes.service.ts:393 +
  reports.service.ts:273 (both), write-concurrency.spec = 26 `it()` cases with
  `sqlToQuery(...).params` assertions (:389/:529/:605/:641), PRs #125 `ebd9fd4` + #126
  `ae4209f` in HEAD lineage, 0051 columns live in information_schema (disputes + reports,
  integer DEFAULT 1), admin UI `version: d.version` echo (disputes/[id]:130,
  reports/[id]:78) + `common.editStale` in both locales, mirror cards t_462d604c/t_745f6744
  exist. **→ DONE.**
- LIVE stale-save 409 repro (this run, non-mutating): dev-login 200 → detail v=3 →
  PATCH `{decision:null, version:9999}` → **409 `{"message":"This dispute was edited by
  another admin…","version":3}`** — fresh-version echo correct. Probe-tooling notes:
  list envelope carries no `version` (fetch detail first); the foreign `e2e-run1` row
  400s on UuidParamPipe (harmless); DTO fields are decision/internalNote/version (NOT status).
- P2-191 + P2-194: independently re-verified by Reviewer B — all sub-claims TRUE (see
  RUNS report). **→ stay DONE.**

**Tech-debt scan of the area this cycle touches:** Reviewer A found the migration chain
healthy (53 entries, idx 0–52 contiguous, prevId chain verified programmatically, tripwire
specs pinned). Standing classes all zero (`::uuid` 0, `eq(col,null)` 0, unescaped ILIKE 0,
console.* 0). Hex drift api_exc_total 271→273 attributed to run #130's own merged guard
throws (disputes:423, reports:301) → baseline updated to 273, `improved +`.

**Gate 0 verdict: proceed to Gate 1.** New findings → board rows P2-200/201/202 (P2-200
deduped against run-#57 card t_f5acec90 in the mirror).

## Gates 1–3 — Compact program design

**Problem (user story):** As an Arabic-first player, dates inside reviews/chat/messages
must render Gregorian Arabic (not Hijri), stat numbers must use Arabic-Indic digits, back
arrows must point the right way in RTL, share text must be in my language with localized
date/price, and the club back button must be labelled for screen readers.

**Scope:** apps/player-pwa ONLY — 5 sub-items (a)–(e) as scoped on board row P2-189
(≈21 file:line sites). OUT: apps/api, apps/admin, Drawer/direction changes, new surfaces.

**Architecture delta:** none (render-level fixes + i18n keys reusing existing helpers:
`resolveDateLocale` date helpers, `formatCount`, `rtl:-scale-x-100` convention).

**API JSON shapes:** none touched.

**TS signatures:** component-internal only (helper calls `formatDate(d, locale)` style,
existing exports — no signature changes).

**i18n key contracts:** new keys for (d) share text + (e) aria-label —
`match.shareText` (EN + AR, date/price interpolated via existing helpers) and
`common.back` (EN "Back" / AR "رجوع") if absent; BOTH `messages/en.json` and
`messages/ar.json`, leaf parity enforced (programmatic diff, 1089/1089 today).

**Gate 3 contract checklist:**
- [x] No mutation endpoints touched → mutation-return contract N/A
- [x] Frontend types unchanged (render-level only)
- [x] Adapter functions untouched
- [x] No field silently undefined (no data-shape changes)
- [ ] i18n keys exist in both languages — VERIFIED AT GATES (parity diff after lane lands)

**Gate 4 (slices):** lane executes as ONE batch (all five sub-items are small render edits);
parent re-applies → real gates (turbo `--concurrency=1`, vitest, type-check) → PR.

## 00-status.md (compact)

| Gate | Name | Status |
|------|------|--------|
| 0 | Retrospective | ✅ DONE (this doc) |
| 1 | Product Spec | ✅ compact (above) |
| 2 | Architecture | ✅ compact (above) |
| 3 | Program Design | ✅ compact (above) |
| 4 | Vertical Slices | ⏳ lane running (zeroshot 01a139f8) → parent gates → PR |
