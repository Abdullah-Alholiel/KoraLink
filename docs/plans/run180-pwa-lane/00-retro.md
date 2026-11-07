# Run #180 Cycle — 00 Retro + Program Design (PWA screens lane)

Run: #180 · 2026-10-31T01:17Z · branch lane/run180-p2-289 (PR #203) · session glm-5.3-flash (zai)

## Gate 0 — Retro (area audited: wallet/top-up PWA surface + hex + Sentry triage)

- DECISIONS.md read first: no ledger row contradicts this slice (wallet top-up stays
  production-gated dummy; this run changes ONLY amount-entry UX client-side, zero API change,
  zero money-movement change).
- Recent commits audited: 9be7707 (P2-284 scoped settlements), ad18405 (P2-287 pending-card
  polling), b12c9a1 (P2-286 CSV paid columns) — all merged via PRs #200-#202, verified this run
  by Reviewer B (claims≠facts: all three CONFIRMED at code level).
- Contract drift FOUND (this run's headline): legacy top-up sheet enforced `amount < 10`
  (wallet/page.tsx:193 old) while the API contract is MIN_TOPUP_SAR=5
  (dto/topup-intent.dto.ts:10) served via GET /wallet/topup/config → minAmount. Legal SAR
  5–9.99 top-ups were rejected client-side; no client max check existed; hint copy hardcoded
  "Minimum SAR 10"; i18n key baked the wrong number in BOTH locales.
- Hex drift +2/+1 (api_exc_total 323→324, api_raw_sql 62→64) attributed to PR #202's guard
  + raw-SQL blocks (ALLOWED class) — baselined as board P2-290, hex-audit.mjs updated.
- Sentry triage: 1C Neon quota 66/24h (CROSSED the ≥60 flag — owner billing action, gates
  promote PR #178); push_subscriptions delete failure (12/24h) deduped INTO 1C — same
  PostgresError underneath (daily 03:07 cleanup cron), not a separate bug.
- Reviewer B's P1 "profile stats dead-end" REFUTED by parent code-read (localized error +
  retry already at profile/page.tsx:290-292) — P2-247 closed COMPLETE instead.
- fix:feat ratio healthy; no new CRITICAL/IMPORTANT findings from Reviewer A (PWA lane clean).

## Gates 1-3 — Compact program design (P2-289 top-up amount UX)

- **Problem**: top-up entry is free-input-only on the sheet staging players see; bounds
  hardcoded client-side drifted from the server contract; no presets.
- **User story**: as a player, I tap a preset amount chip (or type an amount) and get
  immediate, server-accurate bounds feedback in my language before any payment round-trip.
- **Scope**: PWA-only; shared domain module `lib/topup-amount.ts`
  (TOPUP_QUICK_AMOUNTS=[25,50,100,200], validateTopupAmount → ok|empty|invalid|belowMin|aboveMax);
  legacy sheet wires min/max from `useTopupConfig()` (fallback 5/2000 == API consts);
  Moyasar TopupSheet routes validation through the shared validator + adopts shared presets;
  dead `wallet.minTopUp` removed EN+AR.
- **API contract deltas**: NONE (config endpoint already serves minAmount/maxAmount —
  wallet.topup.service.ts:103-117). No migration. No new endpoints.
- **i18n contract**: `wallet.topup.invalidAmount` ("Amount must be at least SAR {min} and at
  most SAR {max}." / "المبلغ يجب أن يكون {min} ر.س على الأقل و{max} ر.س على الأكثر.") reused
  for both hint + error; `wallet.minTopUp` deleted both locales (leaf parity 1170=1170);
  `wallet.topup.quickAmounts` already existed (aria-label).
- **TS signatures**:
  - `validateTopupAmount(raw: string, min: number, max: number): 'ok'|'empty'|'invalid'|'belowMin'|'aboveMax'`
  - `TOPUP_QUICK_AMOUNTS: readonly number[]`
- **Contract verification checklist**:
  - [x] No mutation endpoint touched — mutation contract rule N/A.
  - [x] Frontend types accept the JSON the backend produces (TopupConfig.minAmount/maxAmount
        already typed in useTopup.ts:15-20; page passes them through).
  - [x] No field silently undefined — config falls back to 5/2000 (matches API consts) while
        config loads.
  - [x] i18n keys exist both locales (deleted key verified dead repo-wide before removal;
        parity script-verified).
- **Gate 4 slices**: (1) domain module + 16-case spec; (2) TopupSheet rewiring (chips source +
  validator) + 1 chip-interaction spec; (3) legacy sheet chips + config-driven validation +
  i18n surgery. All in one commit (one vertical slice, single PR #203).

## Verification evidence (this cycle)

- vitest: 153 files / 1153 tests green (incl. 17 new cases).
- `npx turbo run build --concurrency=1`: 3/3 exit 0 (PWA solo rebuild after the one lint
  failure — unused import — fixed same-run).
- PWA `tsc --noEmit`: 0 errors.
- i18n leaf parity: en 1170 = ar 1170.
- Hex lane: clean @ new baseline 324/64 (P2-290).
