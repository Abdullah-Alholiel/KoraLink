# Gate 0 — Retrospective: shots.so-style install landing + PWA activation

Cycle: 2026-09-01 · Ask: "mirror shots.so's PWA configuration — browser first sees an
install landing page that prompts Add-to-Home-Screen, then the installed app activates
in the best possible way (smooth, native-feeling launch)."

## Working tree at session start (multi-agent rule)

Foreign in-flight changes present — NOT mine, never stage them:
- `apps/admin` disputes page + messages (run #24 admin-dispute-replies lane, in review — commits
  `ec7cc56`, `87386cf` landed while I was working; its DTO/service files remain uncommitted in-tree)
- `graphify-out/*` regenerated artifacts, `docs/agent harnessing architecture/`, `.gitignore` edit,
  `apps/api/.env.bak-expose-20260901101040` (demo-funnel leftover)
- Deleted: `docs/architecture/agent-harness-preview.png`, `agent-harness.html`
→ This cycle stages ONLY `apps/player-pwa/**` + `docs/plans/pwa-shots-install-flow/**` (+ manifest/SW
  outputs under `apps/player-pwa/public` when rebuilt).

## Env safety (run #19 trap)

`env | grep ^NODE_ENV` → clean. No `.env` sourced in this session. gh auth OK (Abdullah-Alholiel).

## Prior art audit

- `pwa-parity-standardization` (runs ~#11–13) shipped: install banner (7-day dismiss cooldown),
  desktop picker parity, offline fallback (P2-40), manifest `id`. **It deliberately capped the shell
  at max-w-md**; the responsive-width addendum later lifted the shell to `max-w-6xl` — the addendum
  supersedes that artifact of the old plan.
- Install UX today = a passive bottom banner (`InstallPrompt.tsx`, 2s delay, appears mid-app). NOT a
  landing page. No hero, no before/after story, no screenshots in the manifest install sheet.
- `docs/landing-drafts/` exists (draft-a-player / draft-b-partner, static HTML, :9520 port) — marketing
  drafts, NOT wired into the PWA route tree. This cycle builds the **in-app install landing route**
  inside the PWA (locale-aware, part of the app), separate from the marketing drafts.

## shots.so DNA extracted (from Abdullah's paste + shots.so fetch)

1. Beforeinstallprompt-capture → custom install UI, not the passive banner.
2. `display_override`, portrait-primary, prefer_related_applications:false — manifest hardening.
3. Anti-jitter CSS (overscroll-behavior, tap-highlight, user-select) — **already shipped** in
   globals.css lines 31–88 (no work, verified).
4. Spring-physics animation discipline (transform+opacity only) — KoraLink already uses
   `animate-slide-up`, `active:scale-95/0.98` — extend with spring-curve tokens, not new libs.
5. **Richer installability surface: manifest `screenshots` (wide+narrow) → richer install sheet on
   Android/desktop; `description`, `orientation`, `categories` tuned.**
6. Cache-first precache shell → instant relaunch (already: precache + CacheFirst static assets).

## Full-stack chain check (Gate 0 step 5)

- Chain: `/` → middleware redirect `/ar` → layout mounts `InstallPrompt` (passive) →
  `usePwaInstall` (capture BIP, standalone detect, iOS detect). Chain works, but the
  **conversion surface is weak** (no dedicated landing, no activation handoff, no iOS
  step-visuals, no screenshots in the install sheet).
- No dead-UI pattern here (banner has handlers); risk is low — this cycle is additive.

## Finding classification

- **IMPORTANT**: no install landing route (shots.so-style conversion surface missing).
- **IMPORTANT**: no appinstalled → activation handoff (browser tab stays open; installed app
  opens cold with no welcome state; user must re-login if cookie missed).
- **MINOR**: manifest lacks `screenshots`/`orientation`/`prefer_related_applications`;
  iOS banner is text-only (no step visuals like shots.so's OS-correct cheat-sheet).
- fix:feat ratio last 15: 2 fix / 4 feat → healthy, no reactive loop.
- Sentry 24h: no new actionable signatures (run #24 verified).

## Decision → Gate 1

Proceed. New plan folder `docs/plans/pwa-shots-install-flow/`. Scope = player PWA only.
