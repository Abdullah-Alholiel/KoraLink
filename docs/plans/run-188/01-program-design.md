# Run #188 — Program Design (Gates 1–3 compact) + Status

## Item 1 — P1-72: explicit COOKIE_SECURE / SWAGGER_ENABLED flags (hardening)

**Problem.** Cookie `secure`/`sameSite` derivation and Swagger exposure are `NODE_ENV === 'production'` string gates. Staging runs `NODE_ENV=staging`, so access cookies ship `secure:false` + OpenAPI is public — Strix run-#183 MEDIUM. `NODE_ENV` is load-bearing for turbo/build mode on this VPS, so flag-free hardening would break builds; explicit flags are the house pattern (AVATAR_UPLOAD_ENABLED, WALLET_TOPUP_ENABLED, P0-7 posture).

**Scope.** IN: `env-flags.ts` util + 3 cookie-derivation sites (auth, email-auth, dev-login controllers) + swagger gate in main.ts + `.env.example` docs. OUT: P1-73 dev-login disable (owner-gated), log level, CSP, any prod env change.

**Exact contract (Gate 3).**
```ts
// apps/api/src/common/utils/env-flags.ts
export function isCookieSecure(config: ConfigService): boolean {
  const explicit = config.get<string>('COOKIE_SECURE');
  if (explicit === 'true') return true;
  if (explicit === 'false') return false;
  return config.get<string>('NODE_ENV') === 'production'; // unset = legacy behavior
}
export function isSwaggerEnabled(config: ConfigService): boolean {
  const explicit = config.get<string>('SWAGGER_ENABLED');
  if (explicit === 'true') return true;
  if (explicit === 'false') return false;
  return config.get<string>('NODE_ENV') !== 'production'; // unset = legacy behavior
}
```
- auth.controller.ts:96 / email-auth.controller.ts:91 → `const isProd = isCookieSecure(this.configService);` (variable name kept; comment updated). sameSite ternary rides the same value (secure=false ⇒ lax, unchanged).
- dev-login (:161) → `const secureCookie = isCookieSecure(...)` (that cookie was never prod-gated on sameSite; only `secure` flips — comment stays P2-241).
- main.ts:182 → `if (isSwaggerEnabled(configService)) {`.
- Failure modes: unset flag = today's behavior on every env (zero-change default); `'true'` forces secure/swagger-on; `'false'` forces lax/swagger-off. No DTO/i18n surface (no user-facing copy changes).

**Checklist.** [✓] no user-facing strings → no i18n keys needed. [✓] no DB/schema/migration. [✓] mutation contract N/A (no new mutations). [✓] spec tripwires: env-flags.spec.ts (9 cases: explicit true/false, unset+each NODE_ENV, junk value, ConfigService mock shape). [✓] zero prod-behavior change until owner sets flags.

## Item 2 — P2-260: wallet actions distinguish offline from failed (user-visible, zeroshot lane)

**Problem.** `handleTopUpSubmit` onError maps 403→`topupDisabled`, everything else→`errors.walletTopupFailed` — a network drop during a money action reads identically to a bank decline. Reviewer B run-#165 P2; error-message standard demands the distinction; money surfaces add the "no money was moved" reassurance. Reviewer B #188 adds: history error block (wallet/page.tsx:393–407) lacks `role="status"` + reassurance copy — same file, folded here.

**Scope.** IN: wallet page top-up onError classification (offline→`errors.offlineTryAgain`; network-shape→`errors.noMoneyTaken` reassurance; keep 403 topupDisabled), i18n keys ×2 locales, history-error role+reassurance. OUT: withdraw/cards (owner-gated), balance/history query wiring, P2-257b format census.

**Exact contract (Gate 3).**
- i18n (en + ar, `errors` ns, EN+AR parity): `offlineTryAgain` ("You're offline — that action didn't go through. Reconnect and try again." / AR equivalent), `noMoneyTaken` (exists per Reviewer B — reuse), reuse `errors.network`.
- onError order: FetchError status 0 OR classifyError→'network' ⇒ offline/network copy; status 403 ⇒ `wallet.topupDisabled` (P0-2 gating message); else ⇒ `errors.walletTopupFailed` + reassurance line.
- history error block: add `role="status"` + `errors.noMoneyTaken` detail line alongside existing `errorKey(classifyError(...))`.

**Checklist.** [✓] adapter unchanged (classifyError exists, pure). [✓] i18n keys enumerated both locales. [✓] specs: extend test/components/wallet/TopupSheet.test.tsx or a page-level spec for the classify branch matrix (status 0 / network msg / 403 / 500).

## Verification plan (both items)
Lane worktree (P2-260): parent re-gates on REAL install tree — pwa tsc 0, targeted vitest, full `npx turbo run build --concurrency=1` 3/3 + full vitest. P1-72: api tsc 0 + env-flags jest + auth controller spec + full gates. Then PR flow (lane branches off origin/staging, gh pr, bot checks, squash) + LIVE deploy probes.
