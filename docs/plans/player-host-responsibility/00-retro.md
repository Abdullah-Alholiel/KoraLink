# Gate 0 — Retrospective & Full-Stack Connectivity Audit

Cycle: **player-host-responsibility** · Date: 2026-09-09 · Baseline: `ae8cc1d` (run #46 released, staging `834662b`, branch `staging`)

## Pre-flight (all green)
- `gh auth status`: Logged in to github.com as **Abdullah-Alholiel** ✓
- Working tree: `M scripts/deploy-stading.sh` (foreign WIP — DO NOT STAGE), untracked `.local/`, `apps/player-pwa/.local/` (foreign) ✓
- node v22.23.2, npm 12.0.2 (npm@10+ workspaces OK) ✓
- Branch: `staging` (working branch; main = release-only)

## Recent-cycle pattern (last 15 commits)
Run #46 shipped email+OTP login (PR #15), Neon reconciliation, CI/CD live (pr-gate.yml +
release-verify.yml). Recent commits are overwhelmingly `feat:`/`chore:`/`docs:` — **fix:feat
ratio ≈ 0:3 in the visible window** (no reactive fix loop). Last 6 PRs landed clean with
release-verify stamps.

## Full-stack audit of the host-pays / joiner-pays money chain (traced end-to-end)
1. **DB → createMatch** ✓ `matches.pitch_cost_sar` persisted server-authoritative; wallet debit
   via guarded UPDATE (balance-floor, `koralink_wallet_insufficient` 400) + `PITCH_BOOKING`
   ledger + `slot-booking-{slotId}` idempotency (unique). Auto-cancel + manual cancel refund from
   `pitch_cost_sar` with `refund-{matchId}` key. Reschedule nets old/new cost with floor check.
   TRACED 2026- booking creation → wallet → ledger intact.
2. **Joiners' money — 3 CRITICAL gaps found (the reason this cycle exists):**
   - **JG-1 (host never reimbursed)**: host pays full `pitch_cost_sar` at create; joiners each
     pay `price_per_player` via PaymentSheet → `POST /wallet/pay` (MATCH_FEE DEBIT); venue
     settlement only generates for `status='Completed'` (completion-gated). But **nothing ever
     credits the host back** — `completeMatch` credits nobody; `PRIZE` enum value defined but
     unused. Host is permanently out-of-pocket `cost − (players−1)×price_per_player`... and
     actually the whole cost minus joiner fees that go to the platform.
   - **JG-2 (joiner fees not refunded on cancellation)**: `cancelMatch`/auto-cancel refund only
   the host's `pitch_cost_sar`. A joiner who paid MATCH_FEE at join loses it on any
   cancellation — silent money loss for the player.
   - **JG-3 (join-time payment client-orchestrated)**: PWA calls `/wallet/pay` then `/join` as
   two independent calls — the API's `joinMatch` never verifies a joiner actually paid. Two
   sequential calls + client orchestration = a dropped network call between them leaves paid-but-not-joined (silently out of pocket) or joined-but-not-paid (free seat).
   - **JG-4 (display divergence)**: `pricePerPlayer()` FE mirrors `calculatePricePerPlayer` BE
   (`round2(cost/(n−1) + 5)`) — price embeds a SAR 5/platform share; hosts currently absorb the
   whole cost. Host sees "Free" label on own cards (gameDetails.hostFree).
3. JG-4 note: `matches` schema has NO host_type/booking_user concept — `host_id` = the creating
   user; Player/VenueOwner roles exist on `users.role`. A "player-hosted, user-booked" match is
   today indistinguishable from self-booked. **This cycle introduces the distinction.**

## Admin-state check (mandatory when touching admin surface)
- We READ the settlements service (venue payouts) and may extend the admin matches PATCH (JG-1b
  fallback). No `apps/admin` UI changes planned this cycle (console work is Abdullah's lane).
- `git status --short apps/admin apps/api/src/modules/partner` → clean (no in-flight owner work at risk).

## Findings classification
- CRITICAL (this cycle's reason): JG-1, JG-2, JJG-3 typographically → JG-3, JG-4 (display divergence + missing explicit booker/host labeling — Abdullah's exact ask).
- IMPORTANT: server-authoritative join payment enforcement (JG-3) must land together with JG-1/2
  — a join-fee model without server verification is worse than today.
- MINOR: `scripts/deploy-staging.sh` foreign modification (leave alone), untracked `.local/` dirs (leave alone).

## Recommendation
PROCEED to Gate 1. The feature ask (label + hold payout + ToS) is P0; the discovered gaps
JG-1/2/3 are the same money-chain and MUST land in the same cycle or the "host reimbursement
after completion" regulation is unenforceable (today there is literally no credit path to make
"payout after match completion" true).

## Explicit user-visible consequence of doing nothing
A player-hosted match booked via KoraLink: host fronts SAR ~300+ upfront, joiners pay their
share at join, venue gets settled by admin after completion — **the hosting player never gets
his money back**, and if the match cancels, joiners keep nothing back either. Plus nothing
anywhere tells joiners who booked/who bears responsibility.
