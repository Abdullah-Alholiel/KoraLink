# Waitlist Promotion Money Loop — Program Design (run #200)

Covers Gates 1–3 compact (autonomous mode). Board item: P2-333 (re-scoped) + Reviewer B
run-#200 CRITICAL #1 + IMPORTANT #2.

## Problem (user story)

A paid match's spot frees while a player is on the waitlist. Today three things go wrong:
1. If the queue head can't afford the fee, the LEAVER's own leave/cancel transaction rolls
   back — nobody can leave while an underfunded player queues (wedge, CRITICAL).
2. If the spot frees via the ≥4h refund path or a host kick, the promoted player is seated
   on a PAID match charged SAR 0 (free-seat leak, money invariant broken).
3. Even on a successful paid promotion, an offline player wakes up to an unexplained wallet
   debit: the push says "you're in" with no amount, and the wallet shows
   "Match Payment #a3b2c1d4" with no match name.

## Scope

IN: promotion-charge correctness (skip-underfunded-head + resequence-continue), both free-
seat leaks, push payload amount + localized push body variant, wallet history match-title
enrichment, PWA adapter + history hook + page rendering, specs for every pin.
OUT: wallet top-up nudge at waitlist-join (boarded separately, P1 product gap), no-show fee
policy (owner-gated P2-329), refund-window policy change (P2-332 owner-gated), waitlist caps.

## Architecture delta (no schema change — reference_id join enrichment)

- `WaitlistPromotion` gains `chargedSar: number | null` (null = free match promotion or
  uncharged path — never rendered as 0.00 to avoid implying a charge).
- `promoteNextInTx(tx, matchId, opts?: { feePriceSar?: number })`:
  - paid backfill path (caller passes `feePriceSar`): read head's balance in-tx FIRST;
    insufficient → `continue` (delete+resequence+next head) instead of throw. There is NO
    separate `requireCharge` flag — a caller passing `feePriceSar` always demands payment
    (skip underfunded heads), and omitting it is the free-match path. Balance pre-read is
    advisory-only; `chargeMatchFeeTx`'s negative-balance guard stays the authoritative check
    (concurrent debit can still land between read and charge → aborts tx → caller retry;
    documented + spec-pinned). IMPLEMENTATION NOTE (run #200, PR-Agent r1 catch): the
    initial draft of this doc declared a `requireCharge` option that the final design
    folded away — this paragraph is the corrected contract.
  - The paid path MUST only run when the freeing episode was paid; callers decide.
- `matches.service.ts` `leaveMatch`: ≥4h path passes `{ feePriceSar: feeSar }`;
  host-kick path passes `{ feePriceSar: <removed player's fee> }`; free-match/legacy path
  unchanged (no opts).
- `notifyPromotion` sends `amount` push var when `chargedSar != null`; push-text
  `waitlist_promoted` gains charged copy (EN+AR) using the existing `PushVars.amount`
  Intl pipeline (refund_credited precedent).
- `GET /wallet/history`: MATCH_FEE/REFUND rows enrich `reference_id` → match title via one
  LEFT JOIN on matches (id columns varchar(36), `::text`-safe; idempotency: rows already
  carry the join key). Response rows gain OPTIONAL `match_title` (older-client tolerant).
- PWA: `TransactionApi.match_title?: string`; `buildTransactionTitle` uses it for MATCH_FEE
  (+ REFUND when present); no new i18n keys (title is data, not copy).

## Exact contracts (Gate 3)

### API
- `WaitlistPromotion = { userId: string; previousPosition: number; matchTitle: string;
  chargedSar: number | null }`
- `promoteNextInTx` returns null when: no head / roster full / ALL heads unchargable.
  Does NOT throw for underfunded heads (only genuine infra errors propagate).
- Push payload: `{ key: 'waitlist_promoted', vars: { title, amount? }, data: { type:
  'waitlist-promoted', matchId }, category: 'match' }` — amount present iff charged.
- `GET /wallet/history` row: `{ ...transactions columns, match_title?: string | null,
  total }` — match_title only populated for match-referencing rows (MATCH_FEE, and REFUND
  with match reference_id).

### Frontend
- `TransactionApi.match_title?: string | null`
- `adaptTransaction`: MATCH_FEE title = `row.match_title ?? 'Match Payment'`; REFUND with
  match_title = `Refund — <match_title>`; legacy raw-id suffix REMOVED for MATCH_FEE when
  match_title exists (fallback keeps current string when absent).
- Hook `useWalletHistory` passes rows through `adaptTransactionList` unchanged in shape.

### i18n keys (EN+AR, parity enforced)
- push catalog (API-side, per-locale map in push-text.ts): `waitlist_promoted` body gains
  charged variant reading `v.amount` — no key-count parity issue (API catalog, not PWA).
- PWA: ZERO new keys (match_title is data; existing keys reused).

## Gate 3 verification checklist

- [x] Mutation (`promoteNextInTx` seat insert) stays inside caller's tx; charge shares it.
- [x] No new migration (enrichment via JOIN; no column added).
- [x] Frontend types can accept exact backend JSON (optional field, older-tolerant).
- [x] Adapter functions exist for the enriched shape (`adaptTransaction` extended).
- [x] No field silently undefined (match_title optional + fallbacks pinned in specs).
- [x] i18n: push catalog EN+AR both updated; PWA needs none.
- [x] Money sweep invariants: paid seat ⇒ fee snapshot (`fee_paid_sar` set on roster row)
      — leaks now pass feePriceSar so the invariant holds on ALL promotion paths.
- [x] Every spec-pinned behavior listed in test plan below.

## Test plan (each = a pinned behavior)

1. underfunded head → skipped, next head promoted, leaver's tx commits (leave tx succeeds).
2. ALL heads underfunded (requireCharge) → promotion null, leave proceeds WITH refund/forfeit.
3. ≥4h leave path charges promoted player exactly feeSar (ledger + fee_paid_sar snapshot).
4. host-kick path charges promoted player the removed player's fee.
5. free-match promotion leaves no charge (chargedSar null).
6. push vars carry amount iff chargedSar != null (spy assertions both cases).
7. wallet history enriches match_title; REFUND-with-match gets title; TOPUP gets null.
8. adapter: match_title preferred, fallback unpinned strings preserved, raw-id suffix gone
   when title present.

## Files changed (planned)

- apps/api/src/modules/matches/waitlist.service.ts (skip-logic + chargedSar + notify)
- apps/api/src/modules/notifications/push-text.ts (charged copy EN+AR)
- apps/api/src/modules/matches/matches.service.ts (2 call sites)
- apps/api/src/modules/wallet/wallet.service.ts (getHistory enrichment)
- apps/player-pwa/src/lib/api-adapter.ts (type + title builder)
- specs: waitlist-money.spec.ts (new), wallet-history-title.spec.ts (new or extend),
  matches.remove-player.spec.ts / matches.join-leave-lock.spec.ts (extend if they pin
  promotion args), push-text spec if exists
