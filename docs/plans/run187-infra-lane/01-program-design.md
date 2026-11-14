# Run #187 — Program Design (compact Gates 1-3)

Two items: **P2-307** (user-visible) + **P2-308** (hardening rider).

## Item 1 — P2-307: VenuePickerSheet error state (PWA)

**Problem:** a failed /venues fetch renders `host.noVenuesFound` — error masked as empty on the host venue-picker (VenuePickerSheet.tsx:75-89).

**User story:** as a host, when the venue list fails to load I must see an error with a retry — not be told my city has no venues.

**Scope IN:** isError branch in VenuePickerSheet; retry via `refetch()`; classified error copy. **OUT:** feed/club pickers (different sheets, already have their own states), pagination, new endpoints.

**Contract (Gate 3):**
- Hook: `useVenues()` already returns `{ data, isLoading, isError, error, refetch }` (React Query) — no hook change.
- Component: `<ErrorState title={t(errorKey(classifyError(error)))} onRetry={() => refetch()} retryLabel={t('common.retry')} />` — same call-shape as my-games/page.tsx:100-104.
- i18n: ZERO new keys (errors.network/server/validation/unknown + common.retry exist EN+AR, parity 1185=1185).
- Files: VenuePickerSheet.tsx only (+ test).

**Verification checklist:** ✓ mutation contract N/A (read-only) · ✓ frontend type accepts API shape (unchanged) · ✓ adapter unchanged · ✓ no silently-undefined field · ✓ i18n keys exist both locales (no additions needed).

## Item 2 — P2-308: audit-list hardening (API)

**Problem:** GET /admin/audit-logs rides only the global throttle; ListAuditDto.entityType is bare `@IsString`, adminId bare `@IsString` (malformed id silently matches nothing).

**Contract:**
- `@Throttle({ default: { ttl: 60_000, limit: 60 } })` on AdminAuditController's GET (matches metrics.controller.ts:15 pattern; read-only so 60/min not 10/min).
- `entityType: @IsOptional() @IsIn([...11 exact strings as the page's ENTITY_TYPES constant...])`.
- `adminId: @IsOptional() @IsUUID('all')` — varchar(36) ids are UUID-shaped (36 hex/dash), IsUUID matches, NOT a `::uuid` cast (no SQL change).
- Files: audit.controller.ts, dto/list-audit.dto.ts (+ spec).

**Verification checklist:** ✓ no DB change (validation-only) · ✓ invalid entityType now 400 instead of silent empty · ✓ admin UI unaffected (sends only valid values) · ✓ throttle constant style matches siblings.

## Test plan
- PWA: extend the picker test file if one exists (VenuePickerSheet has none — add `test/components/VenuePickerSheet.test.tsx`: loading skeleton, list, empty (no search), empty (with search), ERROR branch with retry click → refetch called).
- API: extend audit-list.lift.spec.ts (or new audit-list.dto.spec.ts): entityType outside enum → 400; adminId malformed → 400; valid pass-through.
