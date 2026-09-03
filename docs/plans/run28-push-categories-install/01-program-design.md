# Run #28 — Push categories + install-triggered push (Program Design)

## Problem
Users who want match kickoff reminders but not chat pushes have all-or-nothing. P0-5 was deferred to #28 with a 4-category model. PWA install on iOS is required before push works (system contract), but the current `usePushNotifications` doesn't gate on installed state — an iOS user adds the PWA to home screen, the push prompt fires too early, and the permission is denied.

## User stories
- **P0-5.a** As a player, I want to mute chat pushes but keep match kickoff reminders. → 4 toggles in profile.
- **P0-5.b** As a player, I want my "no promo" preference to be respected when promos ship later. → Forward-compatible schema.
- **P0-5.c** As a player, I want my setting to take effect immediately, not after app restart. → Server is the source of truth; per-send check in `sendPushToUsers`.
- **P2-Install.a** As an iOS PWA user, I want the push prompt to only appear after I've installed the PWA. → `display-mode: standalone` gate in `subscribe()`.

## Scope (IN)
- 4 categories: `match` (kickoff/cancel/reschedule/POTM), `chat` (DMs), `promo` (reserved, no triggers today), `system` (account_suspended/report_resolved/admin actions).
- New table `user_notification_prefs(user_id, category, muted)` with unique index on (user_id, category).
- Extend `PATCH /users/me/push-preferences` with `categoryMutes: Record<CategoryKey, boolean | undefined>`.
- Add the per-category check inside `NotificationsService.sendPushToUsers` (only the `key` form, which is the only one in use post-P2-8).
- Profile UI: 4 toggle rows under the existing push settings, en/ar i18n.
- iOS install gate: `usePushNotifications.subscribe()` first checks `display-mode: standalone || navigator.standalone === true`; if not installed, surface a localized hint and return false.
- Migration applied AFTER code ships; rollback plan: drop the table (no FKs to user-facing data).

## Scope (OUT)
- 8-category taxonomy. Reserved for future expansion.
- Per-category quiet hours (keep global quiet hours only).
- Per-subscription push (each browser can mute independently). The DB stores per-user prefs; the browser still gets whatever the user is allowed.
- Email integration. (P0-9, separate cycle.)
- PWA install banner redesign. (Use the existing `usePwaInstall` state.)

## Architecture delta

### DB
```sql
-- migration 0020 (run #28)
CREATE TABLE IF NOT EXISTS user_notification_prefs (
  id varchar(36) PRIMARY KEY,
  user_id varchar(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category varchar(32) NOT NULL,   -- 'match' | 'chat' | 'promo' | 'system'
  muted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX user_notification_prefs_user_category_uidx
  ON user_notification_prefs(user_id, category);
```

### Drizzle
```ts
// apps/api/src/database/schema.ts
export const notificationCategoryEnum = pgEnum('notification_category', [
  'match', 'chat', 'promo', 'system',
]);

export const user_notification_prefs = pgTable(
  'user_notification_prefs',
  {
    id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => randomUUID()),
    user_id: varchar('user_id', { length: 36 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
    category: notificationCategoryEnum('category').notNull(),
    muted: boolean('muted').notNull().default(false),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdateFn(() => new Date()),
  },
  (t) => [
    uniqueIndex('user_notification_prefs_user_category_uidx').on(t.user_id, t.category),
    index('user_notification_prefs_user_idx').on(t.user_id),
  ],
);
```

### API contract — exact shapes
**Request** (PATCH /users/me/push-preferences):
```json
{
  "pushMuted": false,            // existing — global kill switch
  "quietHoursEnabled": true,     // existing
  "quietStartHour": 23,          // existing
  "quietEndHour": 7,             // existing
  "categoryMutes": {             // NEW — partial PATCH; undefined keys untouched
    "match": false,
    "chat": true,
    "promo": true,
    "system": false
  }
}
```

**Response** (200, full state — same envelope as today + new field):
```json
{
  "push_muted": false,
  "quiet_hours_enabled": true,
  "quiet_start_hour": 23,
  "quiet_end_hour": 7,
  "category_mutes": {            // NEW — always 4 keys, default false
    "match": false,
    "chat": true,
    "promo": true,
    "system": false
  }
}
```

**Trigger key → category mapping** (PWA + API; single source of truth in `apps/api/src/modules/notifications/push-text.ts` keys):
- `match_starting_soon` → `match`
- `match_cancelled` → `match`
- `match_rescheduled` → `match`
- POTM (sendPomDecidedNotification) → `match` (POTM is part of the match lifecycle)
- `report_resolved` / `report_dismissed` → `system`
- `match_cancelled_admin` → `system`
- `account_suspended` → `system`
- DM message (conversations.service.ts:310) → `chat`
- (reserved) `promo` → no triggers today

**sendPushToUsers diff** (one new gate, applied per-subscription inside the existing `subs.map`):
```ts
// P0-5 (run #28): per-category mute gate. Resolves from EITHER the `key` form
// (semantic catalog, all match/system triggers) OR the new `category` field on
// the inline form (DM push, conversations.service.ts:308 — locale-neutral per
// the push-text.ts comment, so the inline form stays). A muted category drops
// the subscription BEFORE the quiet-hours / SSRF checks (saves a cache miss on
// a user who would never get the push anyway).
const subCategory =
  'key' in payload
    ? CATEGORY_BY_KEY[payload.key]
    : (payload as { category?: NotificationCategory }).category ?? null;
if (subCategory && mutedCategories.has(subCategory)) return;
```
`mutedCategories` is fetched ONCE per `sendPushToUsers` call (a single join on `user_notification_prefs` for the union of all candidate `userIds`).

