# Run #72 — Cycle: P2-42 CSP script-src hardening (PWA lane)

## FINAL OUTCOME (read this first)

**SHIPPED (commit <code> — see kanban/RUNS/2026-09-24T15-18Z-run72.md):**
`script-src` in PRODUCTION drops `'unsafe-eval'` (verified unused: zero `eval(` /
`new Function(` in ALL prod client chunks) and drops the DEAD `api.mapbox.com` /
`cdn.moyasar.com` script entries (zero mapbox/moyasar code or deps in the PWA).
`'unsafe-inline'` STAYS (hard evidence below). Dev script-src keeps the legacy
permissive value (react-refresh/HMR needs eval). Tripwire: `test/lib/csp-config.test.ts`
(8 tests) pins both branches.

**WHY unsafe-inline STAYS (live HTML audit, 2026-09-24, :3000 systemd-served page):**
17 inline `<script>` tags (Next.js App Router hydration/flight bootstrap
`self.__next_f.push`), zero src, zero nonce attributes. Removing the inline
allowance without a working per-request nonce pipeline blocks EVERY page's
hydration = blank app for every user. The "zero inline scripts" assumption in the
board row's 2-PR plan was wrong for this App Router build.

**BLOCKED: the nonce-based strict CSP** — attempted, reverted, evidence below.
Retry needs a dedicated cycle with an upgrade-first plan (Next canary behavior
check, RSC render probe, page-level E2E). Not budget-safe to iterate further in
a cron run where every experiment costs a ~1.5-minute rebuild.

## Experiment log (all empirical, staging worktree standalone on :3100/:3101)

| Round | Change | Result |
|---|---|---|
| 1 | nonce middleware, `node:crypto` randomBytes | EVERY page 500s — "The edge runtime does not support Node.js 'crypto' module". Middleware compiles to EDGE even under `next start`; no Node-only imports allowed there. |
| 2 | nonce via Web Crypto (`getRandomValues`+`btoa`); request rebuilt as `new NextRequest(...)` with CSP on forwarded request headers | Redirects (307) carry strict CSP + fresh nonce perfectly; ALL page renders hang forever (client disconnects, no logs). |
| 3 | in-place `request.headers.set(...)` (Next 15 documented mutation pattern) | Identical: redirects perfect, renders hang. |
| 3b | PRISTINE middleware restored (git checkout), my build | RENDERS STILL HANG → the wedge is NOT the CSP change. |
| 4 | CONTROL: owner's live projects-dir build, bare env (`env -u NODE_ENV`) | SAME wedge → environmental, predates run #72. |
| 5 | CONTROL retry with full env (`NODE_ENV=production`) | Render completes at exactly ~30s with HTTP 500 "Internal Server Error"; server log: `Failed to proxy ... [Error: socket hang up] ECONNRESET` — the standalone's internal render-proxy times out. Static assets serve in 8ms. The live systemd service (same binary, same env, same working dir) renders fine — agent-spawned server processes wedge renders on this box (possibly cgroup/CPU-share related to the agent's own scope; unresolved, NOT a repo bug). |

Emitted-header verification (the `/` 307 path — header-serving works even when
page render is wedged): exactly ONE CSP header, prod value
`script-src 'self' 'unsafe-inline' https://*.posthog.com https://aa.tail2948f9.ts.net:9460`
— no unsafe-eval, no mapbox/moyasar. Verified byte-level on the final build.

## Gate 0 — Retrospective (compact)

**Baseline:** run #71 recovery (`5caa751`..`7907537`) + reviewers (deleg_40e7d61d, both completed).

**Reviewer A (code quality):** No CRITICAL / no IMPORTANT. P2-98 migrate-vps atomicity sound
(journal insert inside `sql.begin`, SAVEPOINT-scoped dup-DDL tolerance, sentinel → rollback → exit 5).
Standing bug classes all CLEAN: 0 `::uuid` casts, 0 `eq(col,null)`, 0 `console.*` in API, i18n
parity 985/985 en/ar leaf keys, z-index conform, hydration-safe clocks. 6 MINORs (migrate `$$`
comment-stripper edges, static-grep-only spec note, clubs multiline buttons eyeball, profile
empty-state question, stray `z-10` HostMatchForm:254).

**Reviewer B (product gaps + verification):** Run #71 claims independently reproduced —
P2-98 (jest 3/3 + sql.begin + no unsafe journal insert) PASS; P2-88 guard (jest 3/3 +
0027_snapshot.json absent) PASS. Both promoted DONE. New product gaps boarded (PWA):
user-to-user block (P1-53), chat typing/read-receipts/presence (P2-99), reminder ladder
(P2-100), a11y hit targets + aria labels (P2-101), offline cache route gaps (P2-102).
Folded notes: top-up 3DS redirect UX → P0-2 row; quiet-hours per-category exemptions →
P1-20 residual note.

**Sentry triage:** KORALINK-API-1C (Neon quota) **count 1→2, lastSeen 15:00Z today** —
recurrence at the exact 5-hourly purge cadence; P1-52 NOT fixed, prod still hard-down
(owner action). KORALINK-API-1D (prod users INSERT fail, 1 event 11:43Z) = same outage
window → same root cause. koralink-web: no new issues (top lastSeen Sep 14).

**Fix:feat ratio:** remediation-heavy by design (dead-run adoption + guards); no reactive
loop signal.

**ADMIN HOLD:** unchanged. No admin items picked; apps/admin untouched.

**DECISION — build item:** P2-42. Rotation 72%4=0 = PWA lane. Standing Reviewer-A flag
since run #14. Every higher-priority open item is owner-blocked. Security beats polish.

## Gates 1-3 — final design (as shipped)

- CSP stays in `next.config.mjs headers()` (static, render-independent — survives the
  environmental render wedge AND is one less middleware moving part).
- `scriptSrc = isDev ? LEGACY : HARDENED` — prod drops unsafe-eval + dead origins;
  dev unchanged byte-for-byte.
- `connectSrc` restored EXACTLY (including the `apiOrigin = new URL(apiUrl).origin`
  derivation — origin only, because socket.io lives OUTSIDE the /api/v1 path; a
  path-prefixed source could break WS).
- All other directives unchanged. Single CSP emitter (middleware pristine).

**Contract checklist (Gate 3):** no API/DTO/adapter/i18n surface touched — N/A by design.
Empirical acceptance gate (substituted for the impossible nonce variant): emitted CSP header
verified on a production-mode standalone boot (round "final" above) ✓; tripwire suite 8/8 ✓;
root build 3/3 ✓; vitest 718/718 ✓; tsc 0 ✓; eslint 0 ✓.

## Files

- `apps/player-pwa/next.config.mjs` — prod/dev script-src split + evidence comments.
- `apps/player-pwa/test/lib/csp-config.test.ts` — NEW tripwire (8 tests).

No API/DB changes. No migration. No i18n keys.

## Next-run recommendation (for run #73)

1. Verify P2-42 partial (recipe in STATE.json in_review_items).
2. Rotation 73%4=1 → API lane. Candidates: none of the API TODO rows are unblocked
   (all money/owner-gated) — consider the Reviewer-A minors batch (migrate-vps `$$`
   stripper hardening + CastVoteDto UUID validation + @Max on pitchCostSar) as a
   small hygiene slice, or P2-99 (chat typing/read receipts) if the API lane opens a
   gateway surface — owner-shaped, check the decisions queue first.
3. The render-wedge mystery (rounds 2-5) is worth 15 minutes of curiosity next time a
   build needs local verification: try `systemd-run --user` scoped server spawn vs raw
   nohup — if the cgroup hypothesis is right, the scoped spawn renders fine.
