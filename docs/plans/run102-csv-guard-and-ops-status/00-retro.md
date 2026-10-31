# Run #102 — Gate 0 Retrospective (CSV guard + ops-feed status lane)

**Baseline:** `edb491b` (PR #78 revert merge, post run #101).

## Recent-commit audit
- Last 8 commits: 2 admin fixes (#77/#78 drawer flip-flop), 1 feature CSV (#75), 1 feature
  notification center (#71), rest docs/kanban. The #77→#78 flip-flop is the week's defining
  incident: a factory PR shipped a Drawer regression because a skill-file standard outranked the
  owner's correction. Remedy already landed (DECISIONS.md ledger + defaults+veto register,
  P2-148 wiring verified present this run: cron prompt carries DECISIONS.md + Promote-health
  sections; prestate emits the P2-152 user-visible pick policy).
- fix:feat ratio ~1:1 over the last 15 — healthy.

## Area audit (what this cycle touches)
1. **`apps/admin/src/lib/csv-export.ts`** — single choke point (`escapeCsvField`) behind all
   SEVEN export pages (users, settlements, transactions, matches, disputes, audit, reports —
   Reviewer A counted 7, board said 6). Confirmed CRITICAL: `FORMULA_PREFIX
   /^[=+@\t\r]|^-(?!\\d)/` lets `-1+cmd|'...'!A0` through (Opus audit finding 5 / P2-146).
   The PWA exporter (`wallet-csv.ts`) blocks leading `-` but has its own latent bug: the guard
   path returns `"${guarded}"` WITHOUT doubling inner `"` → a cell like `=say"x"` produces a
   corrupt CSV row (RFC 4180 violation). Admin's version doubles correctly.
2. **`apps/admin/src/components/NotificationCenter.tsx` + `lib/ops-realtime.ts`** — drawer has
   empty+success only; `reconnectionAttempts: 10` exhausts silently (P2-143). `use-online.ts`
   exists, SSR-safe, only used by OfflineBanner. i18n parity currently 651/651 (Reviewer B
   reproduced exactly).

## Findings → actions this cycle
| Finding | Sev | Action |
|---|---|---|
| Admin guard bypass on `-<digit>` | CRITICAL (security) | Fix regex, shared contract test (item 1) |
| PWA guard path missing `"`-doubling | IMPORTANT (data) | Fix + pin in same contract test (item 1) |
| Ops feed reconnect exhaustion silent | IMPORTANT (ops UX) | Status machine + drawer strip (item 2) |
| Board row P2-142 contradicts live code (no revert note) | CRITICAL (docs) | Phase 3 row correction |
| CSV export: no empty/feedback guard on 7 pages | P2 | Board as P2-153 (not built this run) |
| Stale "left-anchored" comment in NotificationCenter:114 | MINOR | Fix while touching file (item 2) |
| `useState(() => Date.now())` latent hydration hazard | MINOR | Fix if trivially safe (item 2) |

## DECISIONS.md check (mandatory)
Consulted. Nothing in this cycle touches Drawer anchor, PSP, bell placement, or EN+AR (new
i18n keys land in BOTH locales). No contradiction. Proceed to Gates 1-3 (compact in
01-program-design.md).
