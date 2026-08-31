# Cycle run23 — Gate 0 Retrospective (2026-08-31T20:15Z, run #23)

## Scope touched this cycle
- `apps/api/drizzle/` migration chain (fresh-environment bootstrap)
- `apps/player-pwa/worker/index.js` + `next.config.mjs` (offline fallback)

## Recent commit pattern (last 15)
fix:feat ratio heavily fix-skewed across runs #19–#22 (hardening run) — healthy: fixes are
reviewer-driven (refund TOCTOU, JWT body, throttle, offline banners), not regression whack-a-mole.
No contract breaks found in the last 20 commits (mutation-return contract clean per Reviewer A:
findOne-outside-tx everywhere, bare-row list unchanged).

## Full-stack connectivity audit (findings → board)
1. **P1-33 fix INCOMPLETE (run #19)** — the journaled chain still misses 3 ActivityVerb values:
   - `0007_rich_leader.sql:1` creates the enum with only 5 values.
   - Orphan `0014_admin_notification_verbs.sql` carries 7 values, applied out-of-band (run #14)
     but never journaled.
   - `0026_rapid_vin_gonzales.sql` (run #19's fix) folded back only 4 (dispute_resolved,
     dispute_rejected, wallet_refunded, match_cancelled_admin).
   - `account_suspended`, `account_banned`, `no_show_marked` exist in NO journaled migration.
   - Consequence: `0018_absent_shotgun.sql:1` does `ADD VALUE 'account_unbanned' BEFORE
     'no_show_marked'` → on a FRESH database `drizzle migrate` errors at 0018 (missing neighbor
     value). Fresh envs cannot bootstrap without manually applying the un-journaled orphan first.
   - Live DB unaffected (verified: enum_range = 20 values). This is a reproducibility/P1 bug,
     exactly the class P1-33 was opened for.
   - `0014_mean_franklin_storm.sql` header still says "fresh-DB bootstrap needs the orphan applied
     manually" — stale guidance, but that file is APPLIED (never edit applied migrations, run #8 rule).
2. **EN offline fallback missing (new P2-40)** — `next.config.mjs:19` sets `fallbacks.document:
   '/ar/offline'` and sw.js precaches only `/ar/offline`; the offline page
   (`src/app/[locale]/offline/page.tsx`) carries BOTH locales' copy inline, so an EN user hitting
   offline navigation lands on an Arabic page. (Reviewer A, run #23 — verified in sw.js.)
3. Refuted reviewer claims (evidence): "sw.js is a committed build artifact" — sw.js is
   gitignored (`git check-ignore` → IGNORED); "no partner web app exists" — full partner portal
   ships in apps/admin (`src/app/(dashboard)/partner/` with venues/pitches/matches/earnings/settings).

## Classification
- CRITICAL: none (live service unaffected).
- IMPORTANT: P1-33-incomplete (fresh migrate breaks at 0018) → BUILD now.
- IMPORTANT→P2: EN offline fallback (broken UX state, one locale) → BUILD now.
- MINOR/backlog: CSP unsafe-inline (already backlog, re-evidenced next.config.mjs:170),
  ws:/wss: wildcard connect-src, per-locale manifest lang, GiST-docker-only bootstrap
  (documented + scripted; acceptable for the single-box deployment).

## Proceed to Gate 1? YES — two small vertical slices, both finishable in budget.
