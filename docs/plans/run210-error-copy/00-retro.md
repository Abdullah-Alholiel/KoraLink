# Run #210 — Error-copy hardening (P2-372, P2-373, P2-343)

## Gate 0 — Retro (area audit)

Recent commits (origin/staging head `2c00259`): PR #260 wallet reconcile hardening (61c2b83),
PR #259 owner UI defects (d976f68), PR #256 receipt MVP (753a535). fix:feat ratio healthy
(4 fix : 2 feat last 10 code commits — not reactive).

Area audit — error surfaces (this run's target):
- `apps/player-pwa/src/lib/error-classify.ts` — shared classifier, 14 kinds, all `errors.*`
  buckets exist EN+AR (verified: 37 keys). ReceiptSheet.tsx:116 is the canonical render
  pattern `t(errorKey(classifyError(error)))`.
- **P2-372** ReportSheet.tsx:115 renders `report.error?.message` verbatim — the LAST raw
  backend-text surface in PWA sheets (board P0-class).
- **P2-373** `src/lib/publish-error.ts:74-99` classifies publish failures by REGEX ON ENGLISH
  SERVER COPY (4 throw sites in matches.service.ts carry prose only, no `code` field):
  insufficient balance (:2368, :2624, :3734, :3774), hosting terms (:2162), slot taken
  (:2272, :3614), slot started (:2288, :2527, :2553). Any API copy tweak silently breaks
  classification. The API already has the stable-code convention (ACCOUNT_BANNED,
  auth.service.ts:223) and FetchError already carries `.code` (fetcher.ts:17).
- **P2-343** admin `partner/earnings/page.tsx:76-79,369` renders `t('payoutErrorPrefix') +
  e.message` — same class, admin lane (run%4=2 rotation, admin tree CLEAN — step-0 check passed).

Reviewer findings merged (run #210 Phase 2):
- Reviewer A: 0 CRITICAL / 0 IMPORTANT; 2 MINOR — reconcile creditedIds `.catch(() => [])`
  swallows DB error unobserved (:282-286, not money-unsafe) → documented follow-up; PWA
  ErrorBoundary console.error (baseline).
- Reviewer B: run #209 claims 4/4 VERIFIED TRUE. Its 3 "gaps" (kickoff reminders missing,
  no refund-on-cancel, no distance-sorted matches) all REFUTED by parent code read:
  sendMatchStartReminders ladder matches.service.ts:565 + scheduler :52; in-tx refund sweep
  :833-851 + refund-<id> keys; distance ORDER BY :1417. Claims ≠ facts applied to reviewers.

ADMIN STATE CHECK (step 0): `git status apps/admin` clean; last admin commit 479affd (PR #245);
service active; dashboard routes match the board row's assumption. No hold.

Strix: not due (Nov 16). Security lane: FIX-before-HUNT clean — run-5 confirmed finding
(stale room membership) already fixed bf6cc4f (PR #209 P1-70, on staging); run-5 R5-2
(leave-conversation shape) already validated in current gateway code :968-970; run-3/run-4
records all fixed/refuted/owner-decided/needs_validation-MINOR (no un-fixed confirmed).

## Gates 1-3 — Program design (contracts)

### Item 1 — P2-372 (zeroshot lane, PWA)
- ReportSheet.tsx:113-117: raw `report.error?.message` → `tErrors(errorKey(classifyError(report.error)))`.
- Zero new i18n keys (errors.* buckets exist). No DB/API surface. Files: ReportSheet.tsx only.
- i18n contract: renders existing `errors.network|server|validation|forbidden|unauthorized|...` — both locales.

### Item 2 — P2-373 (direct lane-branch PR, API+PWA)
API: attach stable `code` to the 4 business exception groups (same `{ message, code }` body
shape as ACCOUNT_BANNED — additive, no breaking change):
| site(s) | code |
|---|---|
| :2368 :2624 :3734 :3774 | `WALLET_INSUFFICIENT` |
| :2162 | `HOSTING_TERMS_REQUIRED` |
| :2272 :3614 | `SLOT_TAKEN` |
| :2288 :2527 :2553 | `SLOT_STARTED` |
PWA `publish-error.ts`: classify `err.code` FIRST (map above), regexes retained as
stale-bundle fallback. `parseWalletShortfall` unchanged (amounts still ride the message).
`useMatchActions.ts:396`: gate the shortfall toast on `code === 'WALLET_INSUFFICIENT'`
(amount-parse still best-effort from message).
Tests: publish-error.test.ts + new code-carrying cases (decoupling proof: changed English
copy + correct code still classifies); API spec pins for thrown body codes.

### Item 3 — P2-343 (direct lane-branch PR, admin — if budget ≥50 min remains)
- earnings/page.tsx: replace `t('payoutErrorPrefix') + e.message` with a bucket helper
  (mirror admin blackout.ts `pitchActionFailure` pattern) + localized `payoutFailed*` keys EN+AR.

## Gate 3 contract checklist
- [x] No mutation contract touched (exception bodies gain optional `code`; `message` unchanged)
- [x] FetchError already carries `.code` — no fetcher change
- [x] Frontend types accept the JSON (code?: string already typed on FetchError)
- [x] Adapter n/a; i18n: zero new keys (items 1-2), 2-4 new keys ×2 locales (item 3, parity-checked)
- [x] Observability: classification failures still land via existing mutation onError Sentry

## Gate 4 — slices
1. Lane P2-372 (zeroshot, ≤45 min cap) → parent reconcile + real gates + PR.
2. P2-373 API codes → PWA classifier → tests → turbo build sequential → PR → CI → PR-Agent triage → squash.
3. P2-343 if budget.
