# Run #62 — Gates 1-3 (compact program design)

## Gate 1 — Product spec

**Problem:** Admin moderation on users/[id] has inconsistent blast-radius protection (ban fires
instantly while the reports flow just gained a confirm dialog) and a one-size suspension (7 days
only — moderators cannot suspend 24h or 30d, and cannot extend an active suspension without
lifting it first). API accepts a past suspend date silently and stores unbounded resolution text.

**User stories (P0/P1):** As a moderator I (a) confirm a ban with the target's name shown,
(b) pick 24h/7d/30d suspension presets, (c) extend an active suspension directly.
**Success criteria:** confirm dialog on ban; 3 presets + lift; extend-while-suspended; both
locales; DTO/guards enforced with tests.

**Out of scope:** custom date-picker suspensions, appeal channel (P1-49 owner), audit-log UX,
reports evidence/attachments (P1-38/P2-50 owner).

## Gate 2 — Architecture

- API: `resolve-report.dto.ts` + `update-report.dto.ts` → add `@MaxLength(2000)` on `resolution`.
  `users.service.ts` update() → reject `suspendedUntil` in the past with 400 (self/last-admin
  guards untouched; after-row disconnect predicate unaffected).
- Admin: `users/[id]/page.tsx` → ConfirmDialog for ban (names full_name/handle/phone);
  suspension preset menu (24h/7d/30d + Lift; when suspended → "Extend" opens the same menu);
  `act()` gains localized error surface via shared LoadError-style text (console has no toast —
  use inline role=alert like P2-61 decision-failure pattern).
- Files: 2 DTOs, users.service.ts, users/[id]/page.tsx, messages/{ar,en}.json,
  users.moderation-disconnect.spec.ts (new cases) + users.service guard cases.

## Gate 3 — Contract verification checklist

- [x] PATCH /admin/users/:id body `{ banned?: boolean; suspendedUntil?: string|null }` UNCHANGED
      on the wire — presets compute ISO strings client-side; past date now 400
      `Suspension must be in the future.` (message text pinned by jest).
- [x] POST /admin/reports/:id/resolve unchanged; `resolution` now @MaxLength(2000) — the admin
      UI textarea has no maxlength; 2000 chars ≫ any real note; the confirm-dialog flow (P1-52)
      is untouched.
- [x] users/[id] page: `act()` body shapes unchanged; new UI-only state (confirmBan,
      suspendMenu) never sent to the API.
- [x] i18n: new keys under `userDetail` (confirm dialog ×4, suspend presets ×3, extend, errors ×2)
      present in ar.json AND en.json, leaf parity re-verified (596 → 605 both).
- [x] No Drizzle schema/migration changes (no db:generate needed).
- [x] Observability: API throws already Pino-logged + Sentry-captured; no new wiring needed
      (400-class rejections are client errors, not captured by design).
