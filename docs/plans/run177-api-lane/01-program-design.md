# Run #177 — Gates 1-3 Compact (P2-282: topup verify multi-payment guard)

## Problem (user story)
As a player topping up my wallet, if my bank charges me for a top-up, exactly one credit must land per completed charge — and any anomaly (two different payments bound to the same intent) must be **visible** (localized conflict error + rollback), never silently absorbed.

## Scope
IN: apps/api wallet module only (wallet.topup.service.ts verifyTopup/getLatestIntent + wallet.controller.ts throttle decorators) + jest specs.
OUT: PWA/admin, schema/migrations (none needed), Moyasar integration changes, the dummy POST /wallet/topup path (env-flag-gated off, untouched).

## Architecture delta
Zero new tables/endpoints. Three behavior tightenings inside the existing credit authority:
1. **Pre-credit credited-intent guard** (verifyTopup, before payment fetch):
   - intent.status === 'credited' && payment.id === intent.payment_id → replay path (heal + alreadyCredited, existing response shape).
   - intent.status === 'credited' && payment.id !== intent.payment_id → 409 `topup_already_credited: this top-up was already completed with a different payment — no money was credited`.
2. **In-tx intent-flip assertion**: the status='pending'→'credited' UPDATE captures .returning({id}); zero rows → throw 409 `topup_intent_race: intent state changed during verify — transaction rolled back` (tx rolls back the credit; the existing UNIQUE-violation replay recovery in the catch still serves concurrent same-payment double-submit).
3. **Deterministic latest** (getLatestIntent): `orderBy(desc(created_at), desc(id))`.
4. **Throttle consistency** (wallet.controller): `@Throttle(default 60/min)` on GET topup/config + topup/latest (POSTs already 10/min).

## API JSON contract (unchanged except the one new 409)
- Success: `{ credited: boolean, alreadyCredited: boolean, balance: string, paymentId: string, amountSar: number }` (unchanged).
- NEW 409 body: `{ "message": "topup_already_credited: this top-up was already completed with a different payment — no money was credited" }` / `{ "message": "topup_intent_race: intent state changed during verify — transaction rolled back" }` (string `message` shape, consistent with existing topup 409s like `payment_intent_mismatch: …`).

## TS signatures (unchanged public surface)
- `verifyTopup(userId: string, dto: VerifyTopupDto): Promise<VerifyTopupResult>`
- `getLatestIntent(userId: string): Promise<{ intent: LatestTopupIntent | null }>`

## i18n keys
None (API-only slice; 409 messages are developer/bank-callback-surface strings, matching the established topup error convention — the PWA maps topup error prefixes at the callback, and `topup_already_credited` returns `credited:false` semantics the wallet page already treats as no-change).

## Gate 3 contract verification checklist
- [x] Every mutation endpoint returns fully populated objects — verifyTopup returns the full result shape (unchanged); N/A otherwise (no new mutations).
- [x] Frontend types accept the exact JSON — VerifyTopupResult/P2-279 card types untouched; new 409 is a new distinct prefix the PWA's classifyError paths treat as a generic failure (no silent undefined).
- [x] Adapter functions exist for every API shape — no new shapes introduced.
- [x] No field silently undefined — flip assertion REMOVES a silent no-op (the run's premise).
- [x] i18n keys — N/A (no user-facing UI strings added; API error-copy convention follows existing `*_mismatch:` prefix style).
- [x] Money-path tripwire: NEW status writers sweep — no new status writers; the flip guard TIGHTENS the only credited writer.
- [x] Observability (AGENTS.md §4): ConflictExceptions flow to Sentry via the existing filter (4xx = handled, no flood); Pino logs via existing interceptor. No new wiring needed for a 409 guard.

## Risks & mitigations
- Risk: existing sandbox flows regress (same-payment retry). Mitigation: spec (b) pins alreadyCredited:true for same-paymentId replay; the pre-existing replay path is untouched.
- Risk: intent-flip assertion breaks flows where the flip legitimately matches 0 rows — only possible if status ≠ 'pending' at flip time, which after the new pre-guard + UNIQUE replay recovery means a concurrent different-payment verify → 409 rollback is the CORRECT outcome.
- Risk: lane diff quality. Mitigation: parent re-applies to the real tree, runs FULL gates (turbo build --concurrency=1 + wallet jest suites + tsc), PR + PR-Agent triage before merge.

## Verification plan (parent-side)
1. Lane diff review (git -C /tmp/lane-p2-282 diff).
2. Apply to main checkout on a lane branch, run: wallet jest suites, api tsc --noEmit, turbo build --concurrency=1, PWA vitest untouched-but-confirm.
3. PR → 4 bot checks + PR-Agent triage → squash-merge → live deploy (API rebuild + restart) + E2E probe (topup/config 200, latest 200, verify 403 flag-off unchanged).
