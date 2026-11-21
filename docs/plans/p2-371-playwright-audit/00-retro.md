# P2-371 Playwright layout audit — Gate 0 retro (run #220)

## Context
Owner directive D-20261113-33 (Life-OS brief Part 2): "make the standards enforce themselves" —
an automated real-browser layout audit over main screens x {ar,en} x {360,390,430}. Prior headless
tooling was unavailable; Playwright chromium binaries landed on the VPS (~/.cache/ms-playwright)
before this run.

## Area audit (what this slice touches)
- New: scripts/p2-371-layout-audit.cjs — a standalone audit harness (zero app-code changes).
- No schema/API/DTO/i18n surface touched. Build-time risk limited to repo scripts/ additions.

## Recent-commit check (tech-debt lens)
The PWA lane of the last ~8 runs shipped: offline banners (login/verify/match/host), error
classification, tap-target census inside sheets (PR #274/#275), numerals localization (PRs
#243/#246), legal truth-pins (PR #283), Turnstile (F1) + parity (PR #284). Reviewers A/B this
run: zero CRITICAL/IMPORTANT; 4 small a11y P2s (boarded). Debt register for this lane is the
TAP/OVERLAP surface this audit just quantified — not new regressions.

## Harness lessons (recorded for reuse)
1. playwright-core is NOT in the repo; install lane-only (--no-save) and drive the ARM64
   chromium-1248 binary via executablePath (chromium-1234 is x64, unusable).
2. Intercept ONLY api/v1 (a broad api glob hijacks Sentry ingest URLs).
3. Rehome the forwarded origin header to an allowlisted origin (the baked funnel origin is
   not in the API CORS list and is currently down).
4. Auth: seed the zustand persist blob via addInitScript BEFORE app code (AuthGuard cold-
   storage bounce is real and deterministic under this fix).
5. /matches/nearby does not exist — the feed route is bare GET /matches ({matches,hasMore}).
6. Fixtures come from live endpoints; staging currently has ZERO Open matches.

## Proceed decision
PROCEED to Gate 1/2/3 compact (single doc) then baseline execution — done this run in the
same session; docs committed with the slice.
