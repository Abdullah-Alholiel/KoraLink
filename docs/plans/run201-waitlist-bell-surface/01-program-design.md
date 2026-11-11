# Run #201 — Gates 1–3 Compact: waitlist bell surface (P2-348)

## Gate 1 — Product spec
**Problem.** The run-#200 waitlist money loop tells the player "you were promoted and
charged" / "you were removed — top up and join again" via web push, but: (a) tapping the
removal push lands on the home feed with zero context; (b) the in-app bell row for the
removal is written to the DB but never returned by the bell queries; (c) bell rows for
waitlist promotions (live since P1-17) render BLANK because the PWA has no label for the
verb. A player who missed the OS push finds a wallet debit and a silent, broken
notification surface — exactly the dispute-generating experience P2-333 set out to kill.

**User stories.**
- P0 — As a promoted/removed waitlist player, tapping the push takes me to the match.
- P0 — As a promoted/removed waitlist player, the bell/notification center shows the
  event with localized EN+AR copy (not a blank row).
- P1 — As the factory, future verbs cannot ship unrouted/unlabeled (tripwire).

**Scope.** IN: worker route branch + structure-test contract; DIRECTED_VERBS +1; PWA
verb union + icon/label maps (2 components) + feed/notification i18n keys EN+AR; parity
tripwire test. OUT: venue_ownership verbs (email channel exists — accepted scope,
boarded); A-IMPORTANT-1/2 robustness notes (boarded P2-349/P2-350); P2-345 cap (owner).

**Success criteria.**
1. Worker routes `waitlist-removed` → `/{locale}/match/{matchId}` (structure test pins it).
2. Bell queries return `waitlist_removed` rows; rendered label non-blank in both locales.
3. `waitlist_promoted` + `match_rescheduled` bell rows render localized labels (live bug).
4. New tripwire test: every DIRECTED_VERBS verb has a PWA label key in en+ar; every
   worker-routed type has a branch (extends the existing 2 tests).
5. Gates: pwa tsc 0 · vitest all green · turbo build 3/3 (sequential) · jest green.

## Gate 2 — Architecture
Data flow: `notifyWaitlistRemoval()` (already committed, run #200) → activities row
(verb `waitlist_removed`) + web push (`data.type: 'waitlist-removed'`). Three consumers
were incomplete:

| Layer | File | Change |
|---|---|---|
| API | `apps/api/src/modules/activities/activities.service.ts` | `waitlist_removed` joins DIRECTED_VERBS (:56-75) — bell SQL :237/:263 + ranking :297 pick it up automatically (compile-time constant, no migration) |
| PWA worker | `apps/player-pwa/worker/index.js` | new branch after the `waitlist-promoted` branch: `waitlist-removed && matchId` → `/{locale}/match/{matchId}` (generated worker-<hash>.js + sw.js are build churn — never commit) |
| PWA types | `apps/player-pwa/src/hooks/useFeed.ts` | ActivityVerb union += `waitlist_promoted`, `waitlist_removed`, `match_rescheduled` |
| PWA components | `ActivityCard.tsx` + `NotificationSheet.tsx` | VERB_ICON + VERB_LABEL entries for the 3 verbs (icons from existing lucide imports; no new deps) |
| i18n | `src/messages/en.json` + `ar.json` | feed.* + notifications.* keys ×3 verbs (both namespaces already carry every other directed verb) |
| Tests | `test/structure/push-notification-click.test.ts` (+extend route contract) + NEW `test/structure/verb-parity.test.ts` | route-contract list += `waitlist-removed`; cross-layer parity tripwire |

No schema/migration change (verb enum value already exists — migration 0060, run #200).
No API response-shape change (bell SQL already SELECTs the same columns for all verbs).
Observability: no new surfaces (existing paths; PostHog events unchanged).

i18n keys (added to BOTH en.json and ar.json, feed + notifications namespaces):
- `feed.waitlistPromoted` / `notifications.waitlistPromoted` — self-directed copy
  (actor IS the recipient → name-free, mirrors wallet_refunded/payout_paid style):
  EN "You're in — a spot opened at {title}" · AR "تم قبولك من قائمة الانتظار في {title}"
- `feed.waitlistRemoved` / `notifications.waitlistRemoved` — what/why/next:
  EN "You were removed from the waitlist for {title} — your wallet couldn't cover the
  seat fee. Top up and join again to claim a spot." · AR "تمت إزالتك من قائمة الانتظار
  في {title} — رصيد محفظتك لم يكفِ لرسوم المقعد. اشحن محفظتك و انضم مرة أخرى للحصول على
  مقعد." (matches the push copy shipped in #239 — one voice across push + bell)
- `feed.matchRescheduled` / `notifications.matchRescheduled` — reschedule notice with
  actor name: EN "{name} rescheduled a match you're in" · AR "قام {name} بإعادة جدولة
  مباراة أنت فيها"

## Gate 3 — Program design (contracts)
Exact shapes (no drift — verify before Gate 4):

1. **Bell row (GET /users/me/feed + /users/me/notifications)** — unchanged shape; new
   verb values appear: `{ verb: 'waitlist_removed' | 'waitlist_promoted' |
   'match_rescheduled', actor: { name } | null, match: { title } | null, isRead, createdAt }`.
   Adapter: PWA `useFeed.ts` union accepts them AFTER this change (it is the contract —
   today the API can already return `waitlist_promoted` and the PWA type lies).
2. **Worker branch contract** (worker/index.js, mirrored by generated file):
   `else if (data.type === 'waitlist-removed' && data.matchId) url = `/${locale}/match/${data.matchId}`;`
   — payload producer: waitlist.service.ts:489-491 `data: { type: 'waitlist-removed', matchId }`.
3. **Push-text catalog** — NO change (waitlist_removed/waitlist_promoted keys already
   shipped EN+AR in run #200; push copy ≠ bell copy is fine; bell copy mirrors push voice).
4. **TS signatures** — no function signature changes anywhere (declarative additions only).
5. **i18n parity contract** — en.json and ar.json each gain exactly 6 keys
   (3 feed + 3 notifications); counts stay equal (en==ar leaf counts).

### Contract verification checklist (run before Gate 4)
- [✓ n/a] Mutation endpoints return findOne(id) — NO mutation in this slice (all additive).
- [✓] Frontend type (`ActivityVerb`) accepts every verb the API can return in the bell —
  after change: all 20 DIRECTED_VERBS verbs have PWA labels (tripwire enforces).
- [✓] Adapter functions exist — none needed (verb strings flow through existing FeedItem).
- [✓] No silently-undefined field — `t(VERB_LABEL[verb])` cannot hit undefined after the
  union + maps + tripwire land.
- [✓] i18n keys exist in BOTH languages — 6 keys × 2 namespaces verified at build + tripwire.
- [✓] Worker route guard pinned by structure test BEFORE merge (extended list).
