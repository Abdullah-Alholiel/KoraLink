# Run #154 — Program Design (P2-228 + P2-235 + wallet fallback)

## Problem
1. **P2-228:** PaymentSheet stores raw `err.message` (backend English → Arabic-first users) and
   renders ONE generic `errors.walletPayFailed` regardless of cause; an offline tap hits a raw
   network failure with no guard.
2. **P2-235:** the consent checkbox line renders `t('host.disclaimer') +
   t('host.disclaimerText').slice(0, 80) + '...'` — users consent to a policy they can only read
   80 characters of (PDPL-adjacent consent-flow weakness), in BOTH locales.
3. **Reviewer A run #154 IMPORTANT:** `wallet.service.ts getHistory` reports `total=0` on a
   beyond-end page (stale offset, pruned rows) — the exact bug PR-Agent r1 fixed for
   conversations in PR #161, not ported to wallet.

## Scope
IN: PaymentSheet classify→localized copy (all ErrorKinds), no-money-taken reassurance (always
on failure), offline guard (hook + banner + CTA copy/disable + event-time guard), full consent
text with in-place expander (PWA lane); wallet getHistory degenerate-COUNT fallback (API lane,
same PR). OUT: sheet-level success state (Reviewer B P2 — parent already navigates + refreshes
on success), Intl.NumberFormat currency formatting (app-wide convention change), raw-`SAR`
payment.total copy line (line 145 area — identical convention, separate sweep).

## Contracts (Gate 3 checklist)

### Exact JSON shape changes
- `GET /wallet/history` (and the service return): NO shape change. `total` semantics FIXED:
  beyond-end page now reports the TRUE transaction count (fallback `SELECT COUNT(*)` with the
  identical predicate) instead of 0; `hasMore = skip + perPage < total` unchanged.

### TS signatures
- `PaymentSheetProps` UNCHANGED (P2-239's `currency?` prop already in place).
- `classifyError(err): ErrorKind` + `errorKey(kind): string` — existing `lib/error-classify.ts`,
  consumed, not extended.
- `getHistory(userId, page?, perPage?, fromDate?, toDate?): Promise<{ transactions, total, hasMore }>`
  — unchanged signature.

### Component behavior
- handlePay guard: `!agreed || isJoining || !isOnline` → return (belt) + CTA `disabled` when
  `!isOnline` (braces) showing `errors.network` as its label; OfflineBanner (plain) renders
  above the CTA when offline.
- Error render: `role=alert` block — line 1 `t(errorKey(classifyError(err)))`, line 2
  `payment.noMoneyTaken` (always; the wallet debit is INSIDE the join tx → any throw = no charge).
- Consent: full `host.disclaimerText` (line-clamp-2 collapsed) + `payment.readFullPolicy` /
  `payment.readLessPolicy` toggle with `aria-expanded`.

### i18n keys (both en.json + ar.json, payment namespace)
| key | en | ar |
|---|---|---|
| payment.noMoneyTaken | No money was taken from your wallet. | لم يتم خصم أي مبلغ من محفظتك. |
| payment.readFullPolicy | Read full policy | اقرأ السياسة كاملة |
| payment.readLessPolicy | Show less | إظهار أقل |

Parity verified programmatically (21 payment keys each side).

### Contract verification checklist
- [x] Mutation contract untouched (join endpoint not modified — sheet-side only).
- [x] Frontend types accept backend JSON — no new fields consumed.
- [x] Adapter functions unchanged (no API shape change).
- [x] No field silently undefined — `joinError` holds an authored i18n STRING (resolved via `t`
  at set-time; locale switch mid-error shows the old locale's line until next failure — accepted,
  same trade-off as HostMatchForm).
- [x] i18n keys exist in BOTH languages (asserted in the generator script + tests).
- [x] Every interactive element wired: expander button (onClick + aria-expanded), CTA (guarded).
