# Run #149 — Gate 0 Retro + Cycle Docs (P2-227 + P2-225)

**Cycle:** run149-dm-chat-hardening · **Date:** 2026-10-20 · **Lane:** API modules (149%4=1)
**DECISIONS.md:** re-read at Gate 0 — no ledger entry conflicts with either item (chat/realtime surface, no design/UX reversal).
**Admin state:** tree clean at c7ef9bd, no in-flight apps/admin edits; neither item touches admin/partner surface.

## Retro — what the last cycles left behind

- Run #146/#147/#148 closed P2-220 fully: REST + WS match-chat sends now serialize
  membership/status checks and the INSERT inside ONE tx with a match-row `SELECT … FOR UPDATE`,
  plus the P2-172 idempotency pre-read placed BEFORE the rate limiter (PR-Agent follow-ups).
- Run #148 shipped P2-224 (DM offline queue, PR #153) — the client half of DM reliability.
- Reviewer A (this run) found the gap the sequence skipped: **the DM send path itself
  (`conversations.service.ts` `sendMessage`, used by BOTH the REST controller and the WS
  `send-dm` handler) never received the P2-220 treatment** — membership (`assertParticipant`),
  block checks, and the INSERT still run as independent statements. Same TOCTOU family the
  factory fixed twice for match chat. Additionally `send-dm` lacks the idempotency pre-read
  before the rate limiter (asymmetric with `send-message` — a replay can surface as
  "Rate limit exceeded", which the P2-172 contract forbids because it flips a delivered
  bubble to failed).
- Reviewer B verified run #148's claims line-level (both VERIFIED) and confirmed i18n parity
  (1099=1099 keys). New product gap noted: push delivery wiring (board-only, not this cycle).

## Picks

| Item | Type | Why now |
|---|---|---|
| P2-227 (new, from Reviewer A IM1-3) | API hardening, security lens | DM send = the last unserialized chat write path; runbook lane = API; small vertical slice with a proven in-repo pattern to mirror (matches.service P2-220 + gateway P2-220-twin). |
| P2-225 (boarded, Reviewer B #147) | API+PWA user-visible | Natural chat-surface companion on the same files; DMs get typing parity with match chat (P2-99). Satisfies the >=1 user-visible mandate. |

P2-226 (terminal-error retirement, PWA lane) deferred to next run — one lane per run keeps the
shared-checkout branch juggling (run #148 trap note) out of this cycle.
