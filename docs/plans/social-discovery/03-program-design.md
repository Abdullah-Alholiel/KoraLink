# Gate 3 — Program Design (Contracts): Location & Social Discovery

**Cycle:** `social-discovery`
**Date:** 2026-08-14
**Status:** Draft for approval (Gate 3 → 4)

> This gate locks the exact JSON response shapes, TypeScript signatures, and
> i18n keys. Nothing in here may drift between backend and frontend without a
> new approval. Mutation endpoints follow the **mutation contract**: return the
> fully-populated object, never a bare row or `{ message }`.

---

## 0. Shared types

### `UserSummary` (backend, reused everywhere a user is referenced)
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "full_name": "Abdullah Alholaiel",
  "handle": "abdullah",
  "avatar_url": "https://cdn.koralink.sa/avatars/ab.png",
  "preferred_position": "Midfielder",
  "skill_level": "Advanced"
}
```
Matches the existing `searchUsers()`/`getPublicProfile()` selection.

---

## 1. Track A — Location services

### 1.1 Schema (migration `0007_user_location.sql`)
```sql
ALTER TABLE users ADD COLUMN home_lat double precision;
ALTER TABLE users ADD COLUMN home_lng double precision;
```

### 1.2 `PATCH /users/me` — extend `UpdateProfileDto`
Add (optional, `@Type(() => Number) @IsNumber()`, `@Min(-90) @Max(90)` for lat, `@Min(-180) @Max(180)` for lng):
```ts
home_lat?: number;
home_lng?: number;
```

### 1.3 `GET /users/me` — response gains two fields
```json
{
  "id": "550e8400-...",
  "phone": "+966500000001",
  "full_name": "Abdullah Alholaiel",
  "handle": "abdullah",
  "avatar_url": "https://...",
  "preferred_location": "Riyadh",
  "preferred_position": "Midfielder",
  "skill_level": "Advanced",
  "role": "Player",
  "wallet_balance": "250.00",
  "karma_score": 12,
  "no_show_count": 0,
  "pom_count": 3,
  "home_lat": 24.7136,
  "home_lng": 46.6753,
  "created_at": "2026-08-01T10:00:00.000Z"
}
```

### 1.4 `GET /matches` / `GET /venues` (unchanged shape, documented)
Both already return `distance_m: number | null` (metres) when `lat`+`lng` are
supplied, and sort `distance_m ASC` when coords present. `GET /matches` when
`date` is absent returns **all upcoming matches** (`status IN ('Open','Full','InProgress')
AND scheduled_at + duration >= NOW()`), ordered `scheduled_at ASC`.

**Radius default change:** `radius_km` default `10` → `50` in both
`GetMatchesDto` and `GetVenuesDto` (documentation + service default). No coords
→ no geo filter (returns all), unchanged.

### 1.5 Frontend — `useGeolocation` hook signature
```ts
type GeoStatus = 'idle' | 'prompting' | 'granted' | 'denied' | 'unsupported' | 'error';

interface GeolocationState {
  coords: { lat: number; lng: number } | null;
  status: GeoStatus;
  error: string | null;
  request: () => void;         // trigger getCurrentPosition (permission prompt)
  refresh: () => void;         // re-request a fix
}

