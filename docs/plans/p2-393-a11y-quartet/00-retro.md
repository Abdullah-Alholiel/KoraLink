# P2-393 a11y quartet — Gate 0 Retro (run #222)

Cycle area: PWA a11y (4 interactive controls). Board row: P2-393 (Reviewer B run #220, ALL parent-confirmed by code read).

## State audit
- Recent commits in area: PR #274/#275 (P2-366 tap-target census, 15 sites fixed), PR #280 (match offline), PR #282 (login/host offline), PR #284 (Turnstile parity), PR #286 (release-verify + dev-login guard).
- The PR #274/#275 census (test/p2366-tap-targets.test.ts) left a per-file KNOWN_DEBT ratchet — AppealSheet.tsx and complete-profile/page.tsx each carry 1 tracked debt button. This PR clears exactly those two entries.
- Reviewer A run #222 independently re-confirmed all 4 sites at the exact lines (no drift since the row was written). No admin-surface work in this item.

## Findings
- MINOR (Reviewer A): the match-hero chat button also lacks min-h-hit/min-w-hit — same line this PR touches for the aria fix; included with disclosure (zero test impact: w-10 h-10 is outside the census's w-8/w-9 scope).
- Census brief correction: test path is apps/player-pwa/test/p2366-tap-targets.test.ts (the board row said test/apps/…).

## Decision
Proceed to Gate 4 (compact Gates 1-3 in 01-program-design.md). Owner-approved build item (runbook default pick; no DECISIONS.md contradiction).
