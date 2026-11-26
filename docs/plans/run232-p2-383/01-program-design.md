# Run #232 — Gates 1-3 Compact: P2-383 stable error codes

## Problem / user story
A player saving an email that's already registered, and an admin acting on a decided dispute, get branch behavior driven by matching English server prose. Any copy change (or an Arabic-locale backend response) silently breaks the branch — users see the generic error instead of "email taken"/"conflict".

## Scope
IN: (1) admin disputes.service.ts 4 throw sites gain `{message, code}` (DISPUTE_ALREADY_DECIDED / DISPUTE_NOT_DECIDED) — prose untouched; (2) admin ApiError gains optional `code` parsed from body; (3) disputes/[id] classifier code-first + regex deploy-skew fallback; (4) PWA EmailSection classifies on FetchError.status===409 / code==='EMAIL_TAKEN', regex only when no status; (5) test pins both sides.
OUT: new i18n keys (none needed — existing buckets reused), mailer service (already stable), other throw sites.

## Contracts (Gate 3)
- API: `BadRequestException({ message: '<exact original prose>', code: 'DISPUTE_ALREADY_DECIDED'|'DISPUTE_NOT_DECIDED' })` → Nest passes the object through AS-IS (flat wire body `{message, code}` — verified by this PR's own spec pins asserting `getResponse()` equals the flat object); admin apiFetch parses `body.message` (string) + top-level `body.code` → ApiError carries `.code`.
- Admin: `class ApiError extends Error { constructor(message, status, code?) }`; classifier: `code` first → 'conflict', regex fallback when code absent.
- PWA: `if (err instanceof FetchError && (err.status === 409 || err.code === 'EMAIL_TAKEN')) → t('taken')`; plain-Error fallback keeps legacy regex (deploy skew).
- i18n: zero new keys; EN+AR parity untouched (1332=1332 PWA, 872=872 admin).

## Contract verification checklist
- [x] No mutation endpoints changed (throw-shape only; callers already read status/message) ✓
- [x] Admin ApiError accepts the exact JSON the API produces ({message:{...}} vs {message:'str'} both parse) ✓
- [x] No field silently undefined: `code` optional with runtime presence checks ✓
- [x] i18n keys exist for every user-facing string (reused buckets) ✓
- [x] Mutation contract: no mutation return shapes touched ✓

## Gate 4 slices (tracer → logic)
1. Tracer: API 4 throw sites + admin ApiError.code + classifier code-first + spec pin update (disputes.service.spec.ts:168) → jest green.
2. PWA: EmailSection classification + EmailSection.test.tsx pins (409→taken, 500→error, legacy prose→taken fallback) → vitest green.
3. Full gates: turbo --concurrency=1 · PWA vitest full · admin vitest · PR flow.
