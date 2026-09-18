# Run #58 Cycle — Remove dead `/wallet/pay` endpoint (reviewer-B P1 resolution)

Cycle: `run58-review-sweep` · Mode: autonomous · Owner: factory cron (no user present)

## Gate 0 — Retro (wallet module + review findings)

**Area audited:** `apps/api/src/modules/wallet/` + run #57's landed commits (verified by reviewers
this run, see `kanban/RUNS/2026-09-18T01-18Z-run58.md`).

**Findings:**
1. **[REAL — build this cycle] Reviewer-B P1: `POST /wallet/pay` accepts a CLIENT-SUPPLIED amount
   for a `MATCH_FEE` DEBIT** (`wallet.controller.ts:92-107` → `recordTransaction({type:'DEBIT',
   amount: dto.amount, referenceType:'MATCH_FEE'})`; `wallet.service.ts:98-128` debits exactly what
   it is given — no re-pricing, no match linkage). Parent verification:
   - The **authoritative** join-fee path charges server-side inside the join tx
     (`matches.service.ts:1626-1645`: `chargeMatchFeeTx(tx, userId, matchId, price, feeKey)` with
     `price = Number(match.price_per_player)` — the client cannot influence it).
   - `/wallet/pay` has **zero consumers**: `usePayWallet` (useWallet.ts:103-121) is referenced by
     no component/page; no PWA test or API test references `/wallet/pay`; no spec pins the route.
   - Verdict: dead legacy surface from the pre-0040 payment design. Today it can only pollute the
     ledger (client-priced MATCH_FEE debits that no roster row ever references — refund/forfeit
     sweeps key off `fee_paid_sar`, so such rows are invisible to the money cycle). Under P0-2 it
     would resurface as a confused pricing boundary. **Removal per the standing 'Remove X = entire
     feature across stack' convention.**
2. **[FIX-FIRST, non-blocking → board] Reviewer A:** (a) `requireActiveUser` on WS handlers is
   convention, not structure — a new `@SubscribeMessage` handler can silently skip it; (b)
   `LanguageToggle` `ariaLabel` defaults to untranslated English — make it required; (c) owner's
   DataTable (uncommitted) keyboard activation lacks Space + row role.
3. **[MINOR] Admin `users.service.ts:238-240`:** "unban while still suspended" never disconnects
   (gate checks `banned_at !== null || suspended_until !== null` — unban sets `banned_at: null` but
   suspension may persist); per-message gate still blocks the socket, cosmetic only.
4. fix:feat ratio healthy; Sentry 24h clean; i18n parity intact in the sibling diffs.

**Decision:** proceed to build finding 1 (small, self-contained, API+PWA-hook only, no i18n
surface, no owner dependency). Findings 2-3 → BOARD.md rows. ADMIN items stay held.

## Gates 1-3 — Program design (compact)

**Problem:** an authenticated user can POST `/wallet/pay` with any amount and mint a MATCH_FEE
ledger debit disconnected from any roster/fee snapshot.

**User story:** as the API, I expose exactly one wallet-mutation surface (topup, flag-gated) so the
upcoming P0-2 payment-provider work has a single pricing boundary; match fees flow ONLY through
`joinMatch`'s in-transaction server-priced charge.

**Scope:** IN — delete `WalletController.pay()`; delete `usePayWallet()` hook; jest pin that the
route handler no longer exists (topup stays). OUT — wallet.service (untouched), schema (untouched),
i18n (nothing user-facing), topup flag behavior (untouched), docs/plans history.

**Architecture delta:** none (pure deletion). No migration. API restart after build.

**Contract (Gate 3 checklist):**
- [x] Every mutation endpoint returns populated object — unaffected; the removed endpoint had no
      consumer contract to preserve (zero call sites, zero tests).
- [x] Frontend types accept backend JSON — `useWallet.ts` keeps `useWalletBalance` /
      `useWalletHistory` / `useTopupWallet` untouched; the deleted hook had no importers.
- [x] Adapter functions — none referenced `/wallet/pay`.
- [x] No field silently undefined — n/a (deletion).
- [x] i18n keys — none added/removed (no user-facing string).
- [x] Post-removal shape: `POST /api/v1/wallet/pay` → Nest 404; `topup` 403-gate behavior unchanged
      (jest pins remain green); `joinMatch` fee path untouched.

## Gate 4 slices
- Slice 1: API deletion + jest pin (this commit).
- Slice 2: PWA hook deletion (same commit — one removal, two files, per the user's
  'entire feature across stack' convention; split only if gates force it).

## Verification plan
jest wallet specs (controller + service + topup-flag) · `npx tsc --noEmit` api+pwa ·
`npm run build` root zero errors · `npx vitest run` PWA green (`Test Files … passed` grep) ·
API service restart post-build + /health 200.
