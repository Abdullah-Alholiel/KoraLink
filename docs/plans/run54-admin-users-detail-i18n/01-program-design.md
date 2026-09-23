# Run #54 — Program Design (Gates 1–3 compact) + Status

## Gate 1 — Product spec
**Problem:** an AR-locale admin opening Users → detail sees a mostly-English page (title,
loading, 12 field labels, back link, policy note, all four action buttons). The moderation/
ban decision surface — one of the highest-stakes admin actions — breaks the Arabic console.
**User story:** as an Arabic-locale admin, I read the user's fields and moderation actions in
Arabic so I can ban/suspend confidently.
**Scope IN:** users/[id]/page.tsx full localization (new `userDetail` ns), Sidebar mobile-close
aria-label key, structure-guard addendum pinning my-games.
**Scope OUT:** users list page (already localized), wallet banner variant (intentional plain
fallback — not pinned), other detail pages (already compliant), any API change.
**Success criteria:** zero hardcoded English literals remain in users/[id]/page.tsx; EN=AR
leaf-key parity holds (programmatic check); sidebar aria-label localized; structure test covers
3 surfaces; all gates green.

## Gate 2 — Architecture
- `apps/admin/src/messages/{en,ar}.json`: add `userDetail` ns (23 keys) + `nav.closeMenu`.
  No other file touches i18n. Parity enforced by count check + PWA-style symmetric diff.
- `users/[id]/page.tsx`: `useTranslations('userDetail')` + `useTranslations('common')` +
  `useTranslations('nav')` (PageHeader title/subtitle, loading branch mirrors venues/[id]
  pattern — PageHeader + tc('loading')), rows become `[key, value]` pairs rendered via
  `t(`field_${key}`)`, actions/notes/back-link all keyed, back-arrow `rtl:-scale-x-100`
  (venues/[id]:74 pattern).
- `Sidebar.tsx:102`: `aria-label={t('closeMenu')}` (nav ns already imported).
- `test/structure/offline-banner-coverage.test.ts`: add my-games to REQUIRED_SURFACES.
- Files changed: 5 (+2 gate docs). No DB, no API, no migrations (Phase 4.5 sweep trivial).

## Gate 3 — Contracts (exact)
```jsonc
// en.json — new namespace (ar.json mirrors with Arabic; leaf count MUST equal)
"userDetail": {
  "titleFallback": "User",           // "مستخدم"
  "loading": "Loading user…",        // "جارٍ تحميل المستخدم…"
  "backToUsers": "Back to users",    // "العودة إلى المستخدمين"
  "field_phone": "Phone",            // "الهاتف"
  "field_handle": "Handle",          // "المعرّف"
  "field_role": "Role",              // "الدور"
  "field_wallet": "Wallet",          // "المحفظة"
  "field_karma": "Karma",            // "الكارما"
  "field_rating": "Rating",          // "التقييم"
  "field_noShows": "No-shows",       // "الغيابات"
  "field_matchesPlayed": "Matches played", // "المباريات التي لُعبت"
  "field_totalSpent": "Total spent", // "إجمالي الإنفاق"
  "field_verification": "Verification", // "التحقق"
  "field_joined": "Joined",          // "تاريخ الانضمام"
  "field_lastSeen": "Last seen",     // "آخر ظهور"
  "roleNote": "Changing the role takes effect on the user's next sign-in (the JWT carries the role claim).",
      // "يبدأ تغيير الدور مفعولًا عند تسجيل المستخدم التالي (رمز JWT يحمل صلاحية الدور)."
  "ban": "Ban",                      // "حظر"
  "unban": "Unban",                  // "رفع الحظر"
  "suspend7d": "Suspend 7d",         // "إيقاف 7 أيام"
  "liftSuspension": "Lift suspension", // "رفع الإيقاف"
  "na": "—"                          // em-dash both locales (placeholder, non-text)
},
// nav addition: "closeMenu": "Close menu" / "إغلاق القائمة"
```
- TS: page keeps its data flow (`useLiveAdminData<AdminUser>`); rows array becomes
  `['phone', ...value][]` keyed by `field_*`; `t.has` unused (all keys always rendered).
- Verification-status VALUE continues through StatusBadge (`status` ns — already localized,
  safe fallback for unknown enums); ratings/karma stay digit-neutral (Latin digits fine in
  admin console; money stays formatMoney).
- Loading branch: `<PageHeader title={t('titleFallback')} subtitle={t('loading')} />` + body
  `{t('loading')}` (venues/[id] parity, :47-52).
- checklist: [x] mutation contract N/A (read-only page) · [x] every new user-facing string
  has en+ar entries · [x] no API shape change · [x] Sidebar key lands in BOTH locales ·
  [x] structure test stays green (3 surfaces now).

## Gate status
| Gate | Name | Status | Artifact |
|------|------|--------|----------|
| 0 | Retrospective | ✅ DONE (autonomous) | 00-retro.md |
| 1 | Product spec | ✅ DONE (autonomous) | this doc §1 |
| 2 | Architecture | ✅ DONE (autonomous) | this doc §2 |
| 3 | Program design | ✅ DONE (autonomous) | this doc §3 |
| 4 | Vertical slices | 🔄 IN PROGRESS | commits on staging |
