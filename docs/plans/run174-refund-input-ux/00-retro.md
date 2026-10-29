# Refund-input UX hardening — Cycle docs (run #174, P2-273)

## Gate 0 — Retro (compact)
- Area audited: admin disputes resolve flow (PR #190 fededb1, run #173) + Reviewer A run-#174 findings.
- **DECISIONS.md read first (ledger supremacy)**: no owner standard contradicted — this is a
  validation/feedback fix on an existing money path, no design/UX reversal.
- Recent commits: fededb1 (refund path), 5b30ae5 (verify polish) — both verified on origin/staging
  by Reviewer B (5/5 claims VERIFIED with file:line evidence).
- Tech debt observed: client-side parse drops invalid input silently; DTO accepts refund with
  outcome=rejected. No fix:feat regression (both items are hardening of a fresh feature).
- Reviewer A run-#174 security lens: all 12 admin controllers guarded (AdminAuthGuard hard-rejects
  non-Admin roles), UUID param validation, refund DTO complete, idempotency + reopen guard sound,
  audit verbs wired. VERDICT PASS.
- Finding→story cascade: admin enters "12,5" or a currency symbol → parseFloat NaN → field omitted
  → resolve succeeds with NO refund and NO warning → player not compensated, admin believes they
  were. Money-path trust defect.

## Gates 1-3 — Program design (single doc)

**Problem:** the admin refund input (P1-29 UI) silently ignores unparseable/invalid entries and the
API silently ignores a refund sent with outcome=rejected.

**User story:** as an admin resolving a dispute, when I type a refund amount that isn't a clean
positive number, I must be BLOCKED with a localized inline error before submit — and the API must
reject (400) a refund paired with outcome=rejected instead of silently dropping it.

**Scope IN:** (a) client validation gate — non-empty but unparseable/≤0 input blocks submit with
an inline `refundInvalid` error; empty stays legal (refund optional); (b) API contract tighten —
refundAmountSar + outcome=rejected → 400 (DTO conditional validation); (c) spec coverage both sides;
(d) i18n `disputes.refundInvalid` EN+AR.

**Scope OUT:** refund provenance cap vs match fees (MINOR 3 — trusted-HQ-role by design; not
defaulted, noted for owner), admin-wide loading-state parity (separate row P2-274), any new UI
components.

**API contract delta (exact):**
- `POST /admin/disputes/:id/resolve` with `{outcome:'rejected', refundAmountSar: 5}` → **400**
  `{"message": "refundAmountSar is only allowed when outcome is resolved.", "error":"Bad Request","statusCode":400}`
  (BadRequestException(string) → Nest emits `message` as a STRING, not an array — verified r2 #192).
- All existing valid shapes unchanged (resolved+amount, resolved without amount, rejected without
  amount). Reopen→re-resolve ledger contract untouched.

**TS signatures:**
- DTO: add conditional check — `@ValidateIf((o) => o.outcome === 'rejected' && o.refundAmountSar !== undefined)` style via a class-validator custom constraint or manual `validate` guard in service entry. Chosen: **service-level guard** (explicit, single test point, mirrors the reopen-guard pattern) + DTO comment. Rationale: class-validator conditional decorators on cross-field rules are brittle to ordering; a service guard is the file's established idiom.
- Client: `resolve()` early-returns with `setRefundInvalid(...)` when `refundAmount.trim() !== '' && (!Number.isFinite(n) || n <= 0)`.

**i18n keys:** `disputes.refundInvalid` (en + ar, admin console messages).

**Contract verification checklist:**
- [x] Mutation contract preserved (resolve returns findOne outside tx — untouched).
- [x] Frontend (admin) can accept the exact JSON the backend produces (400 shape handled by existing saveError path — apiFetch surfaces message).
- [x] No field silently undefined: refundInvalid only renders when set; cleared on submit attempt.
- [x] i18n keys exist in BOTH locales before build.
- [x] No migration (no schema change).

## Defaults+48h-veto register
- NONE new this run. (MINOR 3 refund provenance cap is owner-optional hardening, NOT defaulted —
  recorded in the run report only.)
