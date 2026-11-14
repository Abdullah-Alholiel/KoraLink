# Run #104 — P2-133 Settings hub (PWA)

## Gate 0 — Retrospective (audit of touched area)

- Touched area: PWA `(main)` route group — adding `settings/` route; donor = `profile/page.tsx`.
- Recent commits in area: `9891e46` (admin export feedback), `92639cc` (CSV formula contract),
  `749b915` (admin ops-feed) — no PWA-side page changes since `878951a` (a11y labels, run #80).
- **Owner standards check (kanban/DECISIONS.md):** no Drawer/menu/chrome changes — the hub only
  ADDS a page and links; profile keeps its structure. Notification bell stays feed-only
  (untouched). EN+AR always. No ledger conflicts.
- **Admin state check: N/A — this item touches no admin/partner files.**
- Reviewer A IMPORTANT (run #104): profile/page.tsx = 775-line, 5-concern monolith → the hub
  must EXTRACT (MenuItem at minimum), not extend the page.
- Reviewer B (runs #103/#104): push prefs / language / export+delete / sign-out buried in one
  long page; destructive actions adjacent to stats = mis-tap risk. Hub = neutral context;
  keep sub-surfaces LINKED, not flattened.
- Standing bug-class sweep (Reviewer A, run #104): all 8 classes clean in PWA scope.
- Fix:feat ratio healthy. Proceed to build.

## Gates 1–3 (compact)

**Problem.** Players manage notifications, language, data rights, email prefs and sign-out —
all buried mid-way down a 775-line profile page. Reviewer B: justified P1 discoverability gap.

**User story.** As a player, I open Profile → Settings and find every preference in one place:
push delivery, language, email prefs, my data (export/delete), privacy/terms — without
scrolling through stats and matches.

**Scope.**
- IN: new `settings/page.tsx`; extract `MenuItem` from the donor to
  `src/components/profile/MenuItem.tsx` (donor imports it back — behavior unchanged); hub
  LINKS to existing surfaces — never duplicates state.
- OUT: moving API logic or sheet components (SignOutConfirmSheet/DeleteAccountSheet stay
  owned by profile), any API change, PDPL data-shape changes, P2-134 (admin placement),
  P2-123/145 (owner calls), P2-147 (48h veto clock elapses 2026-10-06T10:16Z → run #105).

**Route contract (new).**
- `GET /{locale}/settings` — `(main)` group page: layout chrome only (no own
  MobileFrame/BottomNav), `loading.tsx` skeleton, OfflineBanner, sticky white header
  (back → `/{locale}/profile`, title = `settings.title`, back label = `common.back`).

**Extracted component contract.**
- `src/components/profile/MenuItem.tsx` — exact move of profile/page.tsx:51–101. Props
  unchanged: `{icon, label, endText?, danger?, href?, onClick?}`. Named + default exports.
- `src/components/profile/ProfileLinkRow.tsx` — a MenuItem-shaped anchor that navigates to
  `/{locale}/profile#<anchor>` via `next/link` (not raw <a>) so client routing keeps the
  SPA feel; used for profile deep-links.

**Settings page render contract (fixed order, all strings via i18n).**
1. `OfflineBanner` + sticky white header (back + `settings.title`).
2. Section `settings.sectionNotifications`: link-row → `/{locale}/profile#notifications`
   (label `settings.notifications`); link-row → `/{locale}/host-guide`
   (label `settings.hostGuide`; route exists at `src/app/[locale]/host-guide/page.tsx`).
3. Section `settings.sectionEmail`: `<EmailSection />` (existing shared component, unchanged).
4. Section `settings.sectionData`: hint line `settings.dataNote` (PDPL: export downloads a
   JSON of your data; delete schedules removal after a 30-day grace window — role="note");
   link-row export → `/{locale}/profile#account` (label `profile.exportData`);
   link-row delete → `/{locale}/profile#account` (label `profile.deleteAccount.menu`).
5. Section `settings.sectionLegal`: privacy → `/{locale}/privacy`
   (label `profile.privacyPolicy`), terms → `/{locale}/terms`
   (label `profile.termsOfService`).
6. Section `settings.sectionAccount`: language row — Globe icon + `settings.language` +
   `LanguageToggle size="md"` (pressed-state toggle, mirrors profile row); link-row sign-out
   (danger) → `/{locale}/profile#account` (label `profile.signOut`; the confirm sheet stays
   on profile — the hub links, never duplicates destructive state).

**Anchor prerequisites on the donor page (slice 3).** `id="notifications"` on the
notifications menu block and `id="account"` on the Account section label container, each with
`scroll-mt-24` (clears the sticky header). Pure attributes — zero behavior change.

**i18n contract — 10 NEW keys, both locales (`settings.*` namespace).**

| Key | EN | AR |
|---|---|---|
| settings.title | Settings | الإعدادات |
| settings.sectionNotifications | Notifications | الإشعارات |
| settings.sectionEmail | Email preferences | تفضيلات البريد الإلكتروني |
| settings.sectionData | My data | بياناتي |
| settings.sectionLegal | Privacy & legal | الخصوصية والشروط |
| settings.sectionAccount | Account | الحساب |
| settings.notifications | Push notification settings | إعدادات الإشعارات الفورية |
| settings.hostGuide | Host guide | دليل المضيف |
| settings.language | Language | اللغة |
| settings.dataNote | Export downloads a JSON copy of your data. Deleting your account schedules removal after a 30-day grace window. | تصدير البيانات ينزّل نسخة JSON من بياناتك. حذف الحساب يجدول الإزالة بعد مهلة 30 يومًا. |

Reused keys (no drift): `common.back`, `profile.exportData`, `profile.deleteAccount.menu`,
`profile.privacyPolicy`, `profile.termsOfService`, `profile.signOut`.

**Gate 3 checklist.**
- [x] Frontend types: page consumes shared components' props; no new API types.
- [x] Adapter functions: none needed (no API change).
- [x] No field silently undefined: page is pure links + in-section language toggle.
- [x] i18n: 10 new keys in BOTH ar.json and en.json (parity test enforces); reused keys
      verified present.
- [x] Hydration: no `new Date()`/`navigator.*` on render path (page is static links + toggle).
- [x] Chrome: no MobileFrame/BottomNav in the page ((main)/layout owns them).
- [x] z-layers: sticky header z-40 (< sheets z-[60]/[70], < nav z-50 allowed for sticky bars
      per personal-info precedent).

## Slices (Gate 4)

1. Extract `MenuItem` → `src/components/profile/MenuItem.tsx`; donor imports it back. Build green.
2. `settings/page.tsx` + `settings/loading.tsx` + i18n 10 keys × 2 locales. Build green.
3. Anchor attributes on donor (`notifications`, `account`, scroll-mt-24). Build green.
4. Tests: `test/app/settings-page.test.tsx` (renders rows, i18n labels, toggle present) +
   structure pins: route-boundaries LOADING += settings, offline-banner REQUIRED_SURFACES +=
   settings. Then full gates + PR + squash.

## Status

| Gate | Name | Status |
|---|---|---|
| 0 | Retro | ✅ this doc |
| 1–3 | Compact design | ✅ above |
| 4 | Build | 🔄 in progress |
