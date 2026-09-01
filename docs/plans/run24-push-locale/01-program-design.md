# Gates 1–3 (compact) — run #24: P2-8 push-text localization + push fan-out

## Gate 1 — Product

**Problem:** Every web-push notification arrives in English regardless of the subscriber's app
language. KoraLink's primary market is Saudi (Arabic-first); Arabic users get English titles/bodies
on match reminders, cancellations, reschedules, removals, POTM, nudges and report outcomes.

**User story:** As an Arabic-locale subscriber, when the host reschedules our match I receive
`🕒 تم تغيير موعد المباراة — غيّر صاحب المباراة موعد "…"`, not the English text.

**IN:** per-subscription localized title/body for the 8 composition sites; parallel push fan-out;
SW `dir: rtl` for Arabic notifications.
**OUT:** DM/chat pushes (locale-neutral by design: sender name + message text); in-app bell/toast
strings (already i18n 685/685); per-category preferences (backlog); new endpoints/migrations (none).

**Success criteria:** same payload JSON shape on the wire (title/body/data) — only the text and
`data.locale` change per subscription; legacy callers unchanged; jest green incl. new localization cases.

## Gate 2 — Architecture

```
composition site (matches.service / reports.service / notifications.service)
  → sendPushToUsers(userIds, { key, vars, data })          // NEW localized shape
      ├─ legacy branch: { title, body, data }              // DM paths — byte-identical behavior
      └─ per-sub: renderPushText(key, vars, locale(sub.locale))   // NEW catalog
            → JSON { title, body, data: { …data, locale } }
worker/index.js: showNotification(dir: locale==='ar' ? 'rtl' : 'auto')
```

Files changed: `push-text.ts` (NEW catalog), `notifications.service.ts` (dispatch + fan-out + POTM site),
`matches.service.ts` (6 sites), `admin/reports.service.ts` (1 site), `worker/index.js` (dir),
`notifications.push-preferences.spec.ts` (+ localization cases).

## Gate 3 — Contracts (exact shapes)

**Wire payload (unchanged shape, localized text):**
```json
{ "title": "🕒 تم تغيير موعد المباراة",
  "body": "غيّر صاحب المباراة موع\u062d \"…\"",
  "data": { "type": "match-chat", "matchId": "…", "locale": "ar" } }
```

**TS signatures:**
```ts
// push-text.ts (NEW, exported)
export type PushLocale = 'en' | 'ar';
export type PushKey =
  | 'match_starting_soon' | 'players_needed' | 'players_needed_renudge'
  | 'match_cancelled' | 'match_rescheduled' | 'player_removed'
  | 'pom_decided' | 'report_resolved' | 'report_dismissed';
export function renderPushText(
  key: PushKey,
  vars: Record<string, string | number>,
  locale: PushLocale,
): { title: string; body: string };
export function normalizePushLocale(raw: string | null | undefined): PushLocale;

// notifications.service.ts — payload union (discriminated on 'key')
payload:
  | { title: string; body: string; data: { type: string; matchId?: string; conversationId?: string } }
  | { key: PushKey; vars?: Record<string, string | number>; data: { type: string; matchId?: string; conversationId?: string } }
```

**Call-site contract:** every formerly-English site passes `{ key, vars, data }` — never both shapes.
Vars: `title` (match title, embedded as-is), `needed` (number), `winnerName`, `reportOutcome` handled
site-side as key choice, `kickoffISO` (ISO string; catalog formats per-locale with Asia/Riyadh,
`ar-SA` / `en-GB`).

**i18n contract:** push strings live in the TS catalog (both locales, single source) — no
`messages/*.json` change → en/ar leaf-key parity stays 685/685. SW deep-link + locale routing unchanged.

**Contract verification checklist (Gate 3, explicit):**
- [✓] No new/changed endpoints — payload wire shape identical; N/A populated-mutation rule.
- [✓] SW (`worker/index.js`) accepts the exact JSON the backend produces — title/body/data keys unchanged.
- [✓] Legacy branch (DM paths) keeps byte-identical behavior — `'key' in payload` discriminated union.
- [✓] No silently-undefined fields — localized branch always produces title+body for every key/locale pair.
- [✓] User-facing strings exist in BOTH languages — catalog en+ar entries for all 9 keys (TS, compile-time total map).
