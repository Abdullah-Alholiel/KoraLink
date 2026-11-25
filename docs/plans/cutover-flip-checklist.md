# Coolify Cutover — Flip Checklist (single-commit change list)

**Created:** 2026-11-21 (factory run #221, Life-OS worker request D-20261120-02 part 1 + D-20261121-01).
**Purpose:** every string, pin test, and setting that MUST change in the Coolify cutover
commit (D-20261106-01). The cutover is ONE owner-merged commit; this file is its exact
shopping list so nothing ships stale or false. Companions: `docs/plans/prod-on-vps.md`
(the cutover runbook), `docs/legal/lawyer-brief.md` §4 (what the lawyer must rule on),
`readiness/koralink-production-plan.md` (Life-OS workspace — the timeline).

## 1. Legal hosting copy (truth flips — THE one commit allowed to touch these)

Per DECISIONS.md (2026-11-20 row): hosting truth-pins flip ONLY in the cutover commit.

| # | File | Change |
|---|---|---|
| 1.1 | `apps/player-pwa/src/messages/en.json` — `legal.privacySharingBody1` (:1163) | "currently run outside the Kingdom; at launch it moves to servers inside the Kingdom" → post-cutover truth: hosting runs on servers inside the Kingdom (Riyadh VPS). Keep the processors' own locations (Moyasar/Unifonic KSA, Brevo EU, Sentry EU). |
| 1.2 | `apps/player-pwa/src/messages/en.json` — `legal.privacyTransfersBody1` (:1186) | "primary hosting and databases currently run outside the Kingdom" → inside-Kingdom hosting; retain the processors-abroad sentence + PDPL transfer-safeguard wording (Brevo/Sentry remain EU). |
| 1.3 | `apps/player-pwa/src/messages/ar.json` — mirror keys (:1163, :1186 region) | Arabic mirrors of 1.1/1.2 ("حالياً خارج المملكة" → داخل المملكة wording; keep "عند الإطلاق" removals consistent). |
| 1.4 | `apps/player-pwa/test/p218-legal-truth-pins.test.ts` | Flip the pins WITH the copy IN THE SAME COMMIT: EN/AR `toContain('حالياً خارج المملكة')`-class assertions invert to ban the OLD phrasing and require the new one. Verify: `cd apps/player-pwa && npx vitest run test/p218-legal-truth-pins.test.ts` green + full `npx vitest run` green + `npm run type-check` 0 (CI type-checks test/). |
| 1.5 | Evidence rule | The commit message states the cutover date + the live probe that proves prod serves from Riyadh (health + a `docker ps` on the VPS quartet). |

## 2. Release verification targets

| # | File | Change |
|---|---|---|
| 2.1 | `.github/workflows/release-verify.yml` — env block `API_BASE` / `PWA_BASE` / `ADMIN_BASE` (introduced run #221, PR #286; formerly hardcoded probe args at :33-35) | Re-point to the Coolify/sslip (then real-domain) hosts. This is now a 3-line flip — no code dive. |
| 2.2 | `apps/api` image build | Pass `--build-arg GIT_SHA="$(git rev-parse HEAD)"` so `/api/v1/health` `commit` is stamped (PR #286: `resolveBuildCommit()` = `RENDER_GIT_COMMIT \|\| SOURCE_COMMIT \|\| GIT_SHA`). Coolify sets GIT_SHA from the built commit by default — VERIFY the health body carries the SHA before trusting release-verify. |
| 2.3 | `scripts/release-verify.sh` | No change needed (hosts are argv; EXPECTED_SHA guard stays). Run it against the new hosts as the C6 gate. |

## 3. API env posture (owner-pasted; factory verifies)

| # | Setting | Cutover value | Why |
|---|---|---|---|
| 3.1 | `NODE_ENV` | `production` | prod gate family keys off it. |
| 3.2 | `TRUST_PROXY` | `1` (behind the Coolify/Traefik proxy) | correct client-IP for rate limiting + OTP caps. |
| 3.3 | `COOKIE_SECURE` | `true` | P2-241 invariant; boot THROWS otherwise (env-flags guard). |
| 3.4 | `SWAGGER_ENABLED` | `false` (or unset) | /api/docs must not serve in prod; `true`+prod THROWS at boot (run #205 guard). |
| 3.5 | `DEV_LOGIN_ENABLED` | `false` | prod+`true` THROWS at boot as of run #221 (PR #286). Launch condition 1: no OTP bypass. |
| 3.6 | `DATABASE_URL` | koralink-prod-pg URI (A4 restore first) | migrate-first runbook; **A4 gate: restore expects journal 60 (through 0058) → apply 0059–0061 → journal 62 before traffic** (32-table restore floor; recount at restore time). |
| 3.7 | `TURNSTILE_ENABLED` + `TURNSTILE_SECRET_KEY` (+ site key to PWA) | arm for public URLs | F1 flag-off ships today; public OTP WITHOUT arming = bot exposure (A6 precondition). Owner dashboard keys (OWNER-QUEUE). |
| 3.8 | `MOYASAR_*` + webhook URL registration | sandbox (launch posture) / live post-CR | P2-325 webhook half still unbuilt (F2) — reconcile-only until then. |

## 4. Frontend env re-bakes (NEXT_PUBLIC_* bakes at BUILD time — a change = full rebuild)

| # | Surface | Change |
|---|---|---|
| 4.1 | `apps/player-pwa` build env — `NEXT_PUBLIC_API_URL` | staging value is `https://aa.tail2948f9.ts.net:8443/api/v1` → new prod API host. Verify the served JS chunk carries the new host (chunk-grep) before DNS/links flip. |
| 4.2 | `apps/player-pwa` build env — `NEXT_PUBLIC_APP_URL` | new public PWA origin (canonical links, share URLs). |
| 4.3 | `apps/admin` build env — `NEXT_PUBLIC_API_URL` | same re-point (admin console `lib/api.ts`, `use-live-data.ts`, `ops-realtime.ts` read it). |
| 4.4 | CSP (`apps/player-pwa/next.config.mjs`) | API connect/script origins must include the new host (staging pins the Tailscale IP exact-host); ws:// origins for realtime. |

## 5. Post-flip verification (same session, before announcing)

1. `GET /api/v1/health` on the new host → `status:ok` AND `commit` == the merged cutover SHA (else release-verify will fail the deploy as stale — by design, P2-387).
2. `bash scripts/release-verify.sh <api> <pwa> <admin> <sha>` → ALL GREEN; the workflow stamps `release-verify/prod` on the commit.
3. Real-inbox OTP (email path; SMS needs Unifonic prod), dev-login on prod → **403 expected** (guard).
4. `/ar` + `/en` privacy/terms pages → hosting-inside-Kingdom copy live; truth-pin test green in CI.
5. Backup retarget: `scripts/db-backup-prod.sh` URI → prod-pg (F8) + one green night + watchdog freshness alarm quiet; then a restore drill on the new prod (F10 companion).
6. PWA install + join + top-up (sandbox) smoke on a real phone.

## 6. Deliberately NOT in the cutover commit

- Render/Vercel/Neon retirement (A8) — 14 stable days AFTER go-live; keep-warm stays until then.
- Turnstile live-secret rotation cadence, RBAC fine design (owner-only lanes, separate).
- Any `legal.*` key beyond the hosting/transfer flips (lawyer amendments ride their own PR).
