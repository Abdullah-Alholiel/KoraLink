# Run #50 — Gate 0 Retrospective (Admin rotation + hydration/infra follow-ups)

## Baseline
- `staging` @ `9dc6092` → review commit `a8b4946` (board). Last cycle: run #49 (auth hardening + messages hydration), claims **7/7 CONFIRMED** by Reviewer B this run.

## Area audit — what this run touches
1. **PWA render-path clocks** (`wallet/page.tsx`, `ChatSheet.tsx`, `clubs/[id]/page.tsx`):
   - Convention established run #40 (MatchCard POTM window) and re-applied run #49 (both
     messages surfaces): render-path time comparisons MUST come from `useNow()` (null during
     SSR + first client render). Reviewer A (run #50) found 3 survivors of the sweep — same
     class, lower practical severity (all three render post-fetch/post-interaction), but the
     project standard says conform; also pre-empts exposure when server-rendered persisted
     queries land.
   - Founding bug class: SSR/client clock disagreement flips a visible branch → React 19
     hydration error (run #40 MatchCard, run #49 messages dividers).
2. **SW registration hardening** (`next.config.mjs`, `ServiceWorkerUpdater.tsx`):
   - Live probe this run (VPS headless Chrome 151 → prod): `/sw.js` registers + activates fine;
     prod CSP carries `worker-src 'self' blob:`. Sentry KORALINK-WEB-2 (6 events ever, 2
     one-minute bursts: Aug 20 ×2, Sep 13 ×4, Chrome 131/Mac) = stale-browser + enterprise-CSP
     artifact surfacing as an UNHANDLED rejection from next-pwa's injected `register: true`
     script. No prod defect → hardening only: own guarded registration, failures captured and
     degrading to no-offline.
3. **Admin minors** (P2-61) — batch deferred: tree-clean today, but admin touches risk colliding
   with Abdullah's continuous portal work; the three items are cosmetic/i18n, low blast radius.
   Deferred deliberately to keep this run's slices PWA-only (single-app gates, single restart
   surface).

## Refuted this run (evidence over vibes)
- **P1-44 wallet-missing-error-state**: Reviewer B's grep searched `isError`; the page actually
  destructures `error: balanceError` / `error: historyError` and renders both branches
  (balance :160-162, history icon+description+retry :231-246). Board row marked REFUTED.

## Tech debt observed (not actioned)
- Admin push composer (P1-45) needs the owner scope decision (who broadcasts to whom).
- `GetMatchesDto.format/gender` string typing, WS gateway JWT fallback secret — standing backlog.
