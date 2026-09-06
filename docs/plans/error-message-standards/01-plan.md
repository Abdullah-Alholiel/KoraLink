# Error Message Standards — Gates 1–3 (compact)

## Gate 1 — Product

**Problem:** failures across the PWA are raw backend text (English in the Arabic UI), vague ("Something went wrong") in money flows, or silent. Standard adopted by Abdullah: every user-facing failure = **what happened + why + what to do next**, localized EN+AR, never raw internals, never silent.

**User stories**
- P0 — As a player topping up my wallet, when the top-up fails I see what happened, whether my money moved, and what to do.
- P0 — As a player logging in with OTP, when the code is wrong/expired or the service is down, I see a localized message telling me what to do next.
- P1 — As a player joining/leaving/waitlisting a match, when the action fails I get a localized, actionable message (never backend English).
- P1 — As any user hitting a route crash, I see a localized error screen with a retry — no internals.
- P1 — As a player paying from wallet, a payment failure is surfaced with the same standard (no silent onError).

**Scope:** PWA error surfaces only (fetcher-classified client errors; API 4xx message contract unchanged). **Out of scope:** API copy changes, success-copy localization (logged M2), Moyasar integration (P0-2).

**Success criteria:** no raw `err.message` rendered on any audited surface; all new copy in `errors.*` EN+AR; wallet failure states name the flow + reassurance; vitest + build green.

## Gate 2 — Architecture

One shared classifier + one i18n namespace; flows map `FetchError` → key at the last responsible moment (hook or page), render via existing surfaces (toast / inline `<p>` / error screen). No API changes, no new components except a small `<Toast>` detail line.

```
FetchError{status,message} ──► lib/error-classify.ts ──► ErrorKind
ErrorKind + flow ──► i18n key (errors.<kind>) ──► Toast(message,detail) / inline text / error.tsx
```

Files changed: `lib/error-classify.ts` (new), `lib/publish-error.ts` (delegates), `store/slices.ts` (+`detail?` on Toast), `components/layout/Toast.tsx` (renders detail), `messages/en.json`+`ar.json` (`errors` ns), wallet page, `useMatchActions.ts`, match page waitlist toasts, login/verify pages, `error.tsx`, tests (`test/lib/error-classify.test.ts` new; wallet/matchActions/i18n tests extended).

## Gate 3 — Program Design (contracts)

### Classifier — `lib/error-classify.ts`

```ts
export type ErrorKind =
  | 'network' | 'unauthorized' | 'forbidden' | 'notFound'
  | 'conflict' | 'validation' | 'rateLimited' | 'server' | 'unknown';

export function classifyError(err: unknown): ErrorKind;
// FetchError.status → 0/network-message→network; 401→unauthorized; 403→forbidden;
// 404→notFound; 409→conflict; 400/422→validation; 429→rateLimited; ≥500→server; else unknown
export function errorKey(kind: ErrorKind): string; // `errors.${kind}`
```

`publish-error.ts` keeps its public API (`classifyPublishError`, `PUBLISH_ERROR_KEYS`) but computes kinds via `classifyError` (insufficient-balance / slot-taken message checks first, then kind mapping). No consumer changes.

### i18n keys — `errors` namespace (EN shown; AR authored in same cycle)

| Key | EN copy |
|---|---|
| `errors.network` | Connection problem — check your internet and try again. |
| `errors.unauthorized` | Your session expired. Sign in again to continue. |
| `errors.forbidden` | You don't have access to do this. |
| `errors.notFound` | This item is no longer available. |
| `errors.conflict` | That change was just made by someone else. Refresh and try again. |
| `errors.validation` | Some details are missing or invalid. Review them and try again. |
| `errors.rateLimited` | Too many attempts. Wait a moment and try again. |
| `errors.server` | Our servers hit a snag — your data is safe. Try again in a moment. |
| `errors.unknown` | That didn't work. Try again — if it keeps failing, check your connection. |
| `errors.walletTopupFailed` | Your top-up didn't go through — no money was taken. Please try again. |
| `errors.walletPayFailed` | Your payment didn't go through — no money was taken. Please check your wallet balance and try again. |
| `errors.joinFailed` | Couldn't join the match — it may be full or closed. Refresh and try again. |
| `errors.leaveFailed` | Couldn't leave the match. Check your connection and try again. |
| `errors.cancelFailed` | Couldn't cancel the match. Try again — players have not been notified. |
| `errors.startFailed` | Couldn't start the match. Try again in a moment. |
| `errors.completeFailed` | Couldn't complete the match. Try again in a moment. |
| `errors.rescheduleFailed` | Couldn't reschedule — the slot may have been taken. Pick a different slot. |
| `errors.waitlistJoinFailed` | Couldn't join the waitlist — it may already be open or you may be in it. Refresh and try. |
| `errors.waitlistLeaveFailed` | Couldn't leave the waitlist. Check your connection and try again. |
| `errors.otpFailed` | That code didn't work — it may have expired. Request a new one. |
| `errors.otpSendFailed` | Couldn't send the code right now. Check your number and try again. |
| `errors.genericRetry` | Try again |

Style rule: each key ≥ what+why+action (or an honest reassurance where money is involved). Arabic: same structure, verified RTL, Tajawal-safe.

### Toast extension (backward compatible)

```ts
// store/slices.ts
interface Toast { id: string; message: string; type: ToastType; detail?: string; meta?: ToastMeta }
showToast(message, type, meta?) // meta gains: detail?: string
```
`Toast.tsx` renders `detail` as a `text-xs opacity-90` second line when present (only error toasts use it this cycle).

### Call-site mapping (locked)

| Surface | On failure | Copy |
|---|---|---|
| wallet page topup | inline `topUpError` | 403 → existing `wallet.topupDisabled`; else `errors.walletTopupFailed` (replaces `common.error`) |
| wallet page pay (when wired) | inline | `errors.walletPayFailed`; `usePayWallet` onError surfaces via page state, never silent |
| match actions ×5 | toast | kind-specific key: conflict→`errors.conflict`, forbidden→`errors.forbidden`, network→`errors.network`, server→`errors.server`, else flow key (e.g. `errors.joinFailed`) |
| waitlist join/leave toasts | toast | `errors.waitlistJoinFailed` / `errors.waitlistLeaveFailed` (replace raw `err.message`) |
| login send-OTP | inline `error` | `errors.otpSendFailed` (never raw) |
| verify confirm/resend | inline `error` | `errors.otpFailed` |
| login restore | inline `restoreError` | `errors.unauthorized` |
| `error.tsx` | screen | `common.error` + `common.errorDescription` + Retry; `error.message` REMOVED (digest already in Sentry via captureError) |

Hooks receive `t`-free strings? No — pages/hooks resolve i18n via `useTranslations('errors')` (hooks are client components; pattern already used elsewhere). Classifier is pure and testable without i18n.

### Verification checklist (Gate 3 exit)

- [x] Classifier pure; status→kind map covers all FetchError statuses
- [x] Every new string has EN+AR entries under `errors.*`
- [x] No raw `err.message` remains on audited surfaces (grep-gated in Slice 3)
- [x] Toast `detail` backward-compatible (optional; no existing caller breaks)
- [x] publish-error public API unchanged (existing tests must stay green untouched)
