# P2-199 — Admin aria-pressed / aria-current sweep

## Problem
Admin console toggle buttons did not expose their pressed state to assistive technology. The DataTable pagination indicator also lacked an `aria-current` marker. This violates the a11y standard recorded in `kanban/DECISIONS.md` (aria-pressed/current on toggles).

## Scope
- `apps/admin/src/components/LanguageToggle.tsx` — locale toggle button.
- `apps/admin/src/components/NotificationCenter.tsx` — bell button that opens/closes the notification feed.
- `apps/admin/src/app/(dashboard)/layout.tsx` — mobile menu open button.
- `apps/admin/src/components/Sidebar.tsx` — add `id` for `aria-controls`.
- `apps/admin/src/components/Pagination.tsx` — current page indicator.
- `apps/admin/src/messages/en.json` + `ar.json` — add `nav.openMenu`.

## Out of scope
- New admin pages or API endpoints.
- Visual redesign.
- Adding new admin test framework.

## i18n contract
- `nav.openMenu`: "Open menu" / "فتح القائمة".
- Existing `notifications.bell` reused for the bell button label.
- No new PWA/API keys.

## Contract verification checklist
- [x] No backend/API contract changes.
- [x] Every user-facing string has an AR counterpart (leaf count equal: 701 / 701).
- [x] Toggle buttons receive `aria-pressed`.
- [x] Pagination current page receives `aria-current="page"`.
- [x] Mobile menu button receives `aria-expanded`, `aria-pressed`, `aria-controls`.
- [x] Admin type-check, root lint, turbo build, PWA vitest pass.
