# Admin Dashboard — Gate 1 Product Spec

## Problem
KoraLink has no operational surface. Venue approvals, disputes (no-show appeals),
payouts, user moderation, and platform metrics are all manual/absent. The reference
screens define the target UX.

## Roles
- **Admin (HQ)** — full console access.
- **Moderator** (future) — dispute/user moderation only (add enum value later).
- **VenueOwner** — partner portal (follow-up cycle; role already in enum).

## In scope (this cycle — HQ Console)
### Modules
1. **Mission Control** — global metric cards (total float, pending payouts, matches
   booked, completion rate, dispute rate, avg resolution time); revenue time-series;
   matches played vs cancelled (6mo); monthly dispute rate; platform health; recent
   transactions; active disputes.
2. **Users** — list/search/filter; user detail (profile, wallet, karma, rating,
   no-show count, match + txn history); suspend/ban/warn; role management.
3. **Venues & Pitches** — directory (search/filter/paginate); venue detail; **approval
   queue** with business verification + evidence + internal notes + approve/reject;
   pitch inventory (size/surface/environment/hourly rate/availability/gallery).
4. **Bookings** — all pitch bookings, schedule view, manual entry.
5. **Payments & Disputes** — transactions list; refunds; **dispute resolution** (evidence,
   chat transcript, internal notes, policy ref, decision panel); settlements/payouts.
6. **Settings** — admins/roles/team; audit log viewer; platform settings (margin, grace
   period, refund policy, notification templates, gateway keys, payout cadence, feature
   flags).

### Success criteria
- Admin can log in (role-gated), see real metrics, approve a venue, resolve a dispute,
  refund a transaction, suspend a user — each backed by real DB → API → UI data flow.
- Every mutation returns a fully-populated object.
- RBAC enforced: non-admin gets 403; every admin action logged to `audit_logs`.

## Out of scope (this cycle)
- Venue Partner portal UI (screens 2/5) — follow-up cycle.
- Email/password + 2FA admin login (phone-OTP reuses existing flow first).
- Read-replica / analytics warehouse.

## Risks
- Scope creep (mitigate: vertical slices, HQ-first).
- Auth reuse vs separation (mitigate: role already in JWT; guard checks role claim).
