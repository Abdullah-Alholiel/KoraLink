# Run #111 — Favorites entry point (P2-165) + addFavorite TOCTOU fix — Cycle Status

| Gate | Name | Status | Artifact |
|------|------|--------|----------|
| 0 | Retrospective | ✅ DONE (autonomous) | [00-retro.md](./00-retro.md) |
| 1 | Product Spec | ✅ DONE (compact) | [01-program-design.md](./01-program-design.md) |
| 2 | Architecture | ✅ DONE (compact, same doc) | [01-program-design.md](./01-program-design.md) |
| 3 | Program Design | ✅ DONE (compact, same doc) | [01-program-design.md](./01-program-design.md) |
| 4 | Vertical Slices | ✅ DONE — gates green, PR #94 | commits on `lane/run111-p2-165` |

## Slices
1. **API hardening:** `addFavorite` check+insert wrapped in one transaction (Reviewer A IMPORTANT, TOCTOU) + ids-list ordering tiebreaker.
2. **P2-165a:** `?tab=favorites` deep-link on clubs page (Suspense-wrapped, verify-page pattern) + sign-in CTA in favorites empty state for guests (clears run #110 MINOR).
3. **P2-165b:** profile "My favorite clubs" MenuItem → `/{locale}/clubs?tab=favorites` + i18n EN+AR.
