# Program Design (compact Gates 1-3) — Env Secret Hardening (P0-3)

**Cycle:** env-secret-hardening · **Run:** #2

## Gate 1 — Product spec

**Problem:** The live API serves traffic with placeholder auth secrets (`JWT_SECRET=change-me`,
`COOKIE_SECRET=change-me`), letting any tailnet peer forge Admin/user JWTs and signed cookies.

**User story:** As the operator, I want the API to **refuse to boot** when auth secrets are
placeholders/weak, so a misconfigured `.env` can never silently expose the platform.

**Scope (IN):**
- A bootstrap guard that hard-fails on placeholder/missing secrets (any env) and weak (<32-char)
  secrets in production.
- Fix `.env.example` to carry empty `JWT_SECRET`/`COOKIE_SECRET` + generation guidance.
- Generate real random secrets into the LIVE `apps/api/.env` (gitignored; not committed).

**OUT of scope:** flipping `NODE_ENV` to `production` (dev box; would break dev-login), real
payment provider, admin partner-portal scope fixes (board P2), secret rotation/versioning.

**Success criteria:** API boots cleanly with real secrets; boots REFUSED (non-zero exit, clear
message) with placeholder/empty secrets; build + jest + vitest green.

## Gate 2 — Architecture

- New `apps/api/src/common/security/bootstrap-secrets.ts` (pure, unit-testable):
  `isPlaceholderSecret(value)` + `assertBootstrapSecrets({ jwtSecret, cookieSecret, nodeEnv })`.
- `main.ts` calls `assertBootstrapSecrets(...)` immediately after `ConfigService` is available,
  BEFORE `app.listen`. Hard-fail → throw, process exits, systemd surfaces it in journalctl.
- No DB changes, no migrations, no new deps, no i18n.

## Gate 3 — Contracts

```ts
// bootstrap-secrets.ts
export function isPlaceholderSecret(value: string | undefined): boolean;
export interface BootstrapSecretCheck {
  jwtSecret?: string;
  cookieSecret?: string;
  nodeEnv?: string;
}
export function assertBootstrapSecrets(check: BootstrapSecretCheck): void; // throws Error on bad secret
```

Placeholder detection: value missing/empty, or contains any of
`change-me`, `change_me`, `changeme`, `fallback-dev-secret`, `your-secret`, `replace-me`,
`placeholder`, or equals `secret`.

Rules:
- placeholder/missing → **throw** (any env).
- present but `< 32` chars → throw in production; **allowed in dev** (no throw).

## Contract verification checklist

- [✓] Mutation contract N/A (no mutation endpoints touched).
- [✓] No API JSON shape changed — guard is pre-listen, no response surface.
- [✓] No frontend type/adapter/i18n impact.
- [✓] New util has a jest spec (`bootstrap-secrets.spec.ts`) covering: placeholder throw, empty throw, short-in-prod throw, short-in-dev pass, valid pass.
