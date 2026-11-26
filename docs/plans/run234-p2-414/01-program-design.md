# Run #234 — P2-414 sectionForPath unvalidated partner cast (compact)

## Gate 0
Reviewer A #234 MINOR-3 confirmed by parent code read: `rbac.ts` partner branch returned
`partner.${sub}` cast for ARBITRARY input; HQ branch validated against KNOWN_SECTIONS but the
partner branch never validated. Denial of bogus paths (/partner/bogus) worked only by ACCIDENT
(invented key misses every SECTION_BY_ROLE list). One consumer: `canAccessPath` (layout guard).
**Deny-semantics trap found pre-build:** returning `null` for bogus paths would have flipped them
to ALLOWED (null = "outside console" = allow lane) — a regression disguised as a cleanup.

## Gate 1-3 (compact)
- New `UNKNOWN_SECTION` exported sentinel (`'__unknown__'`, deliberately absent from
  SECTION_BY_ROLE → denied for every role, including null-role via `!role` guard).
- `KNOWN_PARTNER_SECTIONS` derived from SECTION_BY_ROLE (single-source preserved, P2-400e).
- partner branch: known sub → section; unknown sub → UNKNOWN_SECTION (never the invented cast).
- `canAccessPath` untouched — sentinel flows through `includes()` → false. Type stops lying.
- Tripwire: rbac-parity.test.ts pins /partner/bogus + /partner/../admin → UNKNOWN_SECTION,
  deny-for-all-roles (incl. null), real partner path still allows VenueOwner.

## Gates (lane tree, real output)
- apps/admin vitest: **Test Files 4 passed (4) · Tests 55 passed (55)** (+1 new pin test)
- tsc --noEmit: exit 0
- Rollback: single squash revert; no schema/env/infra touch.
