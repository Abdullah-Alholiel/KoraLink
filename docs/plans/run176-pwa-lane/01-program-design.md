# Run #176 — Gates 1-3 Compact (P2-278 fetcher origin allowlist)

## Gate 1 — Product (compact)
**Problem:** the PWA fetcher attaches the stored Bearer JWT to any absolute URL a
caller passes, so a single compromised/buggy call site can exfiltrate the session
token cross-origin (Hunt run-#175 R4-1, MINOR). Prod exposure is low (cookie-only
per P2-240), but dev-login/cross-site flows still ride the token path.
**User story:** as a player, my session token must only ever leave the device for
KoraLink's own API origin.
**Scope:** IN — Authorization header gated on same-origin-as-apiBase; tripwire
specs. OUT — changing credentials: 'include' (cookie mode unaffected), changing
any call site, CSP.

## Gate 2 — Architecture (compact)
Single file change in `apps/player-pwa/src/lib/fetcher.ts`:
- After `const url = new URL(...)`, compute `const isApiOrigin = url.origin === new URL(apiBase).origin;`
- Attach `Authorization` only when `isApiOrigin`. The PDPL restore-token fallback
  (P0-6) also passes through the same gate — restore path always targets the API,
  so behavior is unchanged.
- `credentials: 'include'` stays unconditional (cookie same-site policy is enforced
  by the browser, not by us; P2-240 prod contract untouched).

Data flow: caller → fetcher → (same-origin? attach Bearer : skip) → fetch.

## Files changed
| File | Change |
|---|---|
| apps/player-pwa/src/lib/fetcher.ts | origin-gated Authorization attach |
| apps/player-pwa/test/fetcher.test.ts | 3 new tripwire specs (same-origin attach; cross-origin never attaches; restore-token fallback still works) |

## Gate 3 — Contract (exact shapes)
- `fetcher<T>(path: string, options?: FetchOptions): Promise<T>` — signature unchanged.
- Behavior contract: for `path` starting with `http` where `new URL(path).origin !== new URL(apiBase).origin` → NO `Authorization` header (Bearer omitted entirely). For relative paths and same-origin absolutes → Bearer attached exactly as before when a token is stored.
- i18n: none (no user-facing strings).
- Test contract (new specs): (1) relative path + stored token → `Authorization: Bearer <t>`; (2) absolute foreign URL + stored token → NO Authorization key at all; (3) `/users/me/restore` relative + restore token → Bearer restore token (P0-6 contract preserved).

## Contract verification checklist
- [x] Frontend types unchanged (FetchError, FetchOptions untouched).
- [x] No adapter/hook/i18n changes needed.
- [x] No silent-undefined fields (header omission is the intended observable).
- [x] No user-facing strings → no i18n keys.
- [x] Existing passthrough test ('works with fully qualified URLs') asserts URL only — unaffected.

---

# Item 2 — P2-279 wallet last-top-up-attempt status card (Gates 1-3 compact)

## Gate 1 — Product (compact)
**Problem (Reviewer B #176 I-1):** a failed/unconfirmed 3DS top-up renders its
error once on the callback page, then leaves NO player-visible trace — the wallet
page shows only completed ledger transactions. A player whose bank was charged
but whose verify never ran has no way to even remember the attempt.
**User story:** as a player, my wallet shows my most recent top-up attempt with
its true state, so an unconfirmed attempt doesn't vanish.
**Scope:** IN — `GET /wallet/topup/latest` (newest intent for the caller),
wallet-page card for the newest PENDING intent only; OUT — withdrawal (owner
call), admin surfaces, history of attempts (backlog), changing intent lifecycle.

## Gate 2 — Architecture (compact)
API: `WalletTopupService.getLatestIntent(userId)` → newest row by created_at for
the user (index `wallet_topup_intents_user_created_idx` covers it). Controller:
`GET /wallet/topup/latest` under the existing JwtCookieAuthGuard + `@Throttle`
(GET shape — throttle default). PWA: `useLatestTopupIntent` hook (react-query,
['wallet','topup-latest'] — invalidated alongside balance/history after verify);
wallet page renders a status card ONLY when `status === 'pending'` (credited
attempts already appear as ledger transactions; there is no 'failed' writer —
intents stay pending on failure, verified in wallet.topup.service.ts). Card has
a "Try again" action opening the existing top-up modal.

Money-truth rule: pending copy NEVER claims a refund or a charge — it says the
attempt is unconfirmed and nothing has been added; if the bank shows a charge,
contact support (matches the P2-276 copy standard).

## Gate 3 — Contract (exact shapes)
`GET /wallet/topup/latest` → `200 {"intent": null}` when the user has no intents;
otherwise `{"intent": {"id": "uuid", "amountSar": 25, "status": "pending"|"credited",
"createdAt": "2026-10-29T15:00:00.000Z"}}`. `amountSar = amount_halalas / 100`
(number). 401 when unauthenticated (guard). PWA hook returns
`{ intent: LatestTopupIntent | null }`; card renders only for `status: 'pending'`.
i18n keys (wallet.topup ns, EN+AR): `lastAttemptPendingTitle`,
`lastAttemptPendingBody` (ICU `{amount}`), `lastAttemptRetry`.
Render uses `formatMoney(amountSar, locale)` (Arabic-Indic digits in AR).

## Contract verification checklist
- [x] Endpoint returns a fully populated object (or explicit `null`) — no bare rows.
- [x] PWA type `LatestTopupIntent` matches the JSON exactly; adapter maps halalas→SAR server-side (no client re-derivation).
- [x] Hook exists for the shape (useLatestTopupIntent); card consumes the hook, not fetcher (hex).
- [x] No silently-undefined fields (null intent → no card, explicit).
- [x] i18n keys in BOTH en.json and ar.json (parity-checked programmatically).

