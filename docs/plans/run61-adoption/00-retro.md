# Run #61 — Adoption of dead run #60 + review fixes (compact gates, autonomous mode)

**Mode:** full · Rotation 61%4=1 → API lane · 2026-09-19T10:15Z slot (fired 10:20Z)
**Adoption:** watchdog directive — LOCK pid 2070416 DEAD (started 01:23:33Z, killed ~01:42Z, kill-pattern #10).
Half-work attributed by mtime (01:39–01:42Z window, inside the dead run) and adopted after direct
contract verification (never trust dead-session docs, run #54 rule).

## Gate 0 — Retro (area: admin moderation + WS gateway + host slot picker)

- Kill-pattern #10 hit run #60 ~20 min in; it had already (a) cherry-picked the run-1 audit Swagger
  fix to staging as `243f6d1` (committed, UNPUSHED), (b) implemented P2-77 post-write-keyed
  disconnect (uncommitted), (c) written the P2-74 WS-gate tripwire spec (untracked), (d) built a
  SlotPicker a11y slice (uncommitted + untracked test). All four adopted.
- Live-DB check: `trg_match_capacity` on live is STILL the 0034 max-only function — 0043 (min_players
  trigger extension, written by dead run #60 at 17:52Z Sep-18 in the FEATURE worktree) is NOT applied
  to live (journal newest 2026-09-16 10:46, 45 rows). Per Phase 4.5: code first → gates → commit BOTH
  → only then db:migrate. Decision: 0043 stays parked in the feature lane this run (its owner-side
  PWA counterpart `d957a01` is still an open PR; applying the trigger early would break nothing but
  buys nothing until the PR merges) — recorded here, revisit when PR #26 merges.
- ADMIN HOLD LIFTED: `apps/admin` + partner modules CLEAN; Abdullah's component work landed as
  `80ba859` (P2-69, verified run #59). Admin items buildable again (P2-69 aria-batch leads +
  P2-68 CSV export) — deferred to next runs by budget, NOT by hold.

## Gate 1 — Product spec (adopted slices)

1. **P2-77** — a moderated account must never keep a live WS socket when any moderation state still
   forbids acting, regardless of which admin action unmasked it. Done-when: unban-while-suspended and
   lift-while-banned disconnect; pure unban/lift of a clean (or expired-suspension) account does not.
2. **P2-74** — future WS handlers cannot silently skip the P1-48 moderation gate. Done-when: a
   structural spec fails on any new/changed `@SubscribeMessage` handler without the gate as first await.
3. **Audit run-1 api-auth:swagger-unconditional-exposure** — prod must not serve the OpenAPI surface.
   Done-when: registration gated to non-production; fingerprint referenced; gates green; pushed.
4. **Host slot picker a11y** — slot buttons and error state must be screen-reader legible.
   Done-when: time aria-label EN+AR, booked state announced, error block role=status; tests pin all.

## Gate 2 — Architecture delta

- users.service.ts update(): disconnect predicate re-keyed from request DELTA to POST-WRITE row
  (`after`), no schema/DTO change; audit before/after invariant untouched.
- ws-gate-coverage.spec.ts: source-reading structural spec (migrate-vps-dup-codes pattern) — no
  runtime code change; pins the 7-handler set; exemption = leave-conversation only (P2-6).
- main.ts: Swagger registration moved inside a non-production guard (no route change in dev).
- SlotPicker.tsx: aria-label conditional (booked vs available); error div role=status; 2 new i18n keys.

## Gate 3 — Contract verification checklist

- [x] users.service disconnect branch: `moderationTouched && stillModerated` — verified vs spec matrix
      (7 cases; Reviewer A ran 15/15 across both API suites: moderation-disconnect 7 + ws-gate 8).
- [x] findOne mock fidelity: call-1 = `before` (clean), call-2 = `after` (override) — matches the real
      before-write / after-write read sequence (:143 / :219).
- [x] ws-gate tripwire pins exactly the live handler set (gateway :263/:291/:442/:466/:492/:520/:555)
      and first-await = gate; leave-conversation exempt (documented P2-6 decision).
- [x] Swagger gate keyed on ConfigService NODE_ENV (same source the runtime uses); CORS allowlist
      untouched. (Reviewer A I-2 dev-default note recorded; matches main.ts dev-convenience philosophy.)
- [x] i18n: host.slotTimeAria + host.slotTimeAriaBooked present in BOTH locales (ar/en :410-411),
      ICU placeholders {start}/{end}; parity script run in gates.
- [x] Reviewer-B refinements wired: booked-state aria (slotTimeAriaBooked) + role=status error block,
      both pinned by new test cases.

## Gate 4 — Slices & verification

- Slice A (API): P2-77 + P2-74 + 243f6d1 push → jest suites green, root build green.
- Slice B (PWA): SlotPicker a11y + refinements → vitest green, tsc 0, parity green, root build green.
- No DB migration applied this run (see Gate 0 decision).
