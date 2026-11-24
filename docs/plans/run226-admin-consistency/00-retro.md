# Run #226 — Gate 0 Retrospective (admin-consistency + P2-397 riders)

**Date:** 2026-11-24 (UTC) · **Mode:** autonomous cron · **Rotation:** 226 % 4 = 2 → Admin lane

## Cycle context

- Last cycle (#225) shipped P2-398 money rules (PR #290 `719b5f84`) + P2-399 third cron slot.
- Reviewer A #226 re-audited 719b5f84 post-merge: **0 CRITICAL / 0 IMPORTANT**, 5 MINOR notes
  (instance-number derivation, unaffordable-fee ops note, fail-toward-refund predicate, 23505
  copy mismatch, stale commit-message block) — none build-worthy now; logged on the board row.
- Reviewer B #226 verified ALL run-#225 claims TRUE (merge SHA, migration 0061 live in
  koralink-postgres, /ar/terms SSR carries the no-show terms, cron expr `15 1,12,15`).
- Sentry 1C (86/24h) + 1F (16/24h) both dedupe to the Neon-quota root; nightly prod backup
  still failing since 11-20 (Coolify cutover D-20261122-01 = the owner heal). No new signatures.

## ADMIN STATE CHECK (mandatory, 2026-11-24T01:2xZ)

- `git status --short apps/admin apps/api/src/modules/partner` → **CLEAN** (no in-flight owner work).
- `git log --oneline -3 -- apps/admin` → 192a0c0b (docker #266), 7a883b65 (P2-343), 479affd3 (P2-346).
- `systemctl --user is-active koralink-admin.service` → active.
- Verdict: admin-area work is PICKABLE this run.

## Promote / prod findings (pick-order 0)

- Promote #276 merged 11-18 but its Render deploy CRASHED (storage env, P0-12) — prod serves
  the stale Sep-25 build; heal = fresh promote carrying #277. Staging is 31 commits ahead.
- Prod Neon probe (same URI the nightly backup uses): **"exceeded the quota" on connect** —
  prod DB is dead, so the migrate-first precondition is IMPOSSIBLE on Neon and a promote
  would deploy an API against a dead DB. D-20261122-01 (owner): heal = Coolify cutover +
  Nov-20 backup restore, NOT a Neon promote. Promote package lane → **BLOCKED (owner)**;
  recorded in OWNER-QUEUE refresh (§3 heal) instead.

## Findings this cycle (mapped to stories)

1. **Blocked.tsx dead code with hardcoded EN strings** (Reviewer B P1-a, parent-verified:
   zero usage sites; (dashboard)/layout.tsx:67-69 REDIRECTS on denied paths and renders an
   empty div at :87-90 — the component is unreachable). Latent trap: if anyone wires it,
   AR venue owners get English. → REMOVE (item 1).
2. **Dashboard bare-text loading** (Reviewer B P1-c, parent-verified: page.tsx:46-48 plain
   div vs the shared LoadingState spinner used by audit/venues/[id]/partner pages — P2-274
   standard). → Migrate to LoadingState (item 1).
3. RBAC write-capability gaps (P1-b) + LoadError raw reason (P2-b) + rbac section-list
   duplication (P2-c) + money Intl formatting (P2-d): verified REAL but larger surfaces —
   **boarded, not built this run** (P2-400 rows), per small-completed-beats-half-done.
4. Hex lane: **clean** (355/27/1, all metrics flat vs baseline).
5. Sentry/journal: zero new API error signatures in 5h of journald; 1C/1F quota-class.

## Verdict → Gate 1

Proceed. Item 1 = admin state-consistency batch (Blocked removal + dashboard LoadingState);
item 2 = P2-397 riders via zeroshot lane (Claude) per the lane-default mandate.
