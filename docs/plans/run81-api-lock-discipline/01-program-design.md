# P2-118 API lock-discipline batch — Gates 1–3 compact

## Gate 1 — Product spec (compact)

**Problem:** three mutation paths let concurrent state changes interleave between their check and
their write (or write without tenant scope). Individually low-likelihood; collectively a standing
defect class the codebase already fixed everywhere else (P2-49 close + PR #40 last-admin guard).

**User stories:**
- As a HOST, when I mark a player no-show while the match is being completed, my action must apply
  to the match's final state — not to a state that was true 50ms ago. (markNoShow lock)
- As a PLAYER, my POTM vote must be accepted only while voting is genuinely open — a concurrent
  completion/no-show flip must not let a stale check admit my vote. (castVote tx predicate)
- As a VENUE OWNER, my edit must apply only if the venue/pitch is still mine at write time — a
  concurrent ownership transfer must not let my client write into another owner's venue. (partner
  scoped UPDATE)

**Scope:** IN — the three service fixes + regression specs. OUT — UI, schema, migrations, i18n (no
user-facing strings change; errors are existing-status code preserved), other services.

**Success criteria:** all mutation paths in this batch hold the house lock/scope discipline; new
specs pin it; all existing specs stay green; turbo build 3/3; api jest ≥ 692+13.

## Gate 2 — Architecture (compact)

Files changed (2 service files + 3 new spec files):

| File | Change |
|---|---|
| `apps/api/src/modules/matches/matches.service.ts` | markNoShow: add `.for('update')` to the in-tx matches select. castVote: wrap select+checks+upsert in `db.transaction`; add `FOR UPDATE` on the matches row (raw `sql` lock, matching leaveMatch's raw pattern, to keep the query builder usage identical to the pinned spec style); re-assert Completed + window INSIDE the tx right before the upsert. |
| `apps/api/src/modules/partner/partner.service.ts` | updateVenue: fold owner-scope predicate into the UPDATE WHERE (owner path: `and(eq(id), eq(owner_id, actorId))`; Admin: `eq(id)` only); verify the post-UPDATE read-back row is non-null else 404 (transfer race → clean NotFound instead of cross-tenant write). updatePitch: same pattern on pitches (owner path joins venues for owner_id scope via subquery on the UPDATE). |
| `matches.join-leave-lock.spec.ts` (extend) | markNoShow lock cases. |
| `matches.castvote-contract.spec.ts` (extend) | castVote tx + predicate cases. |
| `partner.access-control.spec.ts` (extend) | updateVenue/updatePitch scoped-WHERE cases. |

Data flow: unchanged (no endpoint, DTO, or shape changes — additive discipline only).

i18n: none (no user-facing strings added; existing error messages preserved verbatim).

## Gate 3 — Program design (the contract gate)

**Exact behavior contracts (no shape changes — all three methods keep their existing return
shapes; error codes preserved):**

1. `markNoShow(hostId, matchId, targetUserId, noShow)` — unchanged signature + populated-match
   return. Delta: the in-tx matches select gains `.for('update')` as the FIRST statement, exactly
   like joinMatch/leaveMatch/removePlayer/startMatch/completeMatch (the pattern
   `matches.join-leave-lock.spec.ts` asserts).
2. `castVote(voterId, matchId, candidateId)` — unchanged signature, returns
   `findOne(...) & { votedFor, message }` as today. Delta: matches-row select + status/window
   checks + roster checks + upsert all move INSIDE one `db.transaction`; the matches row is locked
   FOR UPDATE; the status+window predicates are re-asserted inside the tx immediately before the
   upsert so a concurrent completion serializes before the vote, not during its checks.
3. `updateVenue(actorId, actorRole, venueId, dto)` / `updatePitch(actorId, actorRole, pitchId,
   dto)` — unchanged signatures + returns. Delta: non-Admin UPDATE carries the owner predicate in
   the WHERE (`owner_id = actorId` on venues; on pitches via
   `venue_id IN (SELECT id FROM venues WHERE owner_id = actorId)`); 0 updated rows → re-read →
   row gone (or no longer owned) → NotFound/Forbidden as appropriate; Admin path unchanged
   (`eq(id)` only).

**Contract verification checklist (run explicitly):**
- [✓] No mutation return shape changes (populated-match returns preserved verbatim).
- [✓] No frontend type consumes anything new — zero PWA/admin edits in this batch.
- [✓] No adapter changes — API shapes byte-identical.
- [✓] No field silently undefined — no response fields touched.
- [✓] i18n — no new user-facing strings (existing error messages kept).
- [✓] Migration: none (no schema change; no drizzle artifacts generated).
- [✓] Observability: no new surfaces (existing logger lines cover the paths; AGENTS.md §4 applies
  to feature work, this is discipline hardening on logged paths).

**Verification commands (the gates):**
```bash
cd apps/api && npx jest src/modules/matches src/modules/partner   # new + existing specs
npx turbo run build --concurrency=1 --force                        # 3/3, zero errors
```
