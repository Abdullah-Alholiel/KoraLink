# Run #154 — Gate 0 Retrospective (P2-228 + P2-235, PaymentSheet error/consent lane)

**Date:** 2026-10-22 ~01:45Z · **Lane:** PWA screens (154 % 4 = 2 → Admin emphasis; no admin-area
work was buildable/needed — admin tree clean, nothing landed; PWA payments lane picked per the
user-visible mandate). **Mode:** autonomous, PR flow.

## Boot reality (slots 152/153 of this job)

The job's 10:15Z and 15:15Z slots on 2026-10-21 FAILED AT BOOT — the cron pin had been flipped
back to **opencode-go** (`model glm-5.3-flash / provider opencode-go`), which 401'd at 10:15Z
("API key has expired") and 400'd at 15:15Z ("Go model requires Global regions"). Work delivered
under the numbers "run #152"/"run #153" (P2-234, P2-238/P1-68, P2-239, P2-240, P2-241) came from
**other sessions' one-shot jobs**, not this recurring job's slots. This run is numbered **#154**
per STATE.json (`last_run: 151` + one complete fire (01:15Z 10-21) = #152's slot consumed by the
run-151 report numbering; the two failed slots produced no runs). Lock note records this.

**Phase 0 self-heal applied:** cron pin reset to `zai` (delegation was already clean:
glm-5.3-flash/zai/coding base; probe 200 in 2.2s).

## Retro of the touched area (recent commits + tech debt)

- `2daa6e1` (P2-239) landed `currency` prop + comment fix on PaymentSheet — this cycle's base.
- Standing debt in the SAME file was already boarded: P2-228 (raw `err.message` :85, single
  generic error :245, no offline guard :225) and P2-235 (consent truncation :217). Both fixed
  THIS cycle in one pass (same file, one PR).
- DECISIONS.md consulted FIRST: no entry conflicts with error-copy standards (EN+AR always,
  what-happened+why+next, money-flow reassurance) or the consent-expander approach. Drawer rule
  untouched (no drawers in scope).
- Reviewer A (run #154, live) found the PR-#161 beyond-end bug **not ported** to
  `wallet.service.ts getHistory` — verified against code, fixed same run (sister slice in this PR).
- Reviewer B verified all 4 run-#151 claims (code level) — one **board-path drift** corrected:
  push-tag source is `worker/index.js`, not `public/sw.js` (generated, gitignored).
- Full-stack connectivity audit (Gate 0 step 5): join chain Store→Page→Hook→API re-read during
  implementation — PaymentSheet is a leaf sheet; `onPaySuccess` → `handlePaySuccess` (match page)
  refreshes wallet + seat state; error path previously dead-ended at raw text, now classified.
- fix:feat ratio of the last 12 commits: 6 fix / 2 feat / 4 docs — no reactive-fix loop.