export function useGeolocation(): GeolocationState;
```
- Caches last fix in `localStorage` key `koralink_last_location` (survives reload).
- `status === 'unsupported'` when `!('geolocation' in navigator)` (HTTP context).
- Never throws on denial; falls back to cached coords if present.

### 1.6 `LocationProvider` context
```ts
interface LocationContextValue {
  coords: { lat: number; lng: number } | null;
  status: GeoStatus;
  request: () => void;
}
```
Consumer: `useLocation()`.

### 1.7 `useMatches` — extended filters
```ts
export function useMatches(filters?: {
  date?: string | null;
  lat?: number | null;
  lng?: number | null;
  radiusKm?: number | null;
  format?: string | null;
  gender?: string | null;
  maxPrice?: number | null;
  venue_id?: string | null;
}): UseQueryResult<{ matches: Match[]; total?: number; hasMore?: boolean }>;
```
Query params: `lat`, `lng`, `radius_km`.

### 1.8 Adapter change — `Match.distanceM`
- Add to `types/index.ts` `Match`: `distanceM?: number | null;`
- `adaptNearbyMatch` maps `distance_m → distanceM`. `MatchCard` renders a badge
  via `formatDistance(distanceM)` when non-null.

### 1.9 `formatDistance` helper
```ts
export function formatDistance(meters: number | null | undefined, locale: 'ar' | 'en'): string | null;
// 850   → "850 m"  / "٨٥٠ م"
// 3200  → "3.2 km" / "٣٫٢ كم"
// null  → null
```

---

## 2. Track B — Play screen rich first-look

### 2.1 `formatDateSection` helper
```ts
export function formatDateSection(date: Date, locale: 'ar' | 'en'): string;
// en: "Friday, 15 August 2026"
// ar: "الجمعة، ١٥ أغسطس ٢٠٢٦"
// Implementation: new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA' : 'en-GB',
//   { weekday:'long', day:'numeric', month:'long', year:'numeric' }).format(date)
```

### 2.2 `MatchDateSections` component
```ts
interface MatchDateSectionsProps {
  matches: Match[];
  currentUserId?: string;
  locale: 'ar' | 'en';
}
```
- Buckets `matches` by local calendar day of `scheduledAt`.
- Bucket order: chronological ascending (soonest first).
- Within a bucket: sort by `distanceM` ascending when all/most rows have it,
  else preserve chronological order.
- Renders a section header (`formatDateSection`) then `MatchCard[]`.

### 2.3 `play/page.tsx` state contract
```ts
const [selectedDate, setSelectedDate] = useState<string | null>(null); // null = ALL games

<DatePicker
  fireOnMount={false}                 // do NOT auto-select today
  selectedDate={selectedDate ? new Date(selectedDate) : undefined}
  onDateSelect={(d) => {
    const iso = d.toISOString().split('T')[0];
    setSelectedDate((prev) => (prev === iso ? null : iso)); // toggle-clear
  }}
