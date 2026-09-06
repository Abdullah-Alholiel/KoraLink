# Error Message Standards — Gate 0 Retrospective

**Cycle:** error-message-standards · **Date:** 2026-09-06 · **Trigger:** Abdullah adopted the "what happened / why it happened / what to do next" error-message standard and ordered a full implementation cycle.

## Pre-work checks

- `gh auth status` → Logged in as Abdullah-Alholiel ✓
- Tree: minor drift (graphify-out/* generated artifacts + one plans status file) — foreign WIP, excluded from this cycle's commits (multi-agent commit discipline).
- No `kanban/LOCK.json`; last factory run #37 fired 2026-09-06T02:26Z — no mid-flight tree mutation risk.
- Shell env clean (`NODE_ENV` unset) — VPS trap avoided.

## Admin-state check

Not applicable — cycle touches `apps/player-pwa` (wallet, match, auth surfaces) only; `apps/admin` and `apps/api` are read-only references this cycle. No partner/admin in-flight-work conflict.

## Audit baseline

Recent commits: `5f61ec0` (fix api), `4a64415` (feat pwa waitlist CTA), `dbd1d8e` (feat api waitlist). Healthy feat/fix balance; no reactive fix-loop signal. No contract-break debt in the error path — the gap is a **standards gap**, not a regression.

## Findings (audited against live code, 2026-09-06)

### CRITICAL (money/identity flows)

| # | Finding | Evidence | User impact |
|---|---------|----------|-------------|
| C1 | Wallet top-up failure fallback copy is `common.error` ("Something went wrong" / "حدث خطأ ما") — vague, zero reassurance whether money moved; contradict the newly adopted standard in the highest-stakes flow. | `apps/player-pwa/src/app/[locale]/(main)/wallet/page.tsx:121` | User can't tell if they were charged; support risk |
| C2 | `usePayWallet` (wallet payments) has **no error surface at all** — onError only invalidates; consumer (if any renders on it today) would fail silently. | `apps/player-pwa/src/hooks/useWallet.ts` (`usePayWallet`) | Silent-failure pattern in a money mutation |
| C3 | Login/OTP pages render raw backend `err.message` (English, leaky, un-i18n'd): `setError(err.message)` in send-OTP, verify-OTP, resend-OTP, and PDPL restore error paths. `login.*` namespace has zero error keys. | `apps/player-pwa/src/app/[locale]/(auth)/login/page.tsx:65`, `(auth)/verify/page.tsx:97,109` | Raw backend text in UI; i18n violation; first-touch UX break |

### IMPORTANT

| # | Finding | Evidence | User impact |
|---|---------|----------|-------------|
| I1 | `app/[locale]/error.tsx:36` renders `error.message` on screen — client crash internals (e.g. chunk messages) exposed to users; digests belong to Sentry, not the UI. | `error.tsx:36` | Info leak; vague non-actionable screen |
| I2 | `useMatchActions.ts` — all 7 match mutations toast raw `err.message` (backend English) or a hardcoded English fallback; not localized; couples UI copy to backend copy. | `useMatchActions.ts:124,202,233,257,282,316` + waitlist toasts `match/[id]/page.tsx:838,879` | Arabic users see English backend strings |
| I3 | Error classification exists ONLY for host publish (`lib/publish-error.ts`); no shared classifier for the rest of the app. | single-flow lib | Duplicate ad-hoc mappings per feature |
| I4 | Match-action error toasts hardcode English fallbacks in code — Gate 3 i18n contract violation. | `useMatchActions.ts` (multiple) | i18n parity broken |

### MINOR

- M1: `global-error.tsx` and `ErrorBoundary.tsx` show "Something went wrong" with retry but no safe-reassurance line; aligned later with the same keys.
- M2: success toasts in `useMatchActions` are hardcoded English ("Successfully joined the match! 🎉") — out of scope here (this cycle is failure messaging) but logged for a follow-up copy cycle.

## Mapping to user stories

- **Join/waitlist flows (C3-adjacent, I2):** Arabic-first users get English backend errors → feel broken → abandon.
- **Top-up (C1/C2):** "did my money move?" is unanswered → trust damage in the core wallet loop.
- **Login (C3):** raw English errors on the FIRST screen a Saudi user sees → worst possible first impression.

## Tech-debt notes

- Toast supports no secondary line (store `Toast` has `message` only) — extend `ToastMeta`/`Toast` with optional `detail` in Slice 1 so action hints fit the standard's part 3.
- `common.error` remains as the last-resort fallback but must stop being the *primary* copy anywhere.

## Recommendation

Proceed to Gates 1–3 (compact plan) → Gate 4 slices: (1) classifier + i18n foundation, (2) money flow, (3) match actions + auth + error.tsx, (4) standards durably encoded. Autonomous mode per Abdullah's standing trigger; hard gate (turbo build + vitest + type-check) unchanged.
