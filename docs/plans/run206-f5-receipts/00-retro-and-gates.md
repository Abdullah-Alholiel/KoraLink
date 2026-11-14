# Run #206 — Launch lane F5: player transaction receipt MVP (P2-145/P2-311)

## Gate 0 (retro, compact)
- DECISIONS.md read FIRST. Governing rows: D-20261106-13 (receipt shape DECIDED: "In-app receipt
  MVP (owner note: And can be exported as invoice)"), D-20261113-26 (launch lane F1–F10 critical
  path; Life OS worker requests are buildable work). F1 skipped (no TURNSTILE_* keys anywhere —
  owner-blocked), F2 skipped (owner webhook URL pending), F3+F4 done in #205 → F5 is the next
  unbuilt critical-path item (plan: ~/projects/life-os/readiness/koralink-production-plan.md line 95).
- Cycle-area audit: sibling lane PR #255 (topup-intent expiry) OPEN touching wallet.reconcile/
  topup services + wallet/page.tsx + useTopup.ts. No dup-item violation (different board item),
  but wallet/page.tsx overlaps → merge-order note recorded in run report (second merger rebases).
- Hex lane at Phase 2: clean (345/27 flat, zero import-arrow violations, parent + Reviewer A agree).
- Reviewer A (cycle areas): 0 CRITICAL; 2 IMPORTANT on wallet.receipt.service.ts (PRIZE lookup
  missing user_id scoping — defense-in-depth; getHistory per-row match_title subquery perf);
  5 MINOR. No standing bug-class hits. Reviewer B: run-#205 claims all VERIFIED (privacy/terms
  live with 8+12 sections + banners; env-flags guard + spec complete; P2-352 InfiniteQuery +
  load-more wired); receipt MVP scoped (no player receipt endpoint exists; history rows have a
  DEAD FileText icon with no handler — the exact dead-UI class).
- IMPORTANT findings disposition: (1) PRIZE user_id scoping → fixed THIS slice (one-line, same
  file I extend); (2) match_title subquery perf → board as P2 (perf-only, correct today).

## Gates 1–3 (compact — F5)
- Problem: a player who tops up SAR or pays a match fee has no inspectable proof-of-payment —
  only a ledger row in history (and a dead receipt icon). D-20261106-13 decided: in-app receipt
  MVP, exportable as invoice later.
- User story: as a player I tap any wallet history row and see a receipt (number, amount,
  status, what it bought: match title/date/venue for MATCH_FEE+REFUND, payment reference for
  TOPUP) in EN+AR with Arabic-Indic numerals.
- Scope IN: GET /wallet/receipt/:txId (owner-only) + tappable history rows + ReceiptSheet
  bottom sheet + share-text button + i18n EN+AR + tests. OUT: PDF generation, VAT engine,
  payment-method persistence (card brand not stored anywhere today — documented gap), host
  payout receipts (P2-293 shipped), receipt email.
- API delta (exact JSON shape — Gate 3 contract):
  `GET /api/v1/wallet/receipt/:txId` (JwtCookieAuthGuard, UuidParamPipe → 400 on bad shape,
  @Throttle 60/min explicit mirror of payout-receipt). Owner-only: tx.user_id ≠ caller → 404.
  200 → `{ txId, receiptNumber, status: 'Completed'|'Pending'|'Failed'|'Reversed',
  direction: 'credit'|'debit', amountSar: number, currency: 'SAR', createdAt: ISO, issuedAt: ISO,
  context: { kind: 'match', matchId, matchTitle, scheduledAt: ISO|null, venueName: string|null,
  city: string|null } | { kind: 'topup', paymentId: string|null } | { kind: 'generic' } }`
  - receiptNumber = `KL-<yyyyMMdd>-<first6 txId uppercase>` (deterministic, no schema change).
  - MATCH_FEE/REFUND → match context (reference_id = match id; venue via matches→venue join).
  - TOPUP → topup context (reference_id = Moyasar payment id; intents matched via payment_id).
  - Everything else (SETTLEMENT/PAYOUT/PRIZE/ADJUSTMENT) → generic context (still proof-of-payment).
- TS signatures: `WalletReceiptService.getTransactionReceipt(userId: string, txId: string):
  Promise<TransactionReceipt>`; PWA hook `useTransactionReceipt(txId, enabled):
  UseQueryResult<TransactionReceipt | null>` (404 → null, mirrors usePayoutReceipt).
- Frontend: wallet page rows become buttons (w-full text-left, row div unchanged visually) that
  open `ReceiptSheet` (z-[60] backdrop / z-[70] sheet per conventions); the previously dead
  FileText icon becomes the affordance. 5 UX states: sheet loading skeleton, inline error +
  retry, 404 → "receipt unavailable" copy, offline → classified error copy, success body.
  Share button only when `navigator.share` exists (no dead UI).
- i18n keys (wallet ns, EN+AR exact parity): receiptTitle, receiptNumber, receiptIssued,
  receiptStatusCompleted/Pending/Failed/Reversed, receiptMatch, receiptDate, receiptVenue,
  receiptTopup, receiptPaymentRef, receiptShare, receiptUnavailable, receiptGenericNote.
- No DB migration (context via joins; receipt number derived). Hex note: service gains one
  NotFoundException throw → api_exc_total may read 346 → attribute + fold baseline (P2-355
  convention) with Reviewer A confirmation.

## Gate 3 contract verification checklist
- [ ] Ownership enforced: non-owner txId → 404 (spec case).
- [ ] Malformed txId → 400 via UuidParamPipe (pipe on route, spec via controller or pipe unit).
- [ ] MATCH_FEE row → match context with title/date/venue (spec case with mock joins).
- [ ] REFUND row → same match context (spec case).
- [ ] TOPUP row → paymentId from intents lookup (spec case; no intents row → null paymentId).
- [ ] Generic row (ADJUSTMENT) → kind generic (spec case).
- [ ] Frontend type accepts exact JSON (hook interface mirrors response field-for-field).
- [ ] Every user-facing string exists in BOTH en.json and ar.json (parity script post-insert).
- [ ] Sheet has loading/error/404/offline(success-fallback)/success states.
- [ ] No hard-coded user-facing strings in components.