Inline-form payload type narrows to require `category` for DM-style pushes:
```ts
| { title: string; body: string;
    data: { type: string; matchId?: string; conversationId?: string };
    category: NotificationCategory }
```
This is a **breaking change for any caller using the inline form without a `category`** — grep showed only `conversations.service.ts:308` uses it, so I'll thread the `category: 'chat'` there. Documented in the design.

### Frontend
- `apps/player-pwa/src/hooks/useUser.ts` extends `PushPreferences` and `PushPreferencesInput` with `category_mutes` / `categoryMutes`.
- `apps/player-pwa/src/app/[locale]/(main)/profile/page.tsx` adds 4 toggle rows below the existing "Mute all" row.
- `apps/player-pwa/src/hooks/usePushNotifications.ts`:
  - `subscribe()` checks `display-mode: standalone || navigator.standalone === true` BEFORE `requestPermission()`.
  - If not installed: surface a localized hint (new i18n key `push.installRequired`), return false, no error captured.
  - Same `subscribe` API (returns boolean) — no breaking change to the profile page caller.

### i18n
- en.json: `profile.notifications` parent key (already exists at 371); add `push.categories.match|chat|promo|system` + `push.categoriesHint` + `push.installRequired` (top-level `common` since install gating can surface from a hook outside the profile page).
- ar.json: identical keys, Arabic-Indic numerals, dir=rtl.
- Parity check: `python3 -c "import json; e=json.load(open('apps/player-pwa/src/messages/en.json'))['push']; a=json.load(open('apps/player-pwa/src/messages/ar.json'))['push']; assert set(e)==set(a), 'mismatch'"` must pass.

## Files changed (the slice)
- `apps/api/src/database/schema.ts` — add table + enum.
- `apps/api/src/modules/users/dto/update-push-preferences.dto.ts` — add `categoryMutes`.
- `apps/api/src/modules/users/users.service.ts` — persist + read mutes; expand the GET-shaped return.
- `apps/api/src/modules/notifications/notifications.service.ts` — add the per-category gate in `sendPushToUsers` (key form) + a `CATEGORY_BY_KEY` map.
- `apps/api/src/modules/notifications/push-text.ts` — export the same map (for the PWA test that mirrors the mapping).
- `apps/player-pwa/src/hooks/useUser.ts` — extend types.
- `apps/player-pwa/src/app/[locale]/(main)/profile/page.tsx` — 4 toggle rows.
- `apps/player-pwa/src/hooks/usePushNotifications.ts` — install gate.
- `apps/player-pwa/src/messages/en.json` + `ar.json` — new keys.
- `apps/api/drizzle/0020_*.sql` — generated migration.
- `apps/api/src/modules/notifications/notifications.push-categories.spec.ts` — new test.
- `apps/api/src/modules/users/users.push-preferences.spec.ts` — extend existing spec.

## Risks & mitigations
- **Migration lands in live DB without code** (run #1 trap): generate code → migration → build → test → commit BOTH → then db:migrate → API restart.
- **iOS install gate UX**: if a user denies A2HS, the install prompt never comes back. Add a "How to install" link in the existing InstallPrompt flow (already ships in usePwaInstall). For this run: surface a one-time hint, do not block.
- **Per-category performance**: extra 1-table join inside `sendPushToUsers`. With ~100 subs per call, indexed on (user_id) — sub-millisecond. Acceptable.
- **chat category side-effect on conversations.service.ts:310**: the DM trigger is `key: 'chatMessage'` (or similar). Need to confirm the exact key — verify during build.

## Contract verification checklist (Gate 3, will run explicitly before Gate 4)
- [ ] DTO mutation returns the FULLY populated state (the existing return already does this — verify no regression).
- [ ] PWA `PushPreferences` accepts the new `category_mutes` field.
- [ ] PWA `useUpdatePushPreferences().mutate({categoryMutes:{chat:true}})` works WITHOUT touching `pushMuted`/`quiet*`.
- [ ] `sendPushToUsers` drops subscriptions where the resolved category is muted.
- [ ] i18n parity (en === ar leaf keys) holds after the new keys.
- [ ] iOS install gate: `subscribe()` returns false + emits `push.installRequired` when `display-mode !== standalone && !navigator.standalone`.
- [ ] Migration is reversible: `DROP TABLE user_notification_prefs` is clean (no FKs to other tables).

## Build order
1. **Code first** (schema.ts, DTO, service, PWA types, PWA profile UI, PWA install gate, push-text.ts map, en/ar i18n).
2. **Tests** (notifications.push-categories.spec.ts, users.push-preferences.spec.ts, PWA ProfilePage.test.tsx, usePushNotifications.test.ts).
3. **Migration generate** (`npm run db:generate`).
4. **Build gates** (`tsc --noEmit`, `turbo run build`, `npx vitest run`).
5. **Commit code + migration together** (run #1 trap).
6. **`db:migrate` + API restart** (only after the commit lands).
7. **Live probe**: PATCH the prefs, hit a trigger, verify the muted user doesn't get the push.
