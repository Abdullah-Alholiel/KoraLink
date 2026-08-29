# Gate 4 — Cycle Status: no-show feed accuracy + underfill protection

| Gate | Name | Status | Artifact |
|------|------|--------|----------|
| 0 | Retrospective | ✅ DONE | [00-retro.md](./00-retro.md) |
| 1 | Product Spec | ✅ DONE | [01-product.md](./01-product.md) |
| 2 | Architecture | ✅ DONE | [02-architecture.md](./02-architecture.md) |
| 3 | Program Design | ✅ DONE | [03-program-design.md](./03-program-design.md) |
| 4 | Vertical Slices | ✅ DONE | slices below |

> User approval for autonomous full-cycle delivery per standing instruction
> ("continue in best standard" pattern on bug+feature requests).

## Slices

| Slice | Scope | Verification |
|-------|-------|--------------|
| 1 | No-show notification accuracy: self-mark 400 guard, choke-point actor filter in `activities.record()`, clear-mark sends no notification | `matches.mark-noshow-notification.spec.ts` 5/5, `tsc --noEmit` clean |
| 2 | `min_players` + `last_nudge_at` schema columns, migration `0021_famous_snowbird`, server-computed minimum at create (`minPlayersFor`: 10→8, 14→12, 22→20) | migration applied to koralink DB, `matches.min-players.spec.ts` 3/3 |
| 3 | `checkMinPlayers()` scheduler (re-arm / hourly nudge / auto-cancel ≤60min), leave-withdrawal re-nudge, 10-min cron | build + types; end-to-end DB simulation below |
| 4 | PWA plumbing: verb union + 2 icon maps + 2 label maps + toast copy + en/ar i18n (both blocks) | `npx vitest run` 231/231, `turbo run build` (see below) |
| — | One-time data fix: 8 self-directed `no_show_marked` feed items + 5 self-disputes deleted (Omar ×4+2, Yousef ×4+3) | SQL verified before/after in transcript |

## Build evidence

- API `npx tsc --noEmit` → exit 0
- API targeted jest (3 suites) → 11 passed
- PWA `npx vitest run` → 33 files, 231 tests passed
- `NODE_ENV=production npx turbo run build` → see commit/PR description for output

## End-to-end simulation (SQL, dev DB)

Ran `checkMinPlayers`'s three passes as raw SQL against the dev database:
nudge SELECT returned only match-day-underfilled rows; auto-cancel SELECT correctly
matched an underfilled match inside the hour and cancelled it once (guarded UPDATE);
re-arm UPDATE cleared `last_nudge_at` only for matches at/above minimum.

## Known follow-ups (not in scope)

- Manual `cancelMatch()` still lacks a bell notification to players (WS only).
- Push bodies for new notifications are English-only (matches existing reminder pattern; i18n'd push is a separate cycle).
