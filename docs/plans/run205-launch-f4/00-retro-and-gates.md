# Run #205 — Launch lane F4 (PDPL legal drafts) + P1-72 Swagger guard

## Gate 0 (retro, compact)
- DECISIONS.md read FIRST. Relevant rows: D-20261106-10 (staging posture Apply — flags still unset in .env, worker request D-20261113-08 asks the mechanical flip), D-20261113-26 (launch lane: F1–F10 critical path, first = legal drafts, marked 'Life OS WORKER request'), D-20261113-28 (promote flow: owner go → Hermes merges+deploys). No contradiction: F4 is the worker-requested launch item and reversible (content-only, i18n + 2 pages).
- Cycle-area audit: sibling lane landed 4 Moyasar hotfix PRs (#248–#251) + ops commit a49c389 today — payment surfaces are HOT, avoided. Reviewer A found 1 IMPORTANT on env-flags asymmetry (built as PR #253); MINORs recorded (api-adapter status fallback, dead CSP entries, TopupSheet 429 observe-note).
- Hex lane: clean 345/27 (parent audit + Reviewer A agree). Sentry: moyasar/intent-ageout signatures = today's live top-up testing (P0-2 sibling work), zero new factory-owned clusters.

## Gates 1–3 (compact — F4)
- Problem: /privacy + /terms are placeholder-depth (24 legal keys, 4-5 sections, hard-coded dates, bare-email contact). Launch condition 4 needs lawyer-reviewable PDPL-structured drafts.
- User story: as a KSA player/venue owner I can read a full PDPL notice + terms (EN+AR) so the lawyer can review and launch condition 4 can start its clock.
- Scope IN: full PDPL 9-section privacy notice + expanded terms, EN+AR, structured sections renderer, 'draft pending lawyer review' banner, effective-date key. OUT: lawyer review itself, consent-record backend, cookie banner, data-request portal.
- API delta: NONE (pages + i18n only). TS signatures: `LegalSection = { heading: string; body: string[] }`; sections built in-page from the `legal.*` namespace.
- i18n contract: ~60 new leaf keys under `legal` ns (privacy*) + ~14 terms keys, EN+AR parity exact; retention of all 24 legacy keys (2 pages keep consuming intro/title/desc keys? NO — pages move to section-array keys; legacy intro keys stay for banner reuse).
- Risks: translation quality (factory AR — flagged 'draft' precisely so the lawyer/owner corrects); JSON size (~9KB/loc, trivial).

## Gate 3 contract verification checklist
- [x] No backend contract touched (zero API/schema/DTO changes) — N/A items trivially hold.
- [x] Frontend consumes only `useTranslations('legal')` — all new strings inside one namespace, both locales.
- [x] Both pages render from a `LegalSection[]` array — one renderer, no per-section JSX drift.
- [x] EN+AR leaf-key parity machine-checked post-insert.
- [x] Banner + effective date localized; no hard-coded EN strings remain in the two pages.
- [x] Turbo build + vitest green before push (see run report evidence).
