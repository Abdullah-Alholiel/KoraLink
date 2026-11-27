# Run #237 — P2-254 Post-match venue review prompt (API notification leg)

## Gate 0 — Retrospective (target area: notifications × matches × push worker)

- **Contracts audited:** `sendPushToUsers` dual payload (inline vs semantic-key `PushKey`/`PushVars`, notifications.service.ts:247) · `CATEGORY_BY_KEY` (per-category mute + quiet hours, P0-5) · `renderPushText` (per-subscription locale) · completion paths (`completeMatch` FOR UPDATE + guarded flip + post-commit best-effort pushes; `autoCompletePastMatches` bulk UPDATE + RETURNING) · `venue_reviews` UNIQUE `venue_reviews_venue_user_idx` (schema.ts:1002) · worker `push` type→URL map + `notificationclick` same-origin navigation (P2-93) · the type-map tripwire `test/structure/push-notification-click.test.ts` (run #70).
- **Tech-debt scan of the area:** no in-app notifications table exists — the bell is fed by `activities` (no unique key), so a prompt-ledger without a migration must lean on `venue_reviews` (already the `can_review` truth source, venues.service.ts:616). PushVars already carried `venueName` (payout_paid) — reuse, no new var shape. Catalog `Entry.title` was string-only; one key needs interpolation → widened to `string | fn` (additive, all existing entries untouched).
- **Prior cycles touched this area:** PR #288 (webhook + creditFromWebhook), PR #305 (subscription rebind), PR #290 (no-show fee/late-cancel forfeit — completion-side money sweeps). None constrain this surface (notification-side only, zero money movement).
- **Ledger check (kanban/DECISIONS.md):** no owner decision governs review prompts; P2-297 (hidden reviews still count) unaffected — prompt targets the venue page either way. No contradiction.

## Gates 1–3 — compact program design

- **Problem:** booking-verified reviews (P1-55) starve — `can_review` is computed lazily on `GET /venues/:id/reviews` (venues.service.ts:616,634) and nothing ever brings the player there after a completed match.
- **User story:** As a player who finished a paid match at a venue, I get one push inviting me to rate that venue; tapping it lands on the venue page (`/{locale}/clubs/:id`) where the review CTA lives. A player who already reviewed that venue is never prompted again (per venue; re-prompting for a NEW venue is correct product behavior).
- **Scope:** API push leg (catalog + service + two fire points + worker deep-link + test pins). OUT: in-app notifications-center rendering, venue-page UI changes, PWA locale files (push text lives only in the API CATALOG), e-mail leg.
- **Architecture delta:** `PushKey` union +1 (`venue_review_prompt`); `Entry.title` type widened; `NotificationsService.sendReviewPromptNotification` (new, mirrors `sendPomDecidedNotification`); `MatchesService.fireVenueReviewPrompt` (new private, never-throw) called post-commit in `completeMatch` + per newly-completed row in `autoCompletePastMatches`; worker type-map +1 branch; `sendPushToUsers` data union gains `venueId`.
- **API/JSON shapes:** push data `{ type: 'venue-review-prompt', venueId, matchId }` → SW resolves `url = /<locale>/clubs/<venueId>`; notification title EN `How was {venue}?` / AR `كيف كانت {venue}؟`, body EN `Rate your match at {venue} and help other players.` / AR `قيّم ملعبك في {venue} وساعد اللاعبين الآخرين.` (venueName fallback 'the venue'/'الملعب').
- **TS signatures:** `sendReviewPromptNotification(matchId: string, venueId: string, venueName: string): Promise<number>`; `private fireVenueReviewPrompt(matchId: string, pitchId: string | null, isPlayerHosted: boolean): Promise<void>`.
- **Contract verification checklist (Gate 3):**
  - [✓] No mutation endpoint touched (notification-only; completion endpoints' return shapes unchanged — `this.findOne` contract untouched).
  - [✓] Every new DB read uses drizzle column ops (`isNotNull`, `or`) — no `eq(col, null)`, no `::uuid` casts.
  - [✓] Worker consumes exactly the emitted data shape (tripwire test pins type string + URL template).
  - [✓] No i18n keys needed (push catalog is API-side EN+AR; PWA locale files untouched).
  - [✓] Dedupe is durable (`venue_reviews` unique constraint) and migration-free.
  - [✓] Fire is best-effort: try/catch + Sentry at both fire points; completion success never depends on the push.
