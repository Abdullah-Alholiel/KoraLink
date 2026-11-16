# Partner Email Lane — Program Design (Gates 1–3 compact, run #165)

## Problem / user story
A venue partner (VenueOwner) learns their payout was REQUESTED only by visiting the
console, and learns a match at their venue was CANCELLED not at all (players get
pushes; the venue that must free staff/keep the pitch gets nothing). As a partner I
want an email for payout requests and venue match cancellations so I can act without
polling the console.

## Scope
IN: (A) `payout_requested` email to the venue owner when their payout request
succeeds; (B) venue-owner cancellation email on host `cancelMatch` (admin cancel
already emails via `match_cancelled_admin` activity choke-point; underfill
auto-cancel targets the host/roster, not the venue — out of this slice).
OUT: pitch-status emails (no trigger event exists yet — next lane slice), marketing
email, per-category mutes (v1 keeps global kill-switch per P1-41 Gate 3 amendment 5).

## Architecture delta (minimal — reuses proven patterns)
**NO migration. NO enum change.** Both legs are direct `MailerService.sendToUsers`
calls (the suppression gate — verified/muted/ghost — lives inside the mailer). The
choke-point `activities.record()` route was REJECTED at build time: it requires a new
`ActivityVerb` enum value (ALTER TYPE migration) to deliver only a feed item the
partner doesn't need (they just clicked the button in the console and got the success
copy). Smaller blast radius wins — Gate 3 scope corrected in place.

1. **mailer.copy.ts**: new template `payout_requested` (EN+AR, no vars —
   `sendToUsers` passes `{}` and the choke-point convention keeps templates
   var-free when no caller passes vars). NOT added to EMAIL_ACTIVITY_VERBS
   (no activity row exists for it — it is a direct-send template like
   `match_reminder`).
2. **partner.service.ts**: optional 5th ctor param `mailer?: MailerService`
   (AuditService optional-param pattern — legacy spec constructions compile);
   PartnerModule imports MailerModule (cycle-free: MailerModule imports only
   Config+Jwt). Post-tx + post-audit + post-broadcastOps, fire-and-forget:
   `sendToUsers([ownerId], 'payout_requested', {}, {})` with
   `.catch(reportFanOutError('partner.payout-request-email'))` (P2-169 convention).
3. **matches.service.ts**: `cancelMatch` post-commit notify block (after the
   refund pushes): resolve the venue owner via ONE raw SQL
   (`SELECT v.owner_id, v.name FROM pitches p JOIN venues v ON v.id = p.venue_id
   WHERE p.id = <pitch_id>`) — `findOne`'s venue relation deliberately omits
   owner_id, so a scoped direct read is the honest path; if owner exists and
   differs from the actor: `sendToUsers([ownerId], 'match_cancelled_admin',
   { title }, { matchId, matchTitle, when: riyadhLocal(scheduledAt),
   where: venueName })` — reuses the EXISTING admin-cancel template (the venue
   owner is exactly its audience), whole block try/catch + reportFanOutError,
   best-effort: a mail failure never fails the cancel (pay()'s push semantics).

## Contract shapes (Gate 3 checklist)
- requestPayout response UNCHANGED: `{ requested, totalAmount, settlements[] }` —
  email is a side-effect (contract preserved).
- cancelMatch return UNCHANGED: `this.findOne(matchId)` outside tx.
- New i18n: NONE (email copy lives in mailer.copy.ts EN+AR; no PWA surface changes).
- [x] Mutation returns fully-populated objects (unchanged)
- [x] No frontend type changes (zero PWA surface)
- [x] Email copy EN+AR both written (Tajawal-safe, what-happened + what-next)
- [x] No field silently undefined (details box labels come from MAIL_DETAIL_LABELS)

## Slice plan (Gate 4)
- S1 tracer: template + partner.service wire + partner spec (email requested on
  success; NOT on empty-created 400; legacy 4-arg construction compiles) →
  jest partner suites → commit.
- S2: matches.service venue-owner cancel email + spec (owner emailed with when/where;
  host-owned venue → no self-email; mailer-absent → no-op; execute-throw → swallow) →
  jest matches suites → commit.
- S3: full gates (sequential turbo build + tsc + eslint) → PR → bot triage → squash.
