# Cycle: run14-admin-i18n — Gates 1–3 (compact)

## Problem
`apps/admin` (HQ + partner console) is English-only. Arabic-first venue owners — the primary
users of the partner portal — operate entirely in a second language. Board item **P1-12**.
Rotation focus this run is Admin (run#14 % 4 = 2), so this is the top buildable board item.

## User story
As a **venue owner who reads Arabic first**, I want the partner portal (nav, dashboard,
venues, pitches, earnings, settings) in Arabic with RTL layout, so I can run my venues
without translating every label in my head.

## Scope (this cycle = vertical slice, not the whole console)
**IN:** next-intl in apps/admin; `ar`/`en` message catalogs; locale persisted in
localStorage (`admin_locale`); root `<html lang/dir>` switch; sidebar language toggle
(EN/عربي); **partner portal strings** (layout + partner/page + partner/venues + partner/
pitches + partner/earnings + partner/settings + shared components they render).
**OUT (follow-up cycles):** HQ console pages (dashboard/users/matches/venues/disputes/
reports/transactions/settlements/audit/settings + their components), login page, error
files. Recorded as the remaining scope on P1-12.

## Architecture delta (no API changes)
- New: `apps/admin/src/i18n/request.ts` (next-intl request config), `messages/en.json`,
  `messages/ar.json`, `components/LanguageToggle.tsx`, `hooks/useAdminLocale.ts`.
- Changed: `app/layout.tsx` (NextIntlClientProvider + dynamic lang/dir), Sidebar, 5 partner
  pages, shared components rendered by partner pages (PageHeader, MetricCard, StatusBadge,
  SlotManager, EditPitchSheet, Pagination as needed).
- Client-side locale switch (admin is a client-authenticated console, no locale routing).
- Numbers stay Latin-digit en-US format for v1; money prefix "SAR"/"ر.س" localized.

## Exact contracts (Gate 3)
- **Storage key:** `admin_locale` ∈ `'ar' | 'en'` (default `'en'`), localStorage, read at
  module scope in `useAdminLocale()` (client hook, SSR-renders `'en'` first paint, swaps in
  `useEffect` — admin is behind a client login, so no SEO/SSR locale concern).
- **Message shape:** flat namespaced JSON mirroring the admin surface:
  `nav.*` (11 sections + logout + partnerPortal + role partner/HQ),
  `partner.dashboard.*` (title, subtitle welcome, metrics ×4, schedule table ×6, deposits
  ×3, loading/error/empty ×4), `partner.venues.*`, `partner.pitches.*`,
  `partner.earnings.*`, `partner.settings.*`, `common.*` (loading, error, retry, save,
  cancel, delete, confirm…). AR values must be natural Saudi Arabic, not transliterations.
- **Component contract:** every translated component reads `t` via
  `useTranslations('<ns>')`; no hardcoded user-facing strings remain in touched files
  (verified by grep after edit).
- **Tests:** vitest on the admin app? — Admin has NO test runner configured; verification =
  `npx tsc --noEmit` + `turbo run build` + grep-zero hardcoded strings in touched files +
  live screenshot at both locales. Locale key-parity check: node script comparing key sets.

## Gate 3 contract verification checklist
- [x] No API/mutation contracts touched — backend out of scope, zero endpoint changes.
- [x] Every string added to BOTH en.json and ar.json under identical paths (script-verified).
- [x] Locale state is the wire value ('ar'|'en') stored once; labels derive from catalogs.
- [x] dir flip applies at `<html>` so tables/inputs mirror (Tailwind logical utilities in
      touched components only — no global RTL rewrite).
- [x] No i18n keys referenced that don't exist (MISSING_MESSAGE guard — grep + parity script).
