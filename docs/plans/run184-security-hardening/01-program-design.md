# Run #184 — Program Design (Gates 1–3 compact)

## Items
1. **P1-70 — Evict removed/leaving players from match realtime rooms** (API)
2. **P1-71 — Validate `avatar_url` on `PATCH /users/me` (managed-path allowlist)** (API)

---

## Item 1 — P1-70

### Problem / user story
A player removed from a match (or leaving) keeps receiving the room's `new-message`,
`status-update`, `roster-update`, `pom-decided` broadcasts until their socket disconnects —
continued read access to a lobby they are no longer a member of (audit run-5 R5-1, CONFIRMED).

### Scope
IN: `evictFromMatch(matchId, userId)` on AppGateway; called post-tx from `removePlayer`
(host removal) and `leaveMatch` (self-leave). Unit specs both call sites.
OUT (this run): R5-2 leave-conversation UUID validation (follow-up note on P1-70);
cancelMatch/auto-cancel paths (audit's evidence names removePlayer; sweep = best-effort
documented follow-up); PWA-side 'removed' UX event.

### Architecture delta
- `AppGateway.evictFromMatch(matchId, userId): Promise<void>` — the room name is built
  INTERNALLY (`match:${matchId}`) exactly like every other gateway method; callers never
  construct room names (P2-6 room-name injection surface unchanged). Server-side sweep:
  `this.server.in(`match:${matchId}`).fetchSockets()` → filter
  `s => (s.data?.userId ?? (s as any).userId) === userId` → `await s.leave(room)`.
  Socket.IO's `fetchSockets()` restores `data` from the adapter (this codebase's handshake
  assigns `client.userId` AND `client.data.userId` — defensive dual read, non-fatal).
  Never touches the user's personal room or `ops`.
- `MatchesService.removePlayer` / `leaveMatch`: after the tx commits and BEFORE the roster
  broadcast, `await this.appGateway.evictFromMatch(matchId, targetUserId/userId)` — eviction
  precedes `broadcastRosterUpdate` so the removed user cannot observe the post-removal state.
  Wrapped in its own try/catch: eviction failure must NOT fail the removal request (room
  membership self-heals on the next REST-403/reconnect; fan-out residue is the soft state).

### Gate 3 contract verification checklist
- [✓] No API response shape changes (internal WS room state only) — mutation endpoints keep
      returning `this.findOne(id)` untouched.
- [✓] No DB schema change; no migration; no i18n keys (no UI copy).
- [✓] TS signatures: `evictFromMatch(matchId: string, userId: string): Promise<void>`;
      `removePlayer(hostId, matchId, targetUserId)` and `leaveMatch(userId, matchId)`
      signatures unchanged.
- [✓] Room name construction stays inside AppGateway (grep-verifiable invariant).
- [✓] Unit specs pin: evict called post-tx from both methods with the right user id;
      evictFromMatch filters by identity and calls `leave` only on the target's sockets.
- [✓] Existing suites must stay green: joins/locks specs construct MatchesService with a
      bare `{}` gateway stub — a new awaited call on `undefined` would throw. Mitigation:
      specs that DO exercise post-tx paths use `appGateway: { ... }` stubs; add
      `evictFromMatch: async () => {}` where missing (verify per-spec at build time).

## Item 2 — P1-71

### Problem / user story
`PATCH /users/me` persists any string as `avatar_url` (any scheme/host). The codebase's own
managed-asset invariant (media module) is bypassed; stored-URL primitive is SSRF-ready for
future server-side consumers (Strix HIGH).

### Scope
IN: shared validator `isValidManagedAvatarUrl` in `apps/api/src/common/utils/`; DTO guard
(@Validate + service-side re-validation as the canonical gate, 400 with a clear message);
empty-string clears the avatar (contract kept); `null` normalizes to '' pre-validator;
UPDATE tripwire spec (attack vectors + legal values + clear path).
OUT: migrating existing stored values (backfill sweep is owner-optional later); avatar
UPLOAD path (already canonical); PWA UX (no copy change — failures surface via the standard
error toast, localized generic; no new i18n key needed since the PWA never sends illegal
values in normal flows).

### Architecture delta
- `common/utils/managed-avatar.ts`:
  ```ts
  export function isValidManagedAvatarUrl(url: string | null | undefined): boolean {
    if (url == null) return true;                       // absent/null → legal (no-op)
    if (url === '') return true;                        // explicit clear → legal
    return /^\/media\/avatars\/[A-Za-z0-9/._-]+$/.test(url) && !url.includes('..');
  }
  ```
  Mirrors `StorageService.isManagedAvatarPath` shape-for-shape (kept as the upload-side
  canonical; the mirror documents the shared contract in both docblocks).
- DTO: `@Validate(customAvatarUrlValidator)` class-validator custom constraint on
  `avatar_url?` (keeps IsOptional semantics: undefined skips) + `@MaxLength(255)`.
- Service: `if (dto.avatar_url !== undefined && !isValidManagedAvatarUrl(dto.avatar_url))
  throw new BadRequestException('avatar_url must be a managed media path.')` — the canonical
  gate (DTO validation can be bypassed by internal calls; the service cannot).
- Callers: media uploads already persist `/media/avatars/...` — untouched. PWA profile
  update sends only managed values; `avatar_url: null` normalization happens in
  `updateProfile` BEFORE validation (`avatar_url === null → ''`) preserving the clear path.

### Gate 3 contract verification checklist
- [✓] PATCH response shape unchanged (same returning() columns; invalid input → 400 before
      any write).
- [✓] Empty-string clear path preserved end-to-end (legal per validator; existing profile
      flows verified by spec).
- [✓] No field silently undefined: validator returns true for null/undefined/'' — only
      non-managed non-empty strings are rejected.
- [✓] i18n: no new user-facing copy (API 400 message is dev-facing; PWA classifyError maps
      400s to the existing localized generic). Both locales untouched — parity unaffected.
- [✓] No DB change. No migration.
- [✓] Observability: no new wiring needed (400s flow through the standard exception filter;
      no error-class events — validation rejections are client errors, not server faults).

## Verification plan (both items)
`npx jest` (users + matches + gateway suites) → `npx tsc --noEmit` (API) →
`npx turbo run build --concurrency=1` → PWA `npx vitest run` (regression sweep) →
`node hex-audit.mjs` → PR gates → live restart + probe.
