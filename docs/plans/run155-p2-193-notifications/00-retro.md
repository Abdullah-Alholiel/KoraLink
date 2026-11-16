# Run #155 — Gate 0 Retrospective + Gates 1-3 (P2-193 Slice-1)

**Cycle:** DB&Infra rotation (155 % 4 = 3), build item = **P2-193 Slice-1: refund/payout
in-app notifications (push-only)**. PSP gate re-scoped (see Gate 0).

## Gate 0 — Retrospective

- **Ledger check (DECISIONS.md read FIRST):** no row contradicts a money-notification push.
  The PSP row (2026-08-26) gates the payment *provider*, not notification copy. EN+AR marketing
  row supports the localized push-catalog precedent (P1-67 `payout_paid`, run #141).
- **Build-gate re-scope (recorded decision):** P2-193's boarded "BLOCKED on P0-2" gate was
  written run #129 — BEFORE P1-67 proved the pattern that wallet-money pushes ship without a PSP
  (payout_paid has been live since run #141). The ledger PSP row governs provider onboarding,
  not notifications. Slice-1 ships the PSP-independent notification slice: push-only, no payment
  UX, no provider coupling, no migration. The wallet-page surfaces (badge/feed) stay with the
  post-P0-2 money-surface cycle.
- **Recent commits audited:** 68e1c25 (run #154 board), b4e93c6 (PR #162), 64a07fd (PR #159).
  5 stale board rows verified DONE in code this run (P2-230/235/238/239 + P1-68 — Reviewer B
  CONFIRMED-DONE, file:line evidence in RUNS report).
- **Product finding (merged reviewers):** refund/payout wallet credits fire ZERO pushes/bells.
  Cascade: player's match auto-cancels overnight → generic "match cancelled" push (no amount) →
  opens app later → unexplained wallet credit → "where did this come from?" — trust erosion on
  the highest-anxiety surface. Reviewer B CRITICAL ×2, Reviewer A IMPORTANT; Reviewer A verdict:
  "safe to build against; notify insertion points clean and centralized (post-tx)".
- **ADMIN STATE CHECK: N/A** (item touches apps/api only).
- **Hex lane: clean** (10/10 metrics ok, no drift, baseline 283 held).

## Gate 1 — Product Spec

**Problem:** refund, payout-release wallet credits move money silently — the recipient learns
only by opening wallet history. Money-silence on money events.

**User stories (P0-class per board):**
1. Player whose match is cancelled (host or auto-cancel) → push: amount refunded, match linked.
2. Player who leaves ≥4h before kickoff (or gets backfilled) → same refund push.
3. Player removed by the host → same refund push.
4. Host whose player-hosted match completes → "payout released" push with amount.
5. Host whose koralink booking auto-cancels/cancelled → pitch-cost refund push.

**IN SCOPE:** 2 new PushKeys (`refund_credited`, `payout_released`) in the P2-8 semantic push
catalog + notify calls at the 6 money sites in matches.service.ts. All existing delivery
preferences (global mute, quiet hours, per-subscription locale, SSRF allowlist, 404/410 prune)
apply automatically via sendPushToUsers.

**OUT OF SCOPE (explicit):** in-app bell feed rows (activities), wallet-page badge, PWA surface
changes, `topup_credited` (P0-2 rides the real top-up path), host forfeit-credit push (leave <4h
no-backfill — follow-up note on the board row), new DB NotificationCategory (no migration).

**Success criteria:** refund push (amount + match link) on every refund path; payout push on
both release paths; zero i18n parity change (push-text.ts is the single source of truth);
jest specs pin the new keys + wiring; full gates green.

## Gate 2 — Architecture

**Delta:** push-text.ts +2 keys; matches.service.ts +6 notify blocks (post-commit, best-effort
try/catch — the waitlist_closed pattern at :3299-3309). **notifications.service.ts: ZERO
changes** — the new keys deliberately stay OUT of CATEGORY_BY_KEY, mirroring `payout_paid`
(P1-67): money pushes are intentionally not category-mutable (a user muting match chatter still
must learn money moved); global mute + quiet hours still apply. This is the standing money-push
precedent, now documented here.

**Copy:** single neutral `refund_credited` body (works for cancel / auto-cancel / leave /
remove): "SAR {amount} was refunded to your wallet — see \"{title}\"." Amounts render through
the existing `payoutAmount()` Intl formatter (en → "SAR 37.00", ar → Arabic-Indic + ر.س) — one
source of truth for money copy. `payout_released`: "Your payout of {amount} for \"{title}\" is
in your wallet."

**Money-site wiring (all post-tx, never inside the money transaction):**
1. `cancelMatch` — collect payers in-tx (already SELECTed at :3209), fan refund pushes + host
   pitch-refund push when `refundedSar > 0`.
2. `autoCancelExpiringRow` — same (payers at :844, `refundedSar` hoisted at :812).
3. `leaveMatch` — leaver push when `leaveRefundOutcome` ∈ {refunded, backfilled_refunded}.
4. `removePlayer` — removed-player push when `removedFeeSar > 0`.
5. `completeMatch` (manual release) — host push when `out.paid`.
6. auto-release loop (`autoCompletePastMatches` :402-428) — host push when `out.paid`.

**Deep-links:** `data: { type: 'refund-credited' | 'payout-released', matchId }` — SW tag
(P2-233) handles them generically (`type:matchId`).

## Gate 3 — Program Design (contract)

**PushVars.amount:** existing optional string field (doc comment widened from "payout_paid
only"). Values passed as `moneyToNumber(x).toFixed(2)` / fee-snapshot strings — payoutAmount
renders per locale, never re-quantizes.

**Exact rendered shapes:**
- `refund_credited` en: title `💸 Money returned` · body `SAR {amount} was refunded to your
  wallet — see "{title}".` — ar: title `💸 تم إرجاع المبلغ` · body `تم إرجاع {amount} إلى محفظتك
  — راجع "{title}".`
- `payout_released` en: title `💸 Payout released` · body `Your payout of {amount} for "{title}"
  is in your wallet.` — ar: title `💸 تم صرف المستحقات` · body `تم إيداع مستحقاتك بقيمة {amount}
  عن "{title}" في محفظتك.`

**Notify contract:** every block is post-commit, wrapped in try/catch that logs only (a push
failure NEVER fails or retries the money movement); recipients = affected wallet owners only.

**Gate 3 checklist:**
- [x] No mutation endpoint shapes change (notify-only; returns untouched)
- [x] No frontend type changes (PWA untouched; SW routes unknown types to default)
- [x] PushVars extends existing optional field — no breaking union change
- [x] No i18n json keys needed (push catalog self-contained; PWA parity 1102=1102 untouched)
- [x] i18n keys used: none new (catalog strings EN+AR inline, P1-67 precedent)
