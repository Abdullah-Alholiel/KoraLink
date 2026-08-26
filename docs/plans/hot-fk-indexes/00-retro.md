# Gate 0 — Retrospective: P1-4 Hot-FK Indexes

**Date:** 2026-08-26 · **Owner:** parent session (continuing factory work) · **Source:** run #1 finding P1-4

## Problem
Hot foreign-key columns lack indexes → N+1 joins, cascade deletes, and admin analytics queries
do sequential scans on growing tables. Specifically (from run #1 board):
`matches.host_id`, `matches.pitch_id`, `activities.actor_id`, `disputes.reporter_id`,
`reports.reporter_id`, `venues.owner_id`, `transactions.reference_id`.
(`match_messages(match_id, created_at)` was ALREADY covered by migration 0014 —
`match_messages_match_created_idx`.)

## Decision
Pure-migration change (zero code risk) — add `index()` declarations to the Drizzle schema for
the missing FK columns, generate migration 0015, apply to live DB, verify with EXPLAIN, commit.

## Files touched
| File | Change |
|---|---|
| `apps/api/src/database/schema.ts` | Add index declarations on the 7 FK columns |
| `apps/api/drizzle/0015_*.sql` + snapshot + journal | Generated migration |
| This doc + `01-program-design.md` | Gate docs |

## Success criteria
- Migration generates cleanly, applies to live DB, all 7 indexes exist in pg_indexes.
- `turbo run build` zero errors; jest suite green.
- One example query (matches by host) shows index usage via EXPLAIN.
