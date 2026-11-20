# Run #218 — Gates 1–3 Compact (D-20261119-02: legal truth-fix + EMAIL_PROVIDER prod fail-loud)

## Gate 1 — Product
- **Problem:** (a) /privacy + /terms make 5 claims false today — the lawyer reviews these drafts NOW (launch critical path) and false claims waste the legal pass / create liability. (b) A production env missing EMAIL_PROVIDER or its provider key boots fine and silently sends zero emails (OTP outage, no signal).
- **User story:** As the reviewing lawyer, I read claims that are true as of today. As the owner, if prod email is misconfigured, the API refuses to boot and tells me exactly which env names are missing.
- **IN:** 5 key edits × EN+AR; `assertEmailDelivery()` boot guard (prod-like posture); spec pins; truth-pins tripwire test. **OUT:** any legal conclusion/new section (lawyer's job); local-dev behavior change (dev keeps log-only mailer dev-mode per design).
- **Success criteria:** (1) no key claims Saudi-phone-only login; (2) hosting claims say "currently outside / moves inside at launch"; (3) cookie claims say Secure in production; (4) prod-like (production|staging) boot throws naming the missing env(s); (5) local dev boots unchanged; (6) i18n leaf parity holds; (7) build+tests green.
- **SCOPE REVISION (PR #283 r2 — PR-Agent finding, adopted):** the guard ships with the **isProdLike** posture (production OR staging — the env-flags.ts delivery fail-closed precedent; staging is a public funnel where silent OTP loss is an outage), NOT the prod-only reading first written here. Gate-3 signature text below was correspondingly revised; the spec pins staging-throw and staging-boot cases. Staging live-verified no-op (EMAIL_PROVIDER=brevo + keys set).

## Gate 2 — Architecture
- Data flow: env (`EMAIL_PROVIDER`, `BREVO_API_KEY`, `BREVO_FROM`, `RESEND_API_KEY`) → `assertEmailDelivery(ConfigService)` in main.ts boot chain (after `assertEnvFlags`) → throw before `app.listen`. Same posture as P0-3/P1-72 guards.
- Files changed:
  | File | Change |
  |---|---|
  | apps/player-pwa/src/messages/en.json | 5 legal keys reworded |
  | apps/player-pwa/src/messages/ar.json | 5 legal keys reworded (RTL mirror) |
  | apps/api/src/common/security/email-delivery.ts | NEW guard fn |
  | apps/api/src/common/security/email-delivery.spec.ts | NEW 8-case spec |
  | apps/api/src/main.ts | import + call after assertEnvFlags |
  | apps/player-pwa/test/p218-legal-truth-pins.test.ts | NEW tripwire (bans the false phrasings) |
- Risks: (1) guard locks prod to brevo|resend — unknown providers now fail boot (deliberate: typo'd provider = misconfig); (2) AR legal copy quality — mirror the ledger-approved structure, keep draft-pending-lawyer framing intact; (3) boot-order: guard must run before listen (wired with the other asserts).
- Descoped: restoring "inside the Kingdom" wording later = a post-cutover copy flip (owner/lawyer decision, not this run).

## Gate 3 — Program Design (contract)
- No API/DTO/adapter/hook/UI-contract changes: boot-time guard + static copy. **Contract checklist:**
  - [x] Mutation returns N/A (no endpoints touched)
  - [x] Frontend types N/A (message JSON only — leaf keys unchanged, VALUES reworded; parity = leaf count equality, machine-checked by existing tripwire + new pins)
  - [x] Adapters N/A — guard reads the SAME env names the adapters' `isConfigured()` reads (Brevo: BREVO_API_KEY+BREVO_FROM; Resend: RESEND_API_KEY) — no new drift surface
  - [x] No silently-undefined fields introduced
  - [x] i18n keys: zero keys added/removed; 5 values × 2 locales reworded; EN/AR leaf parity must stay equal (existing whole-file tripwire + new p218 pins)

### Exact copy (EN source of truth; AR mirrors structure)
1. `privacySharingBody1`: "Service providers under contract: Moyasar (card payment processing), Unifonic (SMS/OTP delivery), our push notification service, email delivery, and hosting/storage providers. Our production hosting currently runs outside the Kingdom; at launch it moves to servers inside the Kingdom. Where processing happens abroad, we rely on transfer safeguards permitted by PDPL."
2. `privacyTransfersBody1`: "Our primary hosting and databases currently run outside the Kingdom; they are planned to move inside the Kingdom at launch. Some processors (for example push, email or crash reporting) may process data abroad; where that happens we rely on the transfer mechanisms permitted by PDPL (such as risk assessment, contractual safeguards, or your consent) and keep a record of such transfers."
3. `privacyChildrenBody1`: "KoraLink is not directed at children under 13, and accounts require a phone number or email address verified by one-time code. If we learn that a child under 13 has an account, we delete it. Bookings on behalf of minors should be supervised by a parent or guardian."
4. `termsAccountsBody1`: "An account requires a phone number or email address verified by one-time code, and your details must be accurate and kept up to date."
5. `privacyCookiesBody1`: "We use a small set of strictly necessary cookies and similar technologies: an authentication cookie that keeps you signed in (HttpOnly, and Secure in production), and local device storage for language preference and offline caching. We do not use advertising or cross-site tracking cookies. Push tokens are stored only after you enable notifications."

### Guard signature
```ts
export function assertEmailDelivery(config: ConfigService): void
// NODE_ENV prod-like (production|staging, per isProdLike) → the guard below
// enforces; local dev returns and keeps log-only mode by design. (PR #283 r2:
// scope-revised from the prod-only first draft — see the Gate-1 note.)
// provider = trim().toLowerCase() of EMAIL_PROVIDER || 'resend'  (parity with EMAIL_SENDER_PROVIDER factory)
// provider ∉ {brevo, resend} → throw 'EMAIL_PROVIDER=<v> is not a known transport (brevo | resend)'
// missing = required env names w/o value (brevo: BREVO_API_KEY, BREVO_FROM; resend: RESEND_API_KEY)
// missing.length → throw 'EMAIL_PROVIDER=<p> in production is missing required env: <names> — transactional email (OTP) would silently send nothing'
```
Spec cases: (1) non-prod+empty → no throw; (2) prod+unset provider → throws naming RESEND_API_KEY (default=resend parity); (3) prod+brevo missing key → throws; (4) prod+brevo missing FROM → throws; (5) prod+brevo complete → no throw; (6) prod+resend complete → no throw; (7) prod+unknown provider → throws; (8) prod+' BREVO ' (case/space) → normalizes, no throw.
