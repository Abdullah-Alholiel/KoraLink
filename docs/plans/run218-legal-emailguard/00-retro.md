# Run #218 Gate 0 — Retro (item: D-20261119-02 legal truth-fix + email fail-loud)

**Baseline:** origin/staging `bc0dc61` (run #217 close). Worktree lane `lane/run218-d20261119-02`.

## Ledger check (DECISIONS.md read FIRST — supremacy rule)
- Governing rows: **D-20261118-02** (Life-OS worker, escalated by reminder **D-20261119-02**: "Build before any P2 polish row") — fix false-today legal strings EN+AR + prod fail-loud email boot guard. Reversible work; no owner-only action touched.
- No design/UX change contradicts the ledger: copy edits make claims TRUE, they do not restyle.
- Launch lane (D-20261113-26 standing): F1/F3/F4/F5 built; F2+F7–F10 owner-gated; F6 has no board row → parent review item this run.

## Recent-commit audit (fix:feat ratio)
Last 8 commits on staging: 3 feat/fix PRs (#280/#279/#281) + docs. Ratio healthy (~1:1); no reactive-fix loop. No bare-row mutations landed (P2-385 kept the sentinel contract).

## Area audit (what this item touches)
- `apps/player-pwa/src/messages/{en,ar}.json` legal ns: 5 false-today claims (lines ±1160/1183/1184/1189/1190/1191/1201/1202 — key-addressed, not line-addressed):
  1. `privacySharingBody1` — claims "servers inside the Kingdom" included in hosting NOW (true only after Coolify cutover).
  2. `privacyTransfersBody1` — claims primary hosting+databases "run inside the Kingdom" NOW (prod = Render/Vercel/Neon today).
  3. `privacyChildrenBody1` — claims accounts require a **Saudi phone number** (email OTP login exists).
  4. `termsAccountsBody1` — same Saudi-phone claim.
  5. `privacyCookiesBody1` — claims cookie is "(HttpOnly, Secure)" unconditionally (Secure only when COOKIE_SECURE=true — guaranteed in production).
- `apps/api` email transport: `email-sender.provider.ts` defaults to `resend` when EMAIL_PROVIDER unset; adapters self-disable (log-only) without keys → a prod env that forgets the provider or its key silently sends NOTHING (OTP outage with zero signal). Guard pattern exists: `assertBootstrapSecrets` (P0-3) + `assertEnvFlags` (P1-72) fail loud at boot in main.ts.
- Staging live state verified: `EMAIL_PROVIDER=brevo` set → guard is a no-op on staging boot.

## Reviewer input merged (Phase 2, run #218)
- Reviewer A: no CRITICAL/IMPORTANT; 3 MINOR admin notes (reopen not version-guarded; reviews actions rely on API predicates; earnings success note ICU shape) → board as note-level, not built this run. Hex clean.
- Reviewer B: run-#217 claims 3/3 TRUE (independently reproduced the stale-prod release-verify exit-1). New product gap: **sw.js has no fetch handler → offline caching is banner-only** → boarded P2-388 (not built this run).

## Full-stack connectivity (Gate 0 step 5)
Not a "broken flow" report; chain verified for the guard: env → ConfigService → provider factory (`EMAIL_SENDER_PROVIDER`) → port `EMAIL_SENDER` → adapters' `isConfigured()` (Brevo needs API key + FROM; Resend needs API key) → mailer gates on it. Guard reuses the exact key sets the adapters check — no drift possible (single source documented in-spec).

## Findings classification
- CRITICAL: none.
- IMPORTANT: the 5 false legal claims (lawyer reviews them THIS WEEK — launch critical path) + silent-send-nothing prod email risk.
- MINOR: Reviewer A's 3 admin notes (boarded only).

**Proceed to Gate 1: YES** (compact, per autonomous mode).
