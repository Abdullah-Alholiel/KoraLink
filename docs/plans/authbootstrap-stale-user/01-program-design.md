# Program Design — AuthBootstrap stale-user self-heal (run #10)

Single compact doc (Gates 1-3). Problem, story, scope, design, contracts, i18n, checklist.

## Problem

Zustand persists `user`; the JWT behind it can expire (7d) or the account can be banned.
`AuthBootstrap` probes `/users/me` only `enabled: isHydrated && !user` — a persisted user
skips the probe, and no other code clears the stale state on 401. Result: permanently broken
authed shell until the user finds the profile logout button.

## User story

As a returning player whose session expired (or was banned), opening KoraLink should show the
login screen — not an authed shell where every page is an error state.

## Scope

- **IN:** (1) AuthBootstrap self-heal: persisted user + never-verified → probe `/users/me`
  once (session flag); on 401/403/404 → `clearAuthToken()` + `logout()`. On success →
  `login()` refresh. (2) Fetcher global 401 handler: `clearAuthToken()` + `store.logout()`
  + redirect to `/{locale}/login` for non-auth endpoints (whitelist: `/auth/`, `/users/me`
  bootstrap call). (3) Vitest coverage: self-heal on 401, success refresh, no redirect for
  `/auth/*`.
- **OUT:** token refresh/renewal flow (no refresh-token infra; product decision, separate
  cycle) · admin console (already fixed run #9) · middleware redesign · `/users/me` shape
  changes.

## Architecture delta

- `AuthBootstrap.tsx`: add `sessionKey = 'koralink_bootstrap_run'` (sessionStorage). When a
  persisted user exists AND flag unset → run the same bootstrap query (probe variant).
  Set the flag before the probe; on failure → clear flag + `logout()` + `clearAuthToken()`;
  on success → update store + keep flag (one probe per browser session = cheap).
- `fetcher.ts`: after `FetchError` construction, if `status === 401` and path is not
  `/auth/*` and not `/users/me` → fire-and-forget global handler: `clearAuthToken()`,
  `useAppStore.getState().logout()`, redirect `window.location.href = '/login'` (root
  redirect → middleware locale-resolves, matching existing admin pattern of URL-based
  bounce; avoids importing i18n into fetcher).
- Import direction: fetcher → store is a NEW edge (store imports nothing from fetcher —
  verified: `useAppStore.ts` has no fetcher import; no cycle).

## API contract (unchanged, verified)

- `GET /users/me` — 200 `{ id, phone, full_name, handle, avatar_url, skill_level,
  preferred_location, preferred_position, ... }` (UserProfileApi) / 401 / 404.
- No backend changes. No DB changes. No migration.

## TS signatures

- `AuthBootstrap` (unchanged export, no props).
- `fetcher<T>(path: string, options?: FetchOptions): Promise<T>` — unchanged signature;
  new private side-effect only.

## i18n keys

None — no user-facing copy added (redirect is a URL bounce; logout state reuses existing
login screen). Both locales untouched.

## Gate 3 contract verification checklist

- [x] Every mutation endpoint returns populated object — N/A (no endpoint changes).
- [x] Frontend types accept backend JSON — unchanged `/users/me` shape, adapter untouched.
- [x] Adapter functions exist for consumed shapes — unchanged (`adaptUserProfile` path
      already exercised by cold-load bootstrap).
- [x] No field silently undefined — unchanged mapping; failure path clears store instead.
- [x] i18n keys exist for every user-facing string — no new strings (both locales verified
      untouched).
- [x] No import cycle introduced — store does not import fetcher (grep-verified).
- [x] Redirect target works — `/login` handled by existing middleware/locale redirect.
