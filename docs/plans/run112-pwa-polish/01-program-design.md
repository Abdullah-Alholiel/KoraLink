# Run #112 — Program Design (Gates 1-3 compact)

Two items, one run: P2-164 (lane, hardening) + favorites polish (parent, user-visible).

## Item 1 — P2-164: UuidParamPipe sweep (lane)

### Problem
Every `@Param('id')` / `@Param('slotId')` in admin/* + partner controllers reaches
services as a raw string (59 routes, security-lane #110). Queries are parameterized
and 404-on-no-match, so this is hygiene/normalization — NOT injection.

### Scope
- 34× `@Param('id')` + 3× `@Param('slotId')` across 12 controllers:
  admin/{disputes,matches,pitches,reports,settlements,transactions,users,venues}.controller.ts
  + partner/partner.controller.ts. audit/metrics controllers have zero @Param.
- EXCLUDED: `@Param('key')` (settings string key — not UUID-shaped, by design).

### Design
Shared `UuidParamPipe` in `apps/api/src/common/pipes/uuid-param.pipe.ts`:
- Implements PipeTransform; parses value against UUID_SHAPE (common/validation/id-shape.ts —
  the single-source id shape, varchar(36) convention; NOT @IsUUID).
- Failure → BadRequestException(`Validation failed (uuid-shaped id expected)`),
  message reusing UUID_SHAPE_MSG. 400 (shape) vs existing 404 (no match) — both
  stay distinct and honest.
- Applied per-route `@Param('id', UuidParamPipe)` — mechanical sweep, no global
  pipe (keeps `:key` and any future non-UUID params safe by default).
- Jest spec: pipe unit tests (valid/invalid/uppercase) + controller-level tripwire
  asserting each admin/partner controller file carries UuidParamPipe on every
  @Param('id')/@Param('slotId') site (grep-based, fails when a new route forgets it).

### Acceptance
- turbo build 0 + API jest green (pipe spec + tripwire + existing suites).
- Manual probe: malformed id on one guarded admin route → 400 before auth? No —
  pipes run BEFORE guards? (Nest order: guards → pipes → handler; guards first,
  so 401 for unauth regardless of shape — correct.)

## Item 2 — Favorites polish (parent, user-visible)

### Problem (Abdullah-visible)
1. Profile wallet row renders `SAR ${x.toFixed(2)}` — Latin "SAR" + Latin digits
   for AR users; bypasses the P2-128 formatMoney convention (A-2).
2. Clubs page counts (`{n} venues` :166, `{pitch_count} pitches` :450) render
   Latin digits for AR users (B-1). BlockedCard.tsx:13 documents the convention:
   numerals route through lib/format.ts (ar-SA → Arabic-Indic), never bare.

### Design
- `formatCount(n, locale)` helper in lib/format.ts: `numberFormat(locale).format(n)`
  (en → "1,234", ar → Arabic-Indic "١٬٢٣٤"). Exported, unit-tested.
- Clubs page: locale already derived (:53); render counts via formatCount.
- Profile wallet: `formatMoney(displayBalance, locale)` replaces the template
  (en output byte-identical "SAR 1,234.00" → historical shape preserved; ar gets
  "‏١٢٣٫٤٥ ر.س.‏"). displayBalance.toFixed(2) branch removed.
- No i18n key changes (numbers only), no API changes, no adapter changes.

### Contract checklist (Gate 3)
- [x] No mutation endpoints touched (read-only surfaces).
- [x] formatCount/formatMoney: pure, locale-injected, no Intl host-locale drift
      (existing numberFormat(dateLocale) guard reused).
- [x] i18n parity untouched (no new keys).
- [x] Tests: format.test.ts additions (en/ar digits), clubs counts asserted in
      existing structure tests if any (else new pin), profile wallet render via
      existing profile tests (grep first).
- [x] Hydration: Intl formatting on client-only values; server render of counts
      — same input, deterministic output per locale (no mismatch: locale from
      pathname, stable across server/client for the same request).

### Non-goals (deferred, boarded)
- A3 (listFavoriteVenues owner-join robustness) — new P2 row, joint sweep with
  findNearby for consistency.
- A-m1 (useLocale refactor), A-m2 (deep-link soft-nav), B-2 (refuted).
