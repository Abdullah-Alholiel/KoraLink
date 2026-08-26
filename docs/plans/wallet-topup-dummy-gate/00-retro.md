# Gate 0 — Retrospective: Wallet Top-up Dummy-Gating (P0-2 interim)

**Date:** 2026-08-26 · **Owner:** Factory Loop parent session (Abdullah decision: "keep dummy for now")

## Problem
`POST /wallet/topup` credits the caller's wallet with no payment provider behind it
(grep moyasar|stripe|tap|hyperpay → 0 hits). Any authenticated user can self-credit up to
SAR 10,000 (topup-wallet.dto.ts:23 `@Max(10000)`). This is a money-leak in production.

## Decision (Abdullah, 2026-08-26)
"keep dummy for now for wallet" → keep the dummy self-credit path **available in dev/test**,
but **disable it in production** until a real payment provider is integrated (P0-2 stays open,
BLOCKED → TODO with the gate as interim mitigation).

## Pattern to mirror
`auth.controller.ts:113-117` — dev-login gating:
```ts
const isProd = this.configService.get<string>('NODE_ENV') === 'production';
if (isProd) throw new ForbiddenException('dev-login is disabled in production');
```

## Files touched
| File | Change |
|---|---|
| `apps/api/src/modules/wallet/wallet.controller.ts` | Inject ConfigService; guard `topup` with `isProd → ForbiddenException` |
| `apps/api/src/modules/wallet/wallet.controller.spec.ts` (if exists) | Add prod-403 + dev-ok cases |
| `apps/player-pwa/src/messages/en.json` + `ar.json` | `wallet.topupDisabled` key |
| `apps/player-pwa/src/app/[locale]/(main)/wallet/page.tsx` | onError → show `wallet.topupDisabled` when 403 |

## Success criteria
- Prod NODE_ENV: POST /wallet/topup → 403 Forbidden (no wallet credit).
- Dev/test NODE_ENV: unchanged dummy top-up behavior.
- PWA: top-up failure surfaces the disabled message instead of generic error; optimistic rollback intact.
- `turbo run build` zero errors; vitest + jest green.