/>
```
`useMatches({ date: selectedDate, lat, lng })` — `null` date = all games.

---

## 3. Track C — Follow + direct messaging

### 3.1 Schema (migration `0008_follows_and_read.sql`)
```sql
CREATE TABLE follows (
  id varchar(36) PRIMARY KEY,
  follower_id varchar(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id varchar(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX follows_follower_following_idx ON follows(follower_id, following_id);
CREATE INDEX follows_following_idx ON follows(following_id);

ALTER TABLE conversation_participants ADD COLUMN last_read_at timestamptz;
```

### 3.2 Follow endpoints

**`POST /users/:id/follow`** (auth) → `201`
```json
{ "following": true, "followersCount": 5, "followingCount": 12 }
```

**`DELETE /users/:id/follow`** (auth) → `200`
```json
{ "following": false, "followersCount": 4, "followingCount": 12 }
```

**`GET /users/me/followers`** → `200`
```json
{ "users": [ UserSummary, ... ], "total": 5 }
```

**`GET /users/me/following`** → `200`
```json
{ "users": [ UserSummary, ... ], "total": 12 }
```

**`GET /users/:id` (public) — enriched**
```json
{
  "id": "550e8400-...",
  "full_name": "Abdullah Alholaiel",
  "handle": "abdullah",
  "avatar_url": "https://...",
  "preferred_position": "Midfielder",
  "skill_level": "Advanced",
  "pom_count": 3,
  "games_played": 18,
  "isFollowing": false,
  "followersCount": 5,
  "followingCount": 12
}
```

Service signatures:
```ts
// follows.service.ts
async follow(currentUserId: string, targetUserId: string):
  Promise<{ following: boolean; followersCount: number; followingCount: number }>;
async unfollow(currentUserId: string, targetUserId: string):
  Promise<{ following: boolean; followersCount: number; followingCount: number }>;
async getFollowers(userId: string): Promise<{ users: UserSummary[]; total: number }>;
async getFollowing(userId: string): Promise<{ users: UserSummary[]; total: number }>;
async isFollowing(followerId: string, followingId: string): Promise<boolean>;
```

### 3.3 Conversation endpoints

**`POST /conversations`** body `{ "userId": "target-uuid" }` → find-or-create 1:1 → `201`
```json
{
  "id": "conv-uuid",
  "participants": [
    { "id": "user-a", "full_name": "Abdullah", "handle": "abdullah", "avatar_url": "https://..." },
    { "id": "user-b", "full_name": "Fahad", "handle": "fahad", "avatar_url": "https://..." }
  ],
  "created_at": "2026-08-14T12:00:00.000Z"
}
```

**`GET /conversations`** → `200`
```json
{
  "conversations": [
    {
      "id": "conv-uuid",
      "otherParticipant": { "id": "user-b", "full_name": "Fahad", "handle": "fahad", "avatar_url": "https://..." },
      "lastMessage": "See you at the pitch!",
      "lastMessageAt": "2026-08-14T12:05:00.000Z",
      "lastMessageSenderId": "user-b",
      "unreadCount": 2
    }
  ],
  "total": 1,
  "hasMore": false
}
```

**`GET /conversations/:id/messages?page=1&perPage=30`** → `200`
```json
{
  "messages": [
    {
      "id": "msg-uuid",
      "conversation_id": "conv-uuid",
      "sender": { "id": "user-b", "full_name": "Fahad", "handle": "fahad", "avatar_url": "https://..." },
      "content": "See you at the pitch!",
      "created_at": "2026-08-14T12:05:00.000Z"
    }
  ],
  "total": 1,
  "hasMore": false
}
```

**`POST /conversations/:id/messages`** body `{ "content": "..." }` → `201` (returns full message)
```json
{
  "id": "msg-uuid",
  "conversation_id": "conv-uuid",
  "sender": { "id": "user-a", "full_name": "Abdullah", "handle": "abdullah", "avatar_url": "https://..." },
  "content": "See you at the pitch!",
  "created_at": "2026-08-14T12:05:00.000Z"
}
```

Service signatures:
```ts
// conversations.service.ts
async findOrCreateDirect(userId: string, targetUserId: string): Promise<Conversation>;
async listForUser(userId: string): Promise<{ conversations: ConversationSummary[]; total: number; hasMore: boolean }>;
async listMessages(userId: string, conversationId: string, page: number, perPage: number):
  Promise<{ messages: PersonalMessage[]; total: number; hasMore: boolean }>;
async sendMessage(userId: string, conversationId: string, content: string): Promise<PersonalMessage>;
async markRead(userId: string, conversationId: string): Promise<void>;
```

### 3.4 WebSocket (extend `app.gateway.ts`)
- `@SubscribeMessage('join-conversation')` `{ conversationId }` → verify participant → `client.join('conv:'+id)` → `markRead`.
- `@SubscribeMessage('send-dm')` `{ conversationId, content }` → insert `personal_messages` → emit `new-dm` (full message + sender) to `conv:<id>`.
- `@SubscribeMessage('leave-conversation')` `{ conversationId }` → `client.leave(...)`.
- Emit `dm-notification` to the recipient's presence room (best-effort).

### 3.5 Frontend hooks
```ts
export function useFollow(targetUserId: string): {
  isFollowing: boolean; followersCount: number; followingCount: number;
  follow: () => void; unfollow: () => void; isLoading: boolean;
};
export function useFollowers(): { users: UserSummary[]; isLoading: boolean };
export function useFollowing(): { users: UserSummary[]; isLoading: boolean };
export function useConversations(): { conversations: ConversationSummary[]; isLoading: boolean; error; refetch };
export function useConversationMessages(conversationId: string): {
  messages: PersonalMessage[]; isLoading: boolean; error; refetch;
  isConnected: boolean; sendMessage: (content: string) => void;
};
```

### 3.6 Adapters
```ts
// lib/api-adapter.ts (or lib/conversation-adapter.ts)
export function adaptConversationList(raw: ConversationsApiResponse): ConversationSummary[];
export function adaptPersonalMessage(raw: PersonalMessageApi): PersonalMessage;
```
`Discussion` type already supports `type: 'personal'` and `unreadCount` — the
messages tab merges `useConversations` (personal) with `useDiscussions` (match).

### 3.7 `FollowButton` component
```ts
interface FollowButtonProps {
  targetUserId: string;
  isFollowing: boolean;
  onToggle: () => void;
  size?: 'sm' | 'md';
}
```
States: Follow (filled brand-green) / Following (outline) / Unfollow (destructive
confirm). ≥44pt hit target.

---

## 4. Track D — Activity feed + notification triggers

### 4.1 Schema (migration `0009_activities.sql`)
```sql
CREATE TYPE ActivityVerb AS ENUM ('created_match','joined_match','followed','messaged','pom_decided');

CREATE TABLE activities (
  id varchar(36) PRIMARY KEY,
  actor_id varchar(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  verb ActivityVerb NOT NULL,
  match_id varchar(36) REFERENCES matches(id) ON DELETE CASCADE,
  subject_id varchar(36),          -- generic object ref (followee, msg sender, POTM winner)
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activities_created_idx ON activities(created_at DESC);

CREATE TABLE feed_items (
  id varchar(36) PRIMARY KEY,
  recipient_id varchar(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_id varchar(36) NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX feed_items_recipient_created_idx ON feed_items(recipient_id, created_at DESC);
```

### 4.2 Activity recording helper (single choke point)
```ts
// activities.service.ts
async record(params: {
  actorId: string;
  verb: ActivityVerb;
  matchId?: string;
  subjectId?: string;
  recipients: string[];   // fan-out set (deduped, actor excluded)
}): Promise<void>;
```

Trigger hooks (called inside the owning service's transaction):
| Hook | verb | recipients |
|------|------|------------|
| `matches.createMatch` | `created_match` | host's followers |
| `matches.joinMatch` | `joined_match` | other participants + host |
| `follows.follow` | `followed` | the followee |
| `conversations.sendMessage` | `messaged` | other conversation participant |
| POM winner determination | `pom_decided` | match participants |

### 4.3 Feed endpoints

**`GET /users/me/feed?page=1&perPage=20`** → `200`
```json
{
  "items": [
    {
      "id": "feed-item-uuid",
      "verb": "joined_match",
      "actor": { "id": "user-b", "full_name": "Fahad", "handle": "fahad", "avatar_url": "https://..." },
      "match": { "id": "match-uuid", "title": "Friday Night 7v7", "venue_name": "Riyadh Arena", "scheduled_at": "2026-08-15T19:00:00.000Z" },
      "subject_user": null,
      "is_read": false,
      "created_at": "2026-08-14T12:10:00.000Z"
    }
  ],
  "total": 42,
  "hasMore": true
}
```

**`GET /users/me/notifications`** — same `FeedItem[]` shape, filtered to
directed events (`followed`, `messaged`, `pom_decided`, `joined_match` on my match).

**`POST /users/me/notifications/read`** body `{ "ids": ["feed-item-uuid"] }` (or
`{ "all": true }`) → `200 { "updated": 1 }`.

### 4.4 Relevance score (internal only — never labelled)
```
score = recency + social + distance
recency = 3.0 * exp(-age_hours / 24)                       // half-life ~17h
social  = 3.0 if directed at me (followed/messaged/pom/joined-my-match)
        = 2.0 if actor is someone I follow
        = 1.0 otherwise
distance = (coords && match.location) ? 1.5 * exp(-distance_km / 20) : 0
```
`ORDER BY score DESC, created_at DESC`. `score` is **not** returned to the client.

### 4.5 Frontend hooks + adapter
```ts
export function useFeed(page?: number): {
  items: FeedItem[]; total?: number; hasMore?: boolean;
  isLoading: boolean; error; fetchNextPage: () => void;
};
export function useNotifications(): { items: FeedItem[]; total?: number; markRead: (ids: string[]) => void };
export function adaptFeedItem(raw: FeedItemApi): FeedItem;
```

`FeedItem` (domain):
```ts
interface FeedItem {
  id: string;
  verb: 'created_match' | 'joined_match' | 'followed' | 'messaged' | 'pom_decided';
  actor: { id: string; name: string; avatarUrl: string | null };
  match: { id: string; title: string; venueName: string; scheduledAt: string } | null;
  subjectUserId: string | null;
  isRead: boolean;
  createdAt: string;
}
```

### 4.6 `ActivityCard` component
```ts
interface ActivityCardProps { item: FeedItem; locale: 'ar' | 'en'; }
```
Deep-link map: `created_match`/`joined_match`/`pom_decided` → `/match/:id`;
`followed`/`messaged` → `/profile` or `/messages/:id`.

---

## 5. i18n key contract (both locales — full additions)

### `en.json`
```json
{
  "location": {
    "permissionTitle": "Enable your location",
    "permissionBody": "See games and clubs near you, sorted by distance.",
    "enable": "Enable",
    "later": "Not now",
    "denied": "Location is off. Enable it to see distance.",
    "settings": "Open settings"
  },
  "distance": { "km": "{distance} km", "m": "{distance} m" },
  "play": {
    "allGames": "All Games"
  },
  "follow": {
    "follow": "Follow",
    "following": "Following",
    "unfollow": "Unfollow",
    "followers": "Followers",
    "followingList": "Following",
    "noFollowers": "No followers yet"
  },
  "messages": {
    "dm": {
      "directMessages": "Direct Messages",
      "newMessage": "New message",
      "typeMessage": "Type a message…",
      "noConversations": "No conversations yet",
      "unread": "{count} new"
    }
  },
  "feed": {
    "createdMatch": "{name} hosted a match",
    "joinedMatch": "{name} joined a match",
    "followedYou": "{name} started following you",
    "messagedYou": "{name} sent you a message",
    "pomDecided": "{name} won Player of the Match",
    "empty": "No activity yet"
  },
  "notifications": {
    "title": "Notifications",
    "empty": "No notifications",
    "markAllRead": "Mark all read"
  }
}
```

### `ar.json`
```json
{
  "location": {
    "permissionTitle": "فعّل موقعك",
    "permissionBody": "شاهد المباريات والنوادي القريبة منك مرتبة حسب المسافة.",
    "enable": "تفعيل",
    "later": "ليس الآن",
    "denied": "الموقع معطّل. فعّله لعرض المسافة.",
    "settings": "فتح الإعدادات"
  },
  "distance": { "km": "{distance} كم", "m": "{distance} م" },
  "play": {
    "allGames": "كل المباريات"
  },
  "follow": {
    "follow": "متابعة",
    "following": "يتابع",
    "unfollow": "إلغاء المتابعة",
    "followers": "المتابعون",
    "followingList": "يتابع",
    "noFollowers": "لا يوجد متابعون بعد"
  },
  "messages": {
    "dm": {
      "directMessages": "الرسائل المباشرة",
      "newMessage": "رسالة جديدة",
      "typeMessage": "اكتب رسالة…",
      "noConversations": "لا توجد محادثات بعد",
      "unread": "{count} جديد"
    }
  },
  "feed": {
    "createdMatch": "أنشأ {name} مباراة",
    "joinedMatch": "انضم {name} إلى مباراة",
    "followedYou": "بدأ {name} بمتابعتك",
    "messagedYou": "أرسل لك {name} رسالة",
    "pomDecided": "فاز {name} بجائزة أفضل لاعب",
    "empty": "لا يوجد نشاط بعد"
  },
  "notifications": {
    "title": "الإشعارات",
    "empty": "لا توجد إشعارات",
    "markAllRead": "تحديد الكل كمقروء"
  }
}
```

> i18n invariant: 4-space indentation, `ensure_ascii=False` (literal Arabic),
> trailing newline, minimal diff (never `json.dump(indent=2)`).

---

## 6. Contract verification checklist (run at Gate 3 → 4)

Copy `references/contract-verification-checklist.md` from the software-factory
skill and tick each item per slice:
- [ ] Every mutation returns a fully-populated object (follow toggle, send message, DM)
- [ ] `Match.distanceM` maps from `distance_m` with no silent `undefined`
- [ ] `PublicProfileApi` gains `isFollowing`/`followersCount`/`followingCount` and the adapter consumes them
- [ ] Feed item adapter covers all 5 verbs
- [ ] Every i18n key exists in **both** `ar.json` and `en.json` (4-space, literal Arabic)
- [ ] Zod/DTO alignment: `UpdateProfileDto.home_lat/home_lng` ↔ hook input; `POST /conversations {userId}` ↔ hook body; `POST /conversations/:id/messages {content}` ↔ hook body
- [ ] WS `send-dm` returns the full message + sender (mutation contract)
