# P2-269 — Venue photos on the player PWA — Gate 0 Retrospective

Run #171 (2026-10-28). Cycle: PWA venue-photo display leg (completes the P1-38 pipeline end-to-end:
admin uploads ✅ run #170 → player sees photos ✅ this cycle).

## Area audit (what this cycle touches)

- `apps/api/src/modules/venues/venues.service.ts` — public reads: `findNearby` (raw SQL, LIMIT 50,
  additive-clause discipline), `listFavoriteVenues` (raw SQL, findNearby row shape per the
  adapt-by-extending rule), `findOne` (un-narrowed Drizzle read → already returns `images` since
  migration 0057). Migration 0057 (`venues.images` jsonb NOT NULL DEFAULT '[]') rides PR #186 —
  applied to staging live, verified by Reviewer B run #171 (information_schema + 4/4 rows non-null).
- `apps/player-pwa/src/app/[locale]/(main)/clubs/page.tsx` — card avatar block at :423-428 renders
  `venue.name.charAt(0)` letter avatar; zero `images` references anywhere in the PWA (grep-verified).
- `apps/player-pwa/src/app/[locale]/clubs/[id]/page.tsx:213` — hero `<Image src="/images/stadium-bg.png">`
  hardcoded for EVERY venue (Reviewer B run #171 P0 finding).
- CSP: `next.config.mjs` headers() — `img-src 'self' data: blob:` today; media images are
  cross-origin (`https://aa.tail2948f9.ts.net:8443`) → must add the API origin or every photo 403s
  on the client (CSP violation, console error, onError fallback masks the feature).
- `venues.images` values are managed paths `/media/venues/<venueId>/<sha256>.<ext>` (migration 0057
  default '[]'; media.service writes only this shape — r3 traversal-proof DTO regex).

## Recent-commit debt check

- Run #170's PR #186 went through 7 PR-Agent rounds; the r8 round (this run) fixed the last real
  finding (upload error-copy collapse). The pipeline code is freshly reviewed — no debt to carry.
- Fix:feat ratio in the touched area: venues.service last touched by feature commits (P2-161/173,
  P1-25) — healthy.

## Findings

| Class | Finding | Cascade if unfixed |
|---|---|---|
| P0 (product) | Detail hero shows the same stock stadium for every venue; list cards show letter avatars | Photos invisible to players — the P1-38 pipeline dead-ends at the admin console |
| P0 (infra) | CSP `img-src` lacks the API origin | Every photo request blocked client-side even after the UI ships |
| P1 (contract) | Public list SELECTs don't return `images` | PWA can't render without a schema change or extra request |

## Decision

Proceed to Gate 1. Rotation fit: run #171 = DB & Infra lane (CSP + API read legs are exactly this
lane's surface); the UI legs complete the user-visible item mandated per run.
