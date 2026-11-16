# Run #146 — Gate 0 Retrospective (P2-220 chat-closed TOCTOU)

## Item
P2-220 (Reviewer A MINOR, run #145): `sendMessage` runs the membership + chat-closed
checks OUTSIDE the insert transaction; a match can go terminal between check and
`match_messages` insert, letting one message land in a just-closed chat.

## Audit of the area (evidence)
- `matches.service.ts:2744-2866` — REST `sendMessage`: membership SELECT (:2756) →
  chat-closed SELECT + `isChatClosed` (:2773-2787) → idempotency findFirst (:2793) →
  bare INSERT `onConflictDoNothing` (:2813). Check and insert are independent statements.
- `app.gateway.ts:421-470` — WS `send-message` has the SAME window (same shape, same gap).
  Scope decision: P2-220 boards the REST path; the WS path shares the predicate and gets
  the same fix ONLY if budget allows (see 01-program-design §scope).
- In-repo precedent: `appendDisputeEvidenceAtomically` (:4069+) — tx + `.for('update')` +
  predicated write. The fix mirrors it.
- Latent bug found during audit: `:2782 if (chatMatch && isChatClosed(chatMatch))` — an
  UNKNOWN matchId skips the closed-chat guard, falls through to INSERT, and dies on the
  FK as a 500. The rewrite's NOT FOUND branch fixes this (404 instead).
- Standing bug-class sweep (parent + Reviewer A this run): clean — zero `::uuid` casts,
  zero `eq(col,null)`, zero `console.*` in API src, ILIKE all escaped.

## DECISIONS.md check (Gate-0 supremacy)
No design/UX decision touched: this is an API write-path race fix. The idempotency
re-order (pre-check BEFORE the chat-closed tx) makes terminal-race retries return the
original row instead of a 403 — aligned with the P2-172 offline-queue reconcile contract;
no ledger entry contradicts it.

## Reviewer findings merged this run (board impact only)
- Reviewer A IM1 (float reduce on payout total, partner.service.ts:~253) → P2-221 (new).
- Reviewer A IM2/IM3 (generator TOCTOU no-venue-lock + period_end UTC/Riyadh axis mix)
  → folded into P2-216 (same files, blocked by open PR #141).
- Reviewer B gap "no add-to-calendar" → REFUTED (match/[id]/page.tsx:612,811 + API
  `/matches/:id/calendar` live). Boarded as refutation note; no build.
- Reviewer B MN1-4 + Reviewer A MN1-4 → noted in board backlog notes; none blocking.

## Conclusion
Proceed to Gate 4 via lane branch. Small slice, existing predicate reused, no schema change,
no migration, no i18n (machine code `MATCH_CHAT_CLOSED` unchanged).
