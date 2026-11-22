# F2 Moyasar Webhook — Gate 0 Retrospective (run #223)

**Scope of audit:** wallet module (topup/reconcile/receipt), Moyasar client, auth-guard wiring —
the exact area F2 touches.

## Ledger check (DECISIONS.md supremacy)
- D-20261122-05 (worker, reversible): build F2 webhook endpoint, default OFF behind a flag,
  idempotent by payment id, reuse reconcile credit path. Owner's 11-22 order twice-given (run #222
  next-run rec + DECISIONS.md). No owner-only register item is touched: no PSP decision change
  (PSP stays Moyasar sandbox-first, D-20261025), no prod DB mutation, no promote.
- D-20261122-02 (owner ADOPTED three factory rules): GATE.md + DELEGATION.md + loop-skill edit
  queued as run item 2 (docs/kanban path, direct commit).

## Recent commits in area (last 5)
- `753a535` P2-362 receipt host-scope predicate (PR #256)
- `61c2b83` P2-369a+b reconcile clamp + notify-guard eviction (PR #260)
- `7d6d2ed` P2-373 stable error codes on 13 throw sites (PR #262)
- `cec5168` P2-379 callback surface states (PR #272)
- `a724a96` P2-374 reconcile creditedIds catch observability (PR #270)
Ratio: healthy — feature slices with hardening riding along; no reactive fix loop.

## Findings
1. **(External contract — resolved)** Moyasar webhook security model is a consumer-assigned
   `shared_secret` echoed in the event body as `secret_token` (docs.moyasar.com create-webhook /
   webhook-reference, scraped 2026-11-22). The worker brief's "raw-body HMAC signature" assumption
   does NOT match the real API. Gate 3 redesign: constant-time compare of the echoed secret +
   server-side payment re-fetch (money truth stays 100% Moyasar-authoritative — same trust model
   as /topup/verify). Verification-first delivery: unverified webhooks receive a
   `webhook_verification` event once (6-digit code in `data.verification_code`); endpoint logs it
   + captures to Sentry so Abdullah can confirm the webhook in the dashboard/API within 30 min.
2. **(Infra, not this area)** P1-52 re-re-ignited: KORALINK-API-1C 79 events/24h; nightly backup
   failed again 03:21Z (2nd consecutive; last good dump Nov 20). Not fixable factory-side.
3. **(Quota-collateral, rides P1-52)** KORALINK-API-1F push_subscriptions sweep delete fails with
   the same Neon quota error — not a code bug; sweep retries next tick.
4. **(No hex drift expected)** new file = one new service file in a crowded module dir — name
   `wallet.webhook.controller.ts` (checked: no existing file with that name; `ls` done per run-#186
   lesson).

## Verdict
PROCEED to Gate 1. Design leans on third-party API → verified against live Moyasar docs today
(3 pages scraped), never from memory.
