# Run #39 — Gate 0 Retrospective: Drizzle journal parity + P2-5 residual contracts

**Date:** 2026-09-07 (cron run #39, ~01:20Z) · **Areas:** apps/api/drizzle (DB/Infra rotation 3) · matches/disputes + partner/venues contracts

## Context since run #38
- Run #38 (owner WebUI session) closed P0-10 (deploy drift) and left 6 gated commits UNPUSHED —
  this run pushed them (562a240..21241f5) after verifying gates had actually run (report records
  vitest 399/399, jest 398/398, turbo 3/3).
- All 3 run #38 in-review items VERIFIED this run (castVote specs 3/3 jest; DatePicker/Reschedule
  17/17 vitest, fixtures riyadhDateKey-anchored; dashboard 200 on :9520).
- Sentry 24h: API-13 (`matches.waitlist` relation, ×37) root-caused as ANOTHER stale-dist window
  (16:21Z restart served a dist whose schema lacked the new relation side; resolved by the 17:35Z
  restart; live 200 with waitlist data). Third instance of the P0-10 lesson — process, not code.
- P2-51 (demo purge): NO Sept 7 00:00Z events — run #36's hotfix held.

## Findings audited (Reviewer A/B + self, all verified before boarding)

| Finding | Verdict | Action |
|---|---|---|
| `_journal.json` stops at 0033; 0034/0035 on disk+git but unjournaled | **CONFIRMED** (journal 34 entries, last idx 33; files exist since eb4ad39/562a240; live DB HAS both applied with bookkeeping rows) | **BUILD item 1** |
| Snapshots stop at 0026/0029 | Convention — 0030+ are hand-written by design (STATE OPS note); not a defect | Refuted as CRITICAL |
| Fresh-env bootstrap misses 0034/0035 (migrator only reads journaled tags — verified in drizzle-orm/migrator.js:12-28) | Confirmed consequence of the drift | Fixed by item 1 |
| Live waitlist DEFERRABLE constraint missing from schema.ts declaration | Confirmed (live `match_waitlist_match_pos_unique` exists; schema.ts declares only 2 indexes) | Covered by tripwire spec; schema comment already documents it |
| Waitlist FIFO index gap | Refuted — live (match_id, position) unique IS the FIFO index | Notes only |
| Socket.IO presence absent (B's CRITICAL) | **Refuted** — no presence is claimed anywhere; ChatSheet's Online/Offline label = the viewer's own socket state (ChatSheet.tsx:137-147). No user-facing lie. | Refuted; noted as future enhancement only |
| role=status / aria-pressed gaps | Confirmed counts (1 / 7) — a11y polish, genuine but non-blocking | Board P2 (next runs) |
| P2-19 residual "per-IP daily cap needs Redis decision" | **Stale** — built run #27 (otp-store DAILY_IP_CAP=50 + specs; in-memory O(0)) | Mark DONE on board |
| P1-43 "no notification center" | **Premise stale** — built by owner session 5ab7b1a (bell+sheet, WS badge-sync, unread-count live 200) | Mark DONE on board |
| P2-5 residual: createDispute bare row; createVenue sparse 3-field return | Confirmed (matches.service.ts:2650 `return created`; partner.service.ts:113 sparse `.returning({id,name,city})`); createSlot returns a complete row — refuted as violation | **BUILD item 2** |
| systemd units missing | Refuted — user units under ~/.config/systemd/user (Restart=on-failure ×3) | Notes only |
| seed.ts console.* | CLI script, acceptable per existing convention | Notes only |

## Tech debt / lessons
- Stale-dist windows keep recurring because migrations land without same-session rebuild+restart
  (P0-10 lesson) — the Sentry window analysis (16:26–17:17Z) is the third instance. Process rule
  already on the board; reinforced in report.
- Reviewer A flagged the journal without knowing the live-DB state; the migrator source read was
  required to prove a journal repair is safe (drizzle compares ONLY newest live row's created_at
  vs entry when — repaired entries are skipped on the live DB, applied once on fresh DBs).

## Gate 0 → proceed
Item 1 (journal parity + tripwire spec) and item 2 (dispute/venue contract returns) are
vertical-slice sized, no owner decisions, no admin-area conflicts (ADMIN STATE CHECK clean at
01:5xZ: no dirty apps/admin or partner/admin module files).
