# Run #181 — Gate 0 Retro + Program Design (API lane, 181%4=1)

**Cycle:** run #181 (2026-10-31 ~10:16Z). Lane: API modules, security-lens emphasis.
**Baseline:** staging `9dd03b7` (run #180 docs).

## Gate 0 — Retrospective

- Recent cycle (runs #178–#180): disputes alerts, scoped settlements, CSV provenance,
  pending-topup polling + card, top-up amount UX, metrics throttle. fix:feat ratio healthy —
  the last 10 code PRs (#195–#204) are 3 fix / 7 feat.
- DECISIONS.md read FIRST (ledger supremacy): no owner-standard touches the picks below.
  No new owner chat decisions since run #180 → nothing to append.
- Admin state check: `git status apps/admin` + partner/admin API modules CLEAN (no ADMIN HOLD);
  admin service active.
- Picks audited against live code (not board staleness):
  - `apps/api/src/common/storage/storage.module.ts` + `storage.service.ts` EXIST (run #170);
    `S3_BUCKET_AVATARS` already provisioned in apps/api/.env → P2-50 avatar slice is real
    and unblocked.
  - `restoreUser()` TOCTOU confirmed by parent code read (users.service.ts:1103-1106):
    guarded re-check pattern used everywhere else is missing here.
- Reviewer A (glm-5.3-flash, 543s): 0 CRITICAL, 3 IMPORTANT, 4 MINOR. Reviewer B (459s):
  4 product gaps, 16 verified-ok. Standing bug classes: all clean (console 0, ::uuid 0,
  ILIKE-escape clean, eq(col,null) 0). Hex: no NEW violations (audit-controller seam noted → row).

### Reviewer findings disposition
| Finding | Disposition |
|---|---|
| A-I1 restore() TOCTOU (PDPL account resurrection race) | **FIX THIS RUN** (hardening PR) |
| A-I3 POST /reports + POST /venues/:id/reviews unthrottled | **FIX THIS RUN** (same hardening PR) |
| A-I2 audit.controller raw SQL bypasses service (hex seam) | Board row P2-292 ([P2][hex], refactor-sized) |
| A-M1 wallet verify pre-checks outside tx | Documented follow-up on P2-282 row (UNIQUE rollback is the actual guard; comment-level) |
| A-M2 client decimal-cap parity for topup input | Documented follow-up on P2-289 row (server enforces; 400 is localized) |
| A-M3/M4 GROUP BY dup keys / ::text vs .for('update') style | Cosmetic, noted only |
| B-1 venue reviews have NO admin moderation surface | Board row P2-291 (needs moderation UX decision-lite; build candidate next runs) |
| B-2 no skill/ability axis in matches | **REFUTED as re-proposal** — owner reversal on record (memory/escalation: "skill_level stays dropped"). Not re-opened. |
| B-3 join/messages unthrottled | Covered: join is wallet-debited + idempotent; chat has its own limiter (P1-42). Reports/reviews fixed per A-I3. |
| B-4 host payout has no line-item receipt | Board row P2-293 (user-visible trust surface, build candidate) |

## Gates 1–3 (compact) — item 1: HARDENING PR (restore TOCTOU + abuse throttles)

**Problem:** (a) `restoreUser` can resurrect an account that re-entered deletion concurrently
(check-then-act on an unlocked read; UPDATE has no `deleted_at IS NOT NULL` predicate).
(b) abuse-sensitive POSTs `/reports` + `/venues/:id/reviews` ride only the global 60/min cap.

**Contract (Gate 3):**
- `restoreUser(userId)`: conditional UPDATE
  `.set(...).where(and(eq(users.id,userId), isNotNull(users.deleted_at))).returning({ deleted_at })`.
  - row returned → success → `this.getProfile(userId)` (outside update, per §2).
  - 0 rows → re-read: still active → idempotent no-op (getProfile); deleted & fresh (≤ grace)
    → `ConflictException('account deleted again during restore')`; expired → the existing
    400 window-expired copy.
- `POST /reports` → `@Throttle({ default: { ttl: 60_000, limit: 5 } })`.
- `POST /venues/:id/reviews` → `@Throttle({ default: { ttl: 60_000, limit: 5 } })`.
- Spec: users.restore.spec.ts — predicate skips already-active; race re-read paths;
  reviews/reports throttle metadata present.

**Files:** apps/api/src/modules/users/users.service.ts (+ new spec), reports.controller.ts,
venues.controller.ts.

## Gates 1–3 (compact) — item 2: P2-50 AVATAR UPLOAD (user-visible)

**Problem:** `users.avatar_url` is dead schema; players can never set a photo.

**Contract (Gate 3):**
- `POST /users/me/avatar` — auth; `AVATAR_UPLOAD_ENABLED !== 'true'` → 403
  `avatar upload is not enabled` (explicit-flag pattern per P0-2, never NODE_ENV);
  ≤2 MB (`MAX_AVATAR_BYTES`), magic-sniff via StorageService; 5/min.
  → 201 `{ "avatarUrl": "/media/avatars/<userId>/<sha256>.<ext>" }` (canonical path).
- `GET /media/avatars/*` — public serve, 60/min, immutable cache, bucket-pinned, nosniff
  (mirrors venues serve; 404 unknown/foreign bucket).
- StorageService: `putAvatar/getAvatar/deleteAvatar/isManagedAvatarPath` on bucket
  `S3_BUCKET_AVATARS` (optional config: empty → typed error mapped to 503 by service;
  VPS .env already has it; Render boot stays safe).
- users.service `uploadAvatar`: size check → putAvatar → guarded
  `UPDATE users SET avatar_url WHERE id` → best-effort delete of PREVIOUS managed avatar
  object → returns `{ avatarUrl }`.
- PWA: fetcher FormData support (skip JSON Content-Type when body is FormData);
  profile identity row gets an edit affordance (hidden file input) → POST → store update +
  localized toast; failure copy per error standard (what/why/next, EN+AR:
  profile.avatarUpdated / avatarTooLarge / avatarInvalidType / avatarFailed).
  PostHog `avatar_updated` + Sentry tag `media.avatar` (observability per AGENTS §4).
- Tests: users.avatar.spec.ts (jest): happy path (storage mocked), disabled flag 403,
  oversize 400, previous-object cleanup, serve null→404 mapping; PWA fetcher FormData spec.
- NO migration (column exists), NO schema change.

**Files:** apps/api/src/common/storage/storage.service.ts, apps/api/src/modules/media/{media.controller,media.service}.ts,
apps/api/src/modules/users/users.service.ts (+ spec), apps/player-pwa/src/lib/fetcher.ts (+ spec),
profile page, messages/{en,ar}.json.

## Slice order (Gate 4)
1. Hardening PR: fix + specs → jest suite green → PR → squash.
2. Avatar PR: storage → API → serve → PWA → i18n → vitest+jest green → PR → squash.
3. Live: rebuild+restart API (+PWA), probe endpoints (403 flag-off, 401 unauth, upload
   round-trip on staging with flag ON since .env has the bucket).
