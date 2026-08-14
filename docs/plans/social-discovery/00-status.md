# Location & Social Discovery — Cycle Status

| Gate | Name | Status | Approved | Artifact |
|------|------|--------|----------|----------|
| 0 | Retrospective | ✅ APPROVED | 2026-08-14 | [00-retro.md](./00-retro.md) |
| 1 | Product Spec | ✅ APPROVED | 2026-08-14 | [01-product.md](./01-product.md) |
| 2 | Architecture | ✅ APPROVED | 2026-08-14 | [02-architecture.md](./02-architecture.md) |
| 3 | Program Design | ✅ APPROVED | 2026-08-14 | [03-program-design.md](./03-program-design.md) |
| 4 | Vertical Slices | 🚧 IN PROGRESS | — | — |

## Tracks

| Track | Feature | Priority | Depends on |
|-------|---------|----------|------------|
| A | Full location services | P0 | HTTPS secure context |
| B | Play screen rich first-look | P0 | A (distance) |
| C | Follow + direct messaging | P1 | — |
| D | Lively activity feed + triggers | P1 | A, C |

## Slice progress

| Slice | Description | Status | Commit |
|-------|-------------|--------|--------|
| A1 | geolocation + clubs distance + radius 50 | ✅ DONE | `7634a48` |
| A2 | play distance + location persistence | ✅ DONE | `fada533` |
| B1 | all-games date sections + calendar toggle | ✅ DONE | `fada533` |
| C1 | follow graph (schema + endpoints + UI) | ✅ DONE | `a610671` + `d0d4ab4` |
| C2 | DM + WS rooms + conversation UI | ✅ DONE | `a610671` + `d0d4ab4` |
| D1 | activity model + feed + triggers | ✅ DONE | `a610671` + `d0d4ab4` |
| D2 | in-app notifications UI | ⏸️ PARTIAL | — |

### D2 remaining (follow-up)
- Backend `GET /users/me/notifications` + `POST /users/me/notifications/read` are **live** (verified).
- `useNotifications` hook + `ActivityCard` exist; a dedicated notifications screen
  (bell → list) is **not yet built** — the feed already surfaces the same
  activity stream. Observability (Pino/Sentry/PostHog) is already wired via the
  existing providers + fetcher breadcrumbs.

## Blockers

- **HTTPS prerequisite** (geolocation secure context) — blocked on sudo.
  See [04-https-prerequisite.md](./04-https-prerequisite.md). On-device distance
  won't render over plain HTTP; all other features work. Localhost dev is fully
  functional.
