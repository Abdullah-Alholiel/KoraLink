# Run #117 — P1-55 Venue Reviews (booking-verified stars+text) — Gates 0–3

**Lane:** API (117%4=1) · **Item:** P1-55 · **Clock:** elapsed 2026-10-09T02:30Z, no veto
(chat/BOARD re-checked 15:20Z) → builds as clocked default. Attribution: **factory-built
(owner-optional)** — no owner-authored commit/chat decision.

## Gate 0 — Retro (area audit)

- DECISIONS.md read first. No contradiction: P1-55's clocked default IS the owner-sanctioned
  shape (default+48h-veto adopted 2026-10-04, DECISIONS.md row 7). Reviews are user-generated
  content, not a design/UX reversal of any ledger row.
- Recent commits in touched area: b90ab70 (POTM join — GROUP BY discipline), a5cde40 (bulk
  moderation — guard-isolation pattern), 1c39a98/2000157 (venues LEFT JOIN + COALESCE owner).
  Lesson carried forward: **every new LEFT JOIN must account for GROUP BY** (PR #101's
  CRITICAL); my read query uses NO aggregates with the join → no GROUP BY needed.
- fix:feat ratio healthy (features with tests shipping; reviewers 0 CRITICAL/0 IMPORTANT
  two runs straight).
- Admin state check PASSED 15:19Z (clean tree in apps/admin + admin/partner API modules,
  portal live, last admin commits are factory PRs). My admin-module touch = venues list
  column swap only.

## Gate 1 — Product spec

- **Problem:** players cannot judge pitch quality before paying SAR; `venues.rating` exists
  but is unwritable (board P1-55, reconfirmed runs #55/#97/#108).
- **User story:** as a player who completed a game at a venue, I can rate it 1–5 stars with
  an optional comment; as any browser of the club page, I see the average, the count, and
  the latest reviews so I can trust the venue before booking.
- **IN:** verified submission (≥1 Completed match at the venue), one review per user per
  venue (latest wins), avg+count aggregation, detail-page section + review sheet (EN+AR),
  server `can_review` flag. **OUT:** list-page stars (follow-up), host/partner replies,
  photo attachments, review moderation queue (admin reports flow covers abuse).
- **Success criteria:** unverified POST → 403; verified POST → 201 + venue aggregates
  update; re-POST → update not duplicate; GET returns latest-20 + aggregates + my_review;
  UI shows all 5 UX states; i18n parity holds; all gates green.

## Gate 2 — Architecture

- **DB:** migration `0048_venue_reviews`: new table `venue_reviews` (id PK varchar36,
  venue_id FK→venues CASCADE, user_id FK→users CASCADE, match_id varchar36 NOT NULL **no FK**
  — proof id outlives match purge (P2-47 pending; FK cascade would silently destroy
  reviews), rating smallint CHECK 1..5, comment varchar(500) NULL, created_at, updated_at;
  UNIQUE(venue_id,user_id); INDEX(venue_id, updated_at DESC)). Venues: DROP dead `rating`,
  ADD `rating_avg` double NOT NULL DEFAULT 0 + `rating_count` int NOT NULL DEFAULT 0.
- **API:** `POST /venues/:id/reviews` (auth, UuidParamPipe, DTO IsInt Min1 Max5 + optional
  comment ≤500). Service tx: `SELECT … FROM venues WHERE id=:id FOR UPDATE` (serialize
  re-aggregation) → verified-booking probe (EXISTS Completed match, returns latest proof
  match id) → 403 if none → upsert onConflictDoUpdate(venue_id,user_id) → re-aggregate
  UPDATE venues in the SAME tx. Return `{review, venueRating:{average,count}}` (upsert
  analog of the findOne-after-tx contract; computed from the tx's own aggregate).
  `GET /venues/:id/reviews` → `{reviews: [{id,rating,comment,created_at,updated_at,user:{id,full_name,avatar_url},mine}], average, count, can_review}` — LEFT JOIN users
  (name+avatar only, no PII), no aggregates → no GROUP BY; `can_review` = server-side
  verified predicate (single source of truth for the UI CTA).
- **PWA:** `hooks/useVenueReviews.ts` (query + submit mutation, auth-gated `enabled:!!user`);
  club detail page: Reviews section (avg stars + count + latest 20 + empty/error/loading/
  offline/success) + BottomSheet star input (aria-labelled) + localized toasts per the
  error-message standard (403 → what/why/next).
- **Files:** schema.ts, drizzle/0048 + journal idx49 + snapshot chain, venues.module,
  venues.controller, venues.service, dto/create-venue-review.dto.ts, venues.reviews.spec.ts;
  PWA hook + `clubs/[id]/page.tsx` + messages/{en,ar}.json + component test; admin venues
  column rename if it reads `rating` (grep-gated).

## Gate 3 — Contract (exact shapes)

POST 201:
```json
{"review":{"id":"u","venue_id":"u","user_id":"u","match_id":"u","rating":4,"comment":"x",
"created_at":"ts","updated_at":"ts"},"venueRating":{"average":4.5,"count":2}}
```
403: `{"message":"Only players who completed a game at this venue can review it.","error":"Forbidden",…}`
GET 200:
```json
{"reviews":[{"id":"u","rating":5,"comment":null,"created_at":"ts","updated_at":"ts",
"user":{"id":"u","full_name":"s","avatar_url":null},"mine":true}],
"average":4.5,"count":7,"can_review":true}
```
average = round(AVG,1) via PG round; count = rating_count. Adapter: none needed (raw shape
consumed in hook types — mirrors favorites-hook precedent).

**Contract checklist:** ✓ mutation returns populated payload (review + fresh aggregates,
computed post-write in-tx) · ✓ FE types accept exact JSON (VenueReviewApi in hook) · ✓ no
silent-undefined fields (comment nullable, typed) · ✓ i18n keys both locales (listed in
impl) · ✓ GROUP BY n/a (no aggregate+join mix) · ✓ ::uuid n/a (varchar36, parameterized) ·
✓ NULL handling (isNull for comment on update set).

## Verification plan

Lane branch → PR → 4 bot checks + PR-Agent triage → squash → merged-tree gates
(turbo --concurrency=1, vitest, api tsc+jest incl. journal tripwires) → migrate-vps applies
0048 staging-only → API restart AFTER dist carries the route → live E2E (verified seed user
201 + aggregates; unverified user 403; upsert not-duplicate; GET shape).
