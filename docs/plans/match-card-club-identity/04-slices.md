# Gate 4 — Vertical Slices: Match Card Club Identity

## Slice 1 — Tracer bullet (header swap)
- Edit `MatchCard.tsx`: header avatar → club icon, subtitle → club name + distance, remove distance pill.
- Verify full chain renders in `en` + `ar`.
- **Gate:** `npm run build` (from `apps/player-pwa`) zero errors.

## Slice 2 — Test realignment
- Update `MatchCard.test.tsx` per the Gate 3 test contract (club name, no host initial, distance present/absent).
- **Gate:** `npx vitest run` all green.

## Slice 3 — Observability
- **N/A** — no new mutation, endpoint, or data-flow path; pure presentational swap. No Sentry/Pino/PostHog event needed (existing `match` interactions unchanged).

## Final gate
- `turbo run build` (root) zero errors; full vitest suite green; commit + push with a conventional message:
  `feat(play): show club name + distance instead of host on match cards`
