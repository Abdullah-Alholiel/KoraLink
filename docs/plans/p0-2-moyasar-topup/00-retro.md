# Gate 0 — Retrospective: P0-2 Moyasar wallet top-up (run #169)

## Ledger check (DECISIONS.md first)
- 2026-10-25 row: "P0-2 PSP DECIDED: Moyasar — sandbox-first (free test keys, wired on
  prod as demo), live keys only after CR/company registration; mada first-class."
  This cycle implements exactly that. No design decision contradicts the ledger.
- Keys staged by owner in `.deploy-tokens` (2026-10-25): MOYASAR_SECRET_KEY_TEST +
  MOYASAR_PUBLISHABLE_KEY_TEST (+ a LIVE pair; LIVE is OUT of scope — owner regenerates
  the live secret before go-live per the reference).

## Recent-commit audit (last 5)
- f18b41e docs (run #168 report) · c5a85c3 PWA dispute offline guard (PR #184) ·
  ac7f933 locale email (PR #183) · ce1d97d docs (#167) · 31d867f push opt-in (PR #182).
- fix:feat ratio healthy; no reactive loop. Reviewer A run #169: no CRITICAL/IMPORTANT
  on those commits; standing money-path discipline verified intact.

## Architecture reality (probed live, not guessed)
- Moyasar API **rejects card-less server-side payment creates** (400: source.number/
  month/year/cvc/name missing — probed 2026-10-27 with sandbox sk). The strategy doc's
  "intent endpoint returns a hosted-form URL" does NOT exist server-side. Card data
  enters ONLY through the browser-side hosted form (moyasar-payment-form JS library,
  tokenizes browser→api.moyasar.com directly).
- Therefore: intent = server-pinned DB row (user, amount, idempotency); the form creates
  the actual Moyasar payment client-side; verification + credit are server-side.

## Tech debt / standing items folded into this cycle
- Hex drift +5 exc / +3 raw SQL since baseline 283/59: attributed to run-#167 6bede5d
  (restore-on-behalf, layered-baseline growth, allowed per AGENTS.md §1.2) — [P2][hex]
  board row + baseline fold, NOT this run's code.
- Reviewer B #169 CRITICAL "no payment rails" is precisely this item.

## Verdict: PROCEED to Gate 1 (compact, single 01-program-design.md per autonomous mode).
