# Run #194 — P2-255 Blackout deep-links (Admin/Partner lane, 194%4=2)

## Gate 0 — Retro (audit of the touched area)

- `partner.service.ts` blackoutSlots (P2-246, run #161): in-tx FOR UPDATE pitch lock, DELETE
  carries `is_booked=false` (P1-18 race pattern), booked count read in same tx. Sound. The
  gap is informational only: `skippedBooked` is a bare count — the panel's warning copy says
  "cancel those matches first" with no way to reach them (BOARD P2-255, Reviewer B run #163).
- `BlackoutPanel.tsx`: renders count-only warning; no list, no links.
- Partner matches surface: `GET /partner/matches/:id` + detail page
  `(dashboard)/partner/matches/[id]/page.tsx` exist; list page links identities there.
  Deep-link target for blackout rows = that detail page (partner-scoped, works for both
  VenueOwner and Admin actor roles via scopedPitchIds).
- DECISIONS.md consulted: Drawer RIGHT-hand rule (untouched); RecordDrawer rule (no new
  drawer added — links navigate to the existing page); admin English+AR i18n parity required.
- Admin state check: clean tree, service active, no in-flight owner work → buildable.
- Standing bug classes in area: none present (no ::uuid casts, no eq(col,null), tx discipline
  correct).
- fix:feat ratio last 15 commits: 3 fix / 9 feat / 3 docs — healthy.

## Gates 1–3 — Program design (compact single doc)

**Problem.** A maintenance blackout that overlaps booked slots dead-ends: the partner is told
booked slots were skipped and to cancel those matches, but has no list of WHICH matches and no
link to act on them.

**User story.** As a partner, when I close a pitch for maintenance and some slots are already
booked, I see exactly which matches are blocking the range and can open each one (to cancel it
via the existing match flow) without hunting for it.

**Scope.**
- IN: blackout response carries `bookedMatches[]` (id, title, status, scheduledAt, spotsFilled,
  maxPlayers); panel renders the list with deep links to `/partner/matches/{id}`; i18n EN+AR.
- OUT (unchanged): bulk-cancel from the panel (money path — owner-gated, P0-2 class per row);
  blackout semantics (free slots deleted, booked untouched); HQ admin surface changes.

**Contract (Gate 3).**
- `POST /partner/pitches/:id/slots/blackout` response (additive):
  ```json
  { "pitchId": "…", "from": "YYYY-MM-DD", "to": "YYYY-MM-DD",
    "closedInstances": 3, "skippedBooked": 2,
    "bookedMatches": [ { "id": "…", "title": "Sunset 7v7", "status": "Open",
                         "scheduledAt": "2026-11-10T18:00:00.000Z",
                         "spotsFilled": 7, "maxPlayers": 14 } ] }
  ```
- New query (same tx, after booked count): pitch_slots ⋈ matches ON booked_match_id
  LEFT JOIN match_players, `WHERE <range> AND is_booked=true`, GROUP BY matches.id,
  ORDER BY scheduled_at asc. spots via COUNT(mp.id) (host included — standing rule).
- Frontend: `BlackoutResult.bookedMatches?: BlackoutBookedMatch[]` (optional — old servers
  tolerated); rendered only when length > 0; each row = localized heading + title link +
  StatusBadge + date + spots.
- i18n keys (both locales, partner.blackout ns): `bookedMatchesHeading` ({count} plural),
  `bookedMatchesHint` (links open the match page; cancel from there).
- Verification checklist: mutation endpoint unchanged in write behavior (read-only addition in
  same tx); response superset — existing consumers compile untouched; adapter = direct
  BlackoutResult extension; every new user-facing string has ar+en.

**Slices.**
1. API: bookedMatches query + response field + spec cases (non-empty mapping, empty list,
   ordering) → jest + tsc.
2. Admin: types + panel list UI + i18n ×2 → vitest + tsc.
3. Gates: turbo --concurrency=1 → lane PR → PR-Agent triage → squash → live deploy (API +
   admin rebuild/restart AFTER dist) → live probe (far-future empty range on a seed pitch:
   shape 200; non-empty path pinned by unit spec — probing a real booked range would mutate
   seed slots).
