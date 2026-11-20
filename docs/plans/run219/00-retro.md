# Run #219 Gate 0 Retrospective — DB & Infra rotation (219%4=3)

## Area audit (target: API auth/captcha + tripwire discipline)

### Contract health
- Both public OTP flows (SMS + email) carry the FULL layered defense as of HEAD 6ce47b1a:
  global ThrottlerGuard 60/min (app.module.ts:31,60) + @Throttle 3/min per route
  (auth.controller.ts:56,82,155; email-auth.controller.ts:54,78) + Turnstile fail-closed gate
  (auth.controller.ts:69, email-auth.controller.ts:64, documented 400-asymmetry on the email
  surface) + per-phone/per-address daily caps in OtpStoreService + per-IP daily 50 (P2-19).
- Reviewer A run-#219 census claimed the email send lacked the Turnstile gate — REFUTED by
  direct code read (:64). The census's value: it forced a full read that CONFIRMED parity today
  and identified the real gap = nothing mechanically pins it (P2-382's actual scope).

### Tech debt observed
- No un-fixed confirmed findings in /home/ubuntu/audits/koralink/run-5 (FIX-before-HUNT clear).
- Hex lane clean at 349/27/1 (parent audit this run, all 10 metrics ok) — no drift rows.
- Sentry 24h: top signature = `CORS origin not allowed: https://evil.example` ×136 (scanner
  probes denied at CORS before reaching auth — expected noise; MOTS now pinned in STATE.json).
- Migration journal consistent: 62 entries vs 63 SQL files (gist_indexes.sql = non-journal
  helper, guarded by snapshot-chain spec); pending-on-prod = 0059_settlement_void +
  0060_waitlist_removed_verb (ride the next promote; migrate-first runbook per P2-51).
- DECISIONS.md ledger read at Gate 0: no contradicting standards for the picked items; 3 fresh
  Life-OS worker rows (D-20261120-01/-02) are queued for the worker, not the factory.

### Board-accuracy lesson (this run's retro headline)
Three of four "open" review findings dissolved under code read (chat-offline, callback-offline,
email-Turnstile-missing) and one stale board row (P2-367) was closed as already-built. The
review→board→build pipeline's weakest link is now FINDING VERIFICATION, not building. Standing
adjustment: reviewers' concrete defect claims get a parent code-read BEFORE boarding (same
claims≠facts discipline the loop applies to its own prior-run claims).

### Fix:feat ratio (last 15 commits)
12 feat/fix code PRs vs 3 docs commits across runs #217-#218 — healthy, no reactive-fix loop.
