# P2-371 — Program Design (compact Gates 1-3, run #220, autonomous mode)

## Problem (Gate 1)
Owner directive D-20261113-33: UI standards exist (koralink-ui-standards, PR #274/#275 census)
but defects still shipped; the owner wants standards ENFORCED by a real-browser audit over main
screens × {ar,en} × {360,390,430}: no horizontal scroll, no out-of-viewport boxes, no
clipped/overlapping text, ≥44px targets, zero MISSING_MESSAGE, zero uncaught console errors.
First run = full baseline; every finding becomes a board row; later runs update the UI-standards
skills so no UI slice closes without it.

## Scope
IN: audit harness (repo scripts/), one full baseline execution against live staging, findings
decomposed into board rows, harness lessons recorded.
OUT (deferred, recorded): sheet-interaction probes (PaymentSheet reachability at 360×640),
CI wiring (runs as a post-deploy staging check for now), koralink-ui-standards /
koralink-ui-verification skill updates, ~44px utility-class census alignment.

## Architecture (Gate 2)
- `scripts/p2-371-layout-audit.cjs` — standalone Node script (no app-code changes, no new deps
  in package.json). Uses playwright-core installed lane-only via `npm install --no-save`
  (re-installable on demand; the repo gate stays clean).
- Chromium: VPS-native ARM64 `~/.cache/ms-playwright/chromium-1248/chrome-linux-arm64/chrome`
  (Chrome for Testing 156.0.8078.4) via `executablePath` + `--no-sandbox`.
- Auth: `POST /api/v1/auth/dev-login` (seed +966500000001) → JWT cookie. The zustand persist
  blob (`koralink-app-store` v0, camelCase User) is seeded via `addInitScript` before app code →
  AuthGuard renders authenticated content deterministically (no cold-storage bounce).
- Network: ONLY api/v1 requests are intercepted (page.route) and forwarded to 127.0.0.1:3001
  with the auth cookie + an allowlisted Origin header (localhost:3000). Sentry ingest untouched.
- Fixtures: first `/venues` row = club-detail; first upcoming row of `GET /matches` = match
  detail (envelope `{matches, hasMore}`; staging currently has ZERO Open → match-detail skipped
  and reported).

## Checks (Gate 3 — exact behavior)
| Check | Rule | Notes |
|---|---|---|
| H_SCROLL | `scrollWidth > clientWidth+1` on documentElement | hard fail |
| OOB | visible element box beyond viewport, EXCLUDING descendants of overflow-x scrollers | carousels legit |
| OVERLAP | pairs of visible text-bearing leaves (h1-h4/p/span/button/a/label, direct text nodes only) intersecting >8px both axes, ancestor-related pairs skipped | capped 5/page |
| TAP | visible interactive elements (button/a/input/select/textarea/[role=button]) with box <44×44 | capped 8/page; labels captured |
| CONSOLE | console errors + MISSING_MESSAGE + pageerror | socket.io funnel noise filtered |

Output: `/tmp/p2371/report.json` (full) + a human summary (docs/plans/p2-371-playwright-audit/baseline-summary.md).

## Contract notes
- Zero app-code deltas → mutation contract, i18n keys, DTO shapes: N/A (verified: no files
  outside scripts/ + docs/plans/ + kanban/ change in this slice).
- dev-login throttle 3/min: the harness performs exactly ONE dev-login per invocation.

## Verification plan
- Harness self-evidences: 72/72 loads scanned, report written; gates reported per load.
- Repo gates: turbo build (3/3, --concurrency=1) + PWA vitest + tsc unchanged-green (script is
  outside compiled sources; gates run to prove no collateral).
- Board rows carry signature tables from baseline-summary.md as evidence.
