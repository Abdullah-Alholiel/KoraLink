# Status — Waitlist & Capacity Standardisation

| Gate | Artifact | State |
|---|---|---|
| 0 Retro | `00-retro.md` | ✅ done (owner-triggered) |
| 1–3 Design | `01-program-design.md` | ✅ approved via "proceed" |
| Slice 1 API | commits 971f01d → 5f61ec0 | ✅ built, 92/92 spec tests |
| Slice 2 PWA | commit 4a64415 | ✅ `npm run build` 3/3 |
| Slice 3 Data | `seed-e2e-waitlist.sql` + `run-e2e-waitlist.sh` | ✅ **34 PASS / 0 FAIL** live |
| Slice 4 Demo | `demo-waitlist-promotion.sh` | ✅ 16/16 — 3 leaves → FIFO auto-promotion (p15→Ahmed→Yousef), queue drained live |
| Reassurance | commit 8d88ec3 | ✅ joined players see 'N waiting — your spot is covered' above Leave + in leave sheet (EN+AR plurals); browser-verified 3/3 |
| CTA fix | commit d8fada7 | ✅ queued CTA reads "Queued · #N of M waiting" (bare #N read as queue count); build 3/3, browser-verified EN+AR |
| Migration 0034 | applied + bookkeeping row | ✅ 0 capacity violations in DB |

## Defects the live E2E caught (fixed in 5f61ec0)
1. `matches.waitlist` relation had no `one()` inverse → Drizzle 500 on EVERY
   `GET /matches/:id` ("Something went wrong" on all match pages). Unit specs
   mocked the db, so tsc+jest never saw it — relational queries need BOTH sides.
2. `leaveMatch` contained a duplicated `promoteNextInTx` call → double-promoted
   past capacity (live: 15/14). Exactly one call per freeing path now.
3. Roster join now auto-dequeues the player's stale waitlist row.

## Contracts (verified live)
- Join = **201**; leave = DELETE → 200; cancel = `POST /matches/:id/cancel` (host-only).
- Waitlist: `POST /matches/:id/waitlist` → 201 `{position}`; `DELETE` → 200;
  `GET` → `{count, yourPosition, queue[]}` (non-host sees own entry only).
- Capacity: `max_players` derived `2 × pitch.size` in createMatch + DB trigger
  `trg_match_capacity` backstop (rejects violations with a clear error).

## Run it
```bash
cd /home/ubuntu/projects/koralink && bash docs/plans/e2e-waitlist-join/run-e2e-waitlist.sh
```
Self-seeding + deterministic reset; users `wl-e2e-*` phones `+966570000000`…`+966570000015`.

## Promotion demo (owner-requested 2026-09-07)
```bash
cd /home/ubuntu/projects/koralink && bash docs/plans/e2e-waitlist-join/demo-waitlist-promotion.sh
```
Self-contained + re-runnable: seeds the pack, runs the pack runner (A → 14/14
Full, queue = p15), queues Ahmed (+966500000001) and Yousef (+966500000005)
behind p15 via the API, then three roster players leave via the real API.
Asserts each freed seat is auto-refilled from the queue head (FIFO
p15 → Ahmed → Yousef), roster stays 14/14 at 7H/7A parity, queue drains 3→0.
Live result 2026-09-07: 23/23 PASS.
