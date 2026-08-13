# POTM-Only — Remove Reviews, Elevate Player of the Match

## Gate 0 — Retrospective

**Baseline:** `main` @ 2026-08-12. Recent commits: rating removal, hydration fix, view-calendar fix.

**Findings:**
- `match_reviews` table + `submitReviews`/`getMatchReviews`/`getUserReviews` endpoints + `ReviewSection` component still live despite prior "remove rating" instruction. The "Rate your teammates" card renders on the match detail screen (joined state, completed matches).
- POTM infra exists but is incomplete vs. requirements:
  - `match_votes` + `castVote` (upsert → edit allowed) + `getPomResult` + `VOTING_WINDOW_HOURS = 24` ✅
  - `PostMatchSection` renders **only** when `status === 'completed'`, buried in joined-state section — NOT top-of-page, NOT all states.
  - No "who submitted / waiting for others" state (only `hasVoted` boolean).
  - No runner-up / full results (only single winner + count).
  - No notification when winner decided (no web-push send, no WS broadcast, winner not persisted).
  - `PomVotingSheet` disables all candidates once `hasVoted` → editing is impossible in UI despite backend upsert support.

**Classification:**
- CRITICAL: ReviewSection still visible (contradicts prior "remove rating").
- CRITICAL: POTM card not at top / not in all states.
- IMPORTANT: no submitted/waiting state, no runner-up, no edit vote, no winner notification.

## Gate 1 — Product Spec

**User stories (P0):**
1. As a player, I never see "Rate your teammates" — POTM is the only post-match recognition.
2. As a match attendee, after the game ends I can vote for POTM, change my vote until 24h after end time.
3. As a voter, I see who has already voted and that we're waiting on others.
4. As a viewer, the POTM card sits at the top of the match detail screen in ALL match states.
5. As a viewer, when voting closes the winner is shown in the card, and tapping it reveals the runner-up + vote counts.
6. As a match attendee, I receive a notification when the POTM is decided.

**Success criteria:** No review UI anywhere; POTM card top-of-page in all states; vote editable within 24h; submitted/waiting counts shown; winner + runner-up visible; notification fires once on decision.

## Gate 2/3 — Architecture & Contracts (compacted)

### Backend changes
- **DELETE** review system: `submitReviews`, `getMatchReviews`, `getUserReviews`, `match_reviews` table + relations, `SubmitReviewsDto`, `review_avg`/`review_count` from `getPublicProfile`.
- **matches schema**: add `pom_winner_id varchar(36)` + `pom_announced_at timestamp`.
- **`getPomResult`** extended response shapes (see below).
- **Winner persistence + notification**: in `getPomResult`, when window closed + winner determined + `pom_announced_at IS NULL` → persist `pom_winner_id`/`pom_announced_at`, emit WS `pom-decided`, attempt web-push (config-gated).

### `GET /matches/:id/pom-result` response contract

```jsonc
// Active / not completed
{ "status": "not_completed" }

// Voting open (within 24h of completed_at)
{
  "status": "voting_open",
  "completedAt": "ISO",
  "votingClosesAt": "ISO",
  "hasVoted": true,
  "votedFor": "user-id-or-null",
  "totalEligibleVoters": 10,   // attendees excluding self, incl. host, not no-show
  "votedCount": 4,              // distinct voters so far
  "candidates": [ { "id", "fullName", "avatarUrl" } ]
}

// Closed with winner
{
  "status": "completed",
  "winner": { "id", "fullName", "avatarUrl" },
  "voteCount": 5,
  "results": [ { "id", "fullName", "avatarUrl", "voteCount" }, ... ] // ranked, top N
}

// Closed, no winner (tie / zero votes)
{ "status": "no_winner" }
```

### Frontend changes
- Delete `ReviewSection.tsx`; remove import + usage in match detail.
- `usePom` types updated for new contract.
- `PostMatchSection` → render at TOP of content area, all states (placeholder → voting → winner → no_winner), add submitted/waiting counts, change-vote, clickable winner card → runner-up sheet.

### i18n keys (pom namespace, en + ar)
`pom.title`, `votePrompt`, `voteSubtitle`, `voted`, `changeVote`, `votingOpen`, `votingClosed`, `winner`, `votes`, `noWinner`, `noWinnerDescription`, `notAttended`, `selectPlayer`, `voteConfirmBody`, `confirmVote`, `voteCancel`, `casting`, `awaitingVotes` (NEW "waiting for X more"), `votersSubmitted` (NEW "X of Y voted"), `runnerUp` (NEW), `pomDecided` (NEW notification title), `willBeDecided` (NEW placeholder), `viewResults` (NEW).

---

## Gate 4 — Slices
1. **Slice 1 (tracer):** remove review system end-to-end (API + PWA + migration). build green.
2. **Slice 2:** POTM card top-of-page + states + runner-up + edit vote. build green.
3. **Slice 3:** winner persistence + WS notification + web-push (gated). build green.
