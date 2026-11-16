# Run #83 — Gate 0 Retro: Partner pitch deletion surface (P2-120)

**Lane:** DB & Infra (83%4=3) · **Baseline:** 1b71243 (run #82 tip) · **Date:** 2026-09-28

## Area audit

- `deletePitch` (partner.service.ts:511-546) already carried the P2-105 cascade guard
  (one tx, FOR UPDATE on the pitch row, matches-history count → 400). Residual gap
  (run #82 Reviewer A nit, boarded P2-120): the ownership scope lived in
  `assertPitchAccess` BEFORE the tx; the tx SELECT/DELETE re-scoped by id only —
  an ownership transfer (venues.owner_id UPDATE) committing between pre-check and
  tx left a stale-authorized partner able to delete. The FOR UPDATE row lock does
  NOT close this: the transfer touches `venues`, not the locked `pitches` row.
- `updatePitch` (partner.service.ts:489-493) is the in-file reference pattern:
  owner scope = `venue_id IN (SELECT id FROM venues WHERE owner_id = actorId)`
  combined with the id predicate via `and(...)`; Admin bypasses to id-only.

## Reviewer findings triage (run #83 review phase, both reviewers clean zai glm-5.3-flash)

| Finding | Verdict | Action |
|---|---|---|
| A-CRITICAL: `0014_admin_notification_verbs.sql` orphaned, never journaled | **REFUTED** — file IS journaled at idx 39 (out-of-order tag next to idx-14 `0014_mean_franklin_storm`; 0014-prefix collision fooled the reviewer). Tripwire parity 46/46; live DB enum carries ALL 7 verbs incl. the 3 only-this-file ones (`account_banned/suspended`, `no_show_marked`); spec header documents the run-#46 adoption. | No action; recorded as FP evidence |
| A-IMPORTANT: idx-43 entry missing `breakpoints` | Off-by-one: idx 43 = `0042_hot_fk_indexes` (has it). The REAL anomaly is idx 44 `0043_min_players_alignment` — only entry of 46 with `commit: None` and no `breakpoints` (hand-written-migration journal slip; fresh-DB replay would skip statement splitting). | **FIXED** in PR #45: normalized to `breakpoints: true`, stray `commit` removed |
| A-IMPORTANT: wallet.service.ts:104-137 debit path lacks FOR UPDATE | **REFUTED (safe)** — UPDATE-then-observe-rollback on `wallet_balance` (withTimestamp'd column) serializes on the row lock; ledger insert + balance update share one tx; unique idempotency_key is the backstop. | No action; convention note only |
| A-MINOR: CORS denial → 500 not 403 (main.ts:105-112) | Real but cosmetic; Sentry noise class | Boarded → notes (next admin/infra touch) |
| A-MINOR: sw.js `/users/me` NetworkFirst 300s can outlive logout | Real; auth-hygiene polish | Folded into P2-121 scope consideration |
| B: run #82 P2-115 claims | **ALL CONFIRMED** (settings.service KNOWN_SETTINGS/bounds/tx/audit at :24-29,:64-78,:84-97; audit page select+debounce :37-:120; i18n en:15/ar:15; vitest 760/760 real) | P2-115 → DONE ✅ |
| B product gaps: admin realtime, player refund visibility (P0-ish); host wizard, venue-hours editor, host offline, reporter feedback, venue-photo moderation (P1); parity CI guard, clubs realtime, match offline banner, settings audit-link (P2) | Evidence-cited; several overlap owner-gated queues | Boarded as P2 notes/backlog (no new P0/P1 rows — money/multi-admin surfaces are owner-gated per standing decisions) |

## Fix:feat ratio / debt

Recent 20 commits: fix:feat ≈ balanced; no reactive-fix loop. The one true journal
defect (0043 metadata) was hand-written-migration-era debt, closed this run.

## Gate decision

Proceed to Gate 4 (vertical slice): P2-120 owner-scope-in-tx + PR-Agent
affected-row hardening; journal alignment rides the same PR.
