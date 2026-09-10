# Host Wallet Deposit UX — Gate Record (2026-09-09)

Owner directive: the "Couldn't publish" dead end must show the host the exact amount
needed, framed as a security deposit, with an action (top up).

## Decision (Gate 1+2 compressed — autonomous mode)

**Deposit policy = 100% of `pitch_cost_sar` (hourly_rate × duration).** NOT a fraction:

- The API already debits 100% at publish (`matches.service.ts` koralink branch, guarded
  `UPDATE ... WHERE wallet_balance >= cost`). Check and debit MUST be the same number or
  hosts pass the check and fail the debit — a worse trust break than today's message.
- Wallets are prepaid-only; there is no later collection mechanism.
- 100% is safe to hold: `cancelMatch` and the underfill auto-cancel refund it in full
  (verified 2026-09-09).
- Aligns with the LOCKED `docs/plans/player-host-responsibility/03-program-design.md`
  (2026-09-09): "koralink mode additionally: slot book + cost debit (existing, unchanged)"
  + future host payout releases after completion. Nothing this slice does contradicts it.
- The lever for barrier-reduction is the REFUND POLICY (4h rule, already designed there),
  not a smaller deposit.

## Scope (this slice — frontend only; the API needs no change)

1. `lib/publish-error.ts` — `parseWalletShortfall(msg)` extracts Required/Available/deficit
   from the API's existing 400 message (race fallback path).
2. `PublishWarningSheet` — koralink mode shows a deposit card (deposit + balance +
   "fully refunded" note). When short: amber shortfall block with exact deficit +
   Top Up Wallet → `/{locale}/wallet`; Confirm disabled. Server-confirmed insufficient
   (400) gets the same block + amounts when parseable.
3. `HostMatchForm` — `useWalletBalance({ enabled })` fetched only while the sheet is open
   in koralink mode; proactive short computation; PostHog `publish_blocked_insufficient_balance`
   (deposit_sar, wallet_balance_sar, shortfall_sar, phase=precheck|server_error).
4. i18n EN+AR keys (host.*: depositLabel, depositNote, yourBalance, checkingBalance,
   topUpWallet, shortfallLabel, shortfallBody). Numbers in `dir="ltr"` spans (UI standards).

## Non-goals / follow-ups (not this slice)

- Reschedule insufficient-balance message shows the same dead-end pattern
  (`Insufficient wallet balance for the reschedule. Required: ...`) — same fix class,
  separate slice.
- Joiner-side fee UX → owned by `player-host-responsibility` gates (already specified).

## Verification (Gate 4)

- `test/lib/publish-error.test.ts` — parser cases.
- `test/components/PublishWarningSheet.test.tsx` — deposit card, shortfall block, top-up,
  confirm disabled/enabled, loading/unknown balance, self-mode untouched.
- `cd apps/player-pwa && npx vitest run` green; `npm run build` zero errors; type-check clean.

## Follow-up fix (same day, 2026-09-09 — commit 993552b)

Abdullah hit `POST /matches 400` on **every** publish in self-booked mode. Root cause was
NOT the deposit slice: the hosting-consent slice added `acceptedHostingTerms` to the API
DTO but never to the PWA's `hostMatchSchema` in `useMatches.ts` — Zod silently STRIPPED
the flag on `parse()`, so the API always rejected with "Hosting terms must be accepted
before booking." (frontend-backend schema drift; the exact failure mode the
schema-alignment rule exists for). Fixed by adding the field to the schema, mapping the
API message to a new `hosting_terms` classifier kind + `host.hostingConsentRequired`
i18n, typing the mutation input as `z.input<>` (defaults optional for callers), and
adding regression tests (schema preserves flag; classifier maps the 400).

Live E2E (Playwright, staging, self-booked mode, wallet SAR 120): consent gating verified
(Confirm disabled until checkbox), publish SUCCEEDS → match detail, ZERO POST /matches
400s. Rerun lesson: never trust click-only steps in this app — overlays mount late;
verify every step against resulting state (aria-pressed / visible label / dump on fail).

