# Run #208 — Program Design (Gates 1–3 compact) — UI Defects Part 1 + i18n tripwire

**Owner story:** "As a player on staging at 360–430px in Arabic, I never see a broken label, never scroll to
find the consent checkbox before paying, and no action row ever renders off-screen." (D-20261113-32, owner chat.)

## Scope (4 defects + repo-wide sweep + tripwire)

### D1 — Missing translation keys (owner defect #1 + sweep)
v2 literal-key audit (line-aware namespace resolution; /tmp/i18n-scan2.mjs, reproducible) found **5 true
missing keys** repo-wide (not just `common.messages`):

| Site | Current | Fix | Why minimal |
|---|---|---|---|
| match/[id]/page.tsx:347 | `t('common.messages')` (MISSING) | `t('messages.title')` | messages.title = "Messages"/"الرسائل" EXISTS in both files; the button opens the chat sheet |
| (main)/profile/page.tsx:444 | `te('pushUnsubscribeFailed')` (MISSING in errors ns) | `t('common.pushUnsubscribeFailed')` | full what/why/next copy EXISTS under common (both locales) |
| (main)/profile/page.tsx:472 | `te('pushSubscribeFailed')` (MISSING) | `t('common.pushSubscribeFailed')` | same |
| components/host/HostOnboarding.tsx:165 | `t('guideClose')` (MISSING) | `t('common.close')` | common.close = "Close"/"إغلاق" EXISTS; it's an aria-label for a close button |
| components/wallet/ReceiptSheet.tsx:113 | `t('errors.offline')` (MISSING) | `t('common.offline')` | common.offline = "Offline"/"غير متصل" EXISTS |

(Zero new translation content needed for D1 — pure key-repoint fixes. TeamLineup `matchDetail.` prefixed calls
were FALSE POSITIVES of the flat scan — keys exist; no change.)

### D2 — PaymentSheet: consent below fold + ambiguous totals (owner defect #2)
File: `apps/player-pwa/src/components/payment/PaymentSheet.tsx`
1. **Move the consent block OUT of the scrollable body INTO the pinned footer**, directly above the pay CTA
   (both inside the `flex-shrink-0` footer container). Long policy text stays collapsible (`line-clamp-2` +
   "Read full policy" expander, P2-235 contract preserved). Result: consent + CTA reachable without scrolling
   at 360×640 (the owner's explicit acceptance: "no scrolling needed to complete the payment").
2. **Totals rows disambiguated** (two rows both render `t('payment.total')` today):
   - Row 1 (match price): label → **`payment.matchPrice`** (NEW: EN "Match price" / AR "سعر المباراة")
   - Row 2: `t('profile.wallet')` → stays (already distinct: "Wallet"/"المحفظة"; the walletBalance key is unused)
   - Row 3 (bold red): label → **`payment.amountDue`** (NEW: EN "Amount due" / AR "المبلغ المستحق")
   i18n: +2 keys × 2 locales, inserted surgically (namespace-scoped, NOT whole-file dumps).

### D3 — Match page action rows RTL overflow (owner defect #3)
File: `apps/player-pwa/src/app/[locale]/match/[id]/page.tsx`
- :486 and :909 rows: `flex items-center justify-center gap-4` → `flex flex-wrap items-center justify-center
  gap-x-4 gap-y-2`. Nothing renders outside the viewport at 360/390/430 in AR or EN; the dot separators ride
  inline (they wrap naturally as inline items — acceptable; verified visually via build + chunk markers).
- :880 GameDetails price icon: `<Clock />` → `<Banknote />` (lucide, added to the lucide-react import — the
  owner flagged icon/label mismatch "price row uses a clock icon"; Banknote exists in lucide-react ≥0.263
  already in the lockfile — verified via node resolve before use).

### D4 — Moyasar pay button theming (owner: "theme the button to the app's colours")
File: `apps/player-pwa/src/components/wallet/TopupSheet.tsx` — extend `ensureMoyasarStylesheet()` (or a
sibling style element it creates) with scoped overrides AFTER the vendor `<link>`: `div#mysr .bg-primary`
→ `background-color:#254132 !important` (brand-green), hover state neutral-400→brand-green-light, focus ring
kept. Scoped under `div#mysr` + `.bg-primary` (2-class specificity beats vendor's single class + !important
via order; verified vendor CSS = div#mysr .bg-primary{#767dff !important}).

### D5 — Repo-wide i18n tripwire (brief Part 1 item 1's second half)
File: `apps/player-pwa/test/i18n-literal-keys.test.ts` (NEW). Embeds the v2 line-aware scanner (compact
version, reads en.json/ar.json via import) and asserts: **zero literal `t('a.b')`-style references missing
from either locale file**. On failure, the message lists every offending file:line + key + which locale is
missing (next regression is caught at vitest, not by Abdullah's console). Baseline after D1 fixes = 0, so
the gate is green and stays green.

## Contracts (Gate 3 checklist)
- [x] No API changes — no endpoint, DTO, schema, migration touched. Mutation-return contract n/a.
- [x] Frontend types unchanged (no wire-shape edits). All changed files compile under existing tsconfig.
- [x] Adapter functions: none touched (render-only + test-only + i18n JSON).
- [x] No field silently undefined: D2 keeps `walletBalance`/`toPay` props identical.
- [x] i18n keys: every referenced key exists in BOTH en.json and ar.json (enforced by D5 forever).
- [x] Observability: n/a (no new behavior to trace; missing-key detection now automated = the observability).

## Files changed
| File | Change |
|---|---|
| apps/player-pwa/src/app/[locale]/match/[id]/page.tsx | D1 (aria-label key), D3 (2× flex-wrap, Banknote icon) |
| apps/player-pwa/src/app/[locale]/(main)/profile/page.tsx | D1 (2× key repoint te→t/common ns) |
| apps/player-pwa/src/components/host/HostOnboarding.tsx | D1 (guideClose → common.close) |
| apps/player-pwa/src/components/wallet/ReceiptSheet.tsx | D1 (errors.offline → common.offline) |
| apps/player-pwa/src/components/payment/PaymentSheet.tsx | D2 (consent → pinned footer; 2 label keys) |
| apps/player-pwa/src/components/wallet/TopupSheet.tsx | D4 (brand-themed Moyasar button) |
| apps/player-pwa/src/messages/en.json / ar.json | +2 keys each (payment.matchPrice, payment.amountDue) |
| apps/player-pwa/test/i18n-literal-keys.test.ts | NEW tripwire (D5) |
| apps/player-pwa/test/components/PaymentSheet.test.tsx | pin updates: footer-consent reachable, new labels |

## Out of scope (boarded, not built this run)
- Consent/CTA pattern on TopupSheet (85dvh sheet) — same class, separate slice (P2-365).
- Tap-target sweep across ~10 sheets (Reviewer B P0-class finding) — P2-366.
- MatchChat/clubs/FilterBar nowrap overflow risks — P2-367.
- EmailSection raw err.message — P2-368.
- PR #255 follow-ups: expiry-hours ≥1h clamp, notify-guard eviction — P2-369 (hardening).
