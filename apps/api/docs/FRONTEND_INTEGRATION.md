# KoraLink API — Frontend Integration Guide

Everything a frontend developer needs to consume the KoraLink backend: base URL conventions, the cookie-based auth flow, every implemented REST endpoint, WebSocket events, error handling, and a quick-start checklist.

---

## Table of Contents

1. [Base URL & Global Conventions](#1-base-url--global-conventions)
2. [Authentication — HttpOnly Cookie Flow](#2-authentication--httponly-cookie-flow)
   - [Step 1 — Send OTP](#step-1--send-otp)
   - [Step 2 — Verify OTP](#step-2--verify-otp)
   - [Step 3 — Complete Profile (first login only)](#step-3--complete-profile-first-login-only)
   - [Logout](#logout)
3. [Match Discovery Feed](#3-match-discovery-feed)
4. [Match Detail](#4-match-detail)
5. [Wallet](#5-wallet)
6. [Health Check](#6-health-check)
7. [Real-Time Lobby — WebSocket (Socket.IO)](#7-real-time-lobby--websocket-socketio)
   - [Connecting](#connecting)
   - [Emitting Events](#emitting-events)
   - [Listening for Events](#listening-for-events)
8. [Error Response Reference](#8-error-response-reference)
9. [CORS & Credentials](#9-cors--credentials)
10. [Interactive API Explorer (Swagger)](#10-interactive-api-explorer-swagger)
11. [Quick-Start Checklist](#11-quick-start-checklist)

---

## 1. Base URL & Global Conventions

| Environment | Base URL                       |
|-------------|-------------------------------|
| Local dev   | `http://localhost:3001/api/v1` |
| Production  | `https://api.koralink.sa/api/v1` |

- All REST endpoints are prefixed with `/api/v1`.
- Request and response bodies are `application/json`.
- **All authenticated requests require `credentials: 'include'`** (or the Axios equivalent `withCredentials: true`) so the browser sends the `access_token` HttpOnly cookie automatically.
- Dates are ISO 8601 strings (`"2025-08-15T18:30:00.000Z"`).
- Phone numbers must be in E.164 format for Saudi numbers: `+966XXXXXXXXX`.

---

## 2. Authentication — HttpOnly Cookie Flow

KoraLink uses **phone-number OTP** for login, not passwords. The JWT is issued **exclusively as an `HttpOnly` cookie** — it is never returned in the response body. This protects the token from XSS attacks.

### Step 1 — Send OTP

```
POST /api/v1/auth/send-otp
```

**Request body**

```json
{
  "phone": "+966501234567"
}
```

| Field   | Type   | Required | Description                  |
|---------|--------|----------|------------------------------|
| `phone` | string | ✅       | Saudi phone in E.164 format  |

**Success response — `200 OK`**

```json
{
  "message": "OTP sent."
}
```

An SMS containing a 6-digit code is dispatched via Unifonic. The code expires in **5 minutes**.

**Errors**

| Status | Reason                         |
|--------|-------------------------------|
| `400`  | `phone` is not a valid Saudi number |

---

### Step 2 — Verify OTP

```
POST /api/v1/auth/verify-otp
```

**Request body**

```json
{
  "phone": "+966501234567",
  "code": "482910"
}
```

| Field   | Type   | Required | Description                   |
|---------|--------|----------|-------------------------------|
| `phone` | string | ✅       | Same number used in Step 1    |
| `code`  | string | ✅       | Exactly 6 digits              |

**Success response — `200 OK`**

```json
{
  "isNewUser": true
}
```

The server sets the `access_token` HttpOnly cookie on the response. **No token appears in the JSON body.**

Use `isNewUser` to decide whether to redirect the user to the **Complete Profile** screen.

**Cookie properties**

| Property   | Value (production) | Value (development) |
|------------|--------------------|---------------------|
| `HttpOnly` | `true`             | `true`              |
| `Secure`   | `true`             | `false`             |
| `SameSite` | `Strict`           | `Lax`               |
| `Path`     | `/`                | `/`                 |
| `MaxAge`   | 7 days             | 7 days              |

**Errors**

| Status | Reason                              |
|--------|-------------------------------------|
| `401`  | Invalid or expired OTP              |
| `404`  | Phone number not found in database  |

---

### Step 3 — Complete Profile (first login only)

Required if `isNewUser === true`. All subsequent logins skip this step.

```
PATCH /api/v1/auth/complete-profile
```

> 🔒 **Requires authentication cookie.**

**Request body**

```json
{
  "full_name": "Abdullah Al-Harbi",
  "handle": "abdu_striker",
  "skill_level": "Intermediate",
  "preferred_location": "Riyadh",
  "preferred_position": "Striker"
}
```

| Field                | Type   | Required | Values / Constraints                         |
|----------------------|--------|----------|----------------------------------------------|
| `full_name`          | string | ✅       | Min 2 chars                                  |
| `handle`             | string | ✅       | Min 3 chars, unique across all users         |
| `skill_level`        | string | ❌       | `"Beginner"` \| `"Intermediate"` \| `"Advanced"` |
| `preferred_location` | string | ❌       | Free text city/district                      |
| `preferred_position` | string | ❌       | e.g. `"Striker"`, `"Goalkeeper"`             |

**Success response — `200 OK`**

```json
{
  "id": "a1b2c3d4-...",
  "phone": "+966501234567",
  "full_name": "Abdullah Al-Harbi",
  "handle": "abdu_striker",
  "avatar_url": null,
  "skill_level": "Intermediate",
  "preferred_location": "Riyadh",
  "preferred_position": "Striker",
  "role": "Player"
}
```

**Errors**

| Status | Reason                              |
|--------|-------------------------------------|
| `400`  | Handle already taken                |
| `401`  | Missing or invalid session cookie   |

---

### Logout

The backend does not yet expose a dedicated logout endpoint. To log out, **clear the `access_token` cookie on the client side**:

```js
// Next.js / browser
document.cookie = 'access_token=; Max-Age=0; path=/';
```

Or call a `/api/v1/auth/logout` route when it is added (which will call `res.clearCookie('access_token')`).

---

## 3. Match Discovery Feed

```
GET /api/v1/matches
```

> 🔒 **Requires authentication cookie.**
>
> ⚡ **Cached in Redis for 60 seconds.** The same query parameters map to the same cache key.

Returns the next 50 open matches ordered by scheduled time. Optionally filtered by proximity and date.

**Query parameters**

| Parameter  | Type   | Required | Default | Description                                |
|------------|--------|----------|---------|--------------------------------------------|
| `lat`      | number | ❌       | —       | Player latitude (WGS-84, −90 to 90)        |
| `lng`      | number | ❌       | —       | Player longitude (WGS-84, −180 to 180)     |
| `radius_km`| number | ❌       | `10`    | Search radius in km (1–100)                |
| `date`     | string | ❌       | —       | Filter by date, format `YYYY-MM-DD`        |

> `lat` and `lng` must be supplied together or not at all. Sending only one returns `400`.

**Example request**

```
GET /api/v1/matches?lat=24.7136&lng=46.6753&radius_km=5&date=2025-08-15
```

**Success response — `200 OK`**

```json
[
  {
    "id": "m1b2c3d4-...",
    "title": "Evening 5v5 in Olaya",
    "match_type": "Casual",
    "gender_rule": "Mixed",
    "status": "Open",
    "scheduled_at": "2025-08-15T18:30:00.000Z",
    "duration_mins": 60,
    "price_per_player": 45.00,
    "max_players": 10,
    "spots_filled": 4,
    "distance_m": 820.5,
    "host_id": "u1...",
    "host_name": "Abdullah Al-Harbi",
    "host_avatar": "https://cdn.example.com/avatar.jpg",
    "pitch_id": "p1...",
    "pitch_name": "Pitch A",
    "venue_name": "Star Sports Complex",
    "venue_city": "Riyadh"
  }
]
```

**Field reference**

| Field             | Type    | Description                                                         |
|-------------------|---------|---------------------------------------------------------------------|
| `id`              | string  | Match UUID                                                          |
| `title`           | string  | Human-readable match name                                           |
| `match_type`      | string  | `"Casual"` \| `"Competitive"`                                       |
| `gender_rule`     | string  | `"Men Only"` \| `"Women Only"` \| `"Mixed"`                         |
| `status`          | string  | Always `"Open"` in discovery feed                                   |
| `scheduled_at`    | string  | ISO 8601 UTC timestamp                                              |
| `duration_mins`   | number  | Match length in minutes                                             |
| `price_per_player`| number  | SAR amount the player pays                                          |
| `max_players`     | number  | Maximum roster size                                                 |
| `spots_filled`    | number  | Players who have already joined                                     |
| `distance_m`      | number \| null | Great-circle distance in metres from the query point. `null` when no coordinates supplied |
| `host_*`          | —       | Flattened host user fields                                          |
| `pitch_*`         | —       | Flattened pitch fields                                              |
| `venue_*`         | —       | Flattened venue city / name                                         |

---

## 4. Match Detail

```
GET /api/v1/matches/:id
```

> 🔒 **Requires authentication cookie.**

Returns the full match object including the pitch, venue, host profile, and the live roster.

**Path parameter**

| Parameter | Description     |
|-----------|-----------------|
| `id`      | Match UUID      |

**Success response — `200 OK`**

```json
{
  "id": "m1b2c3d4-...",
  "title": "Evening 5v5 in Olaya",
  "match_type": "Casual",
  "gender_rule": "Mixed",
  "status": "Open",
  "scheduled_at": "2025-08-15T18:30:00.000Z",
  "duration_mins": 60,
  "price_per_player": "45.00",
  "max_players": 10,
  "created_at": "2025-08-01T10:00:00.000Z",
  "updated_at": "2025-08-01T10:00:00.000Z",
  "host": {
    "id": "u1...",
    "full_name": "Abdullah Al-Harbi",
    "handle": "abdu_striker",
    "avatar_url": null,
    "rating": 4.7,
    "karma_score": 120
  },
  "pitch": {
    "id": "p1...",
    "name": "Pitch A",
    "size": "5v5",
    "surface_type": "Artificial",
    "environment": "Outdoor",
    "hourly_rate": "200.00",
    "venue": {
      "name": "Star Sports Complex",
      "city": "Riyadh",
      "address": "King Fahd Road, Olaya District",
      "amenities": ["Parking", "Changing Rooms", "Café"]
    }
  },
  "players": [
    {
      "id": "mp1...",
      "team": "Home",
      "is_host": true,
      "no_show": false,
      "user": {
        "id": "u1...",
        "full_name": "Abdullah Al-Harbi",
        "handle": "abdu_striker",
        "avatar_url": null,
        "rating": 4.7
      }
    }
  ]
}
```

**Errors**

| Status | Reason                      |
|--------|-----------------------------|
| `401`  | Missing or invalid cookie   |
| `404`  | Match not found             |

---

## 5. Wallet

> **Not yet implemented.** The wallet ledger exists in `WalletService` and is used internally, but no REST endpoints are exposed yet.

The wallet ledger is used internally when a player joins a match (debit) or receives a refund (credit).

**Planned endpoints** (not yet implemented):

| Method | Path                         | Description                        |
|--------|------------------------------|------------------------------------|
| `GET`  | `/api/v1/wallet/balance`     | Get authenticated user's balance   |
| `GET`  | `/api/v1/wallet/history`     | Paginated transaction history      |
| `POST` | `/api/v1/wallet/topup`       | Add funds (Moyasar payment gateway)|

---

## 6. Health Check

```
GET /api/v1/health
```

No authentication required. Used by Docker and load balancer liveness probes.

**Response — `200 OK`**

```json
{
  "status": "ok",
  "timestamp": "2025-08-15T18:00:00.000Z"
}
```

---

## 7. Real-Time Lobby — WebSocket (Socket.IO)

The backend exposes a Socket.IO server on the `/lobby` namespace. Players use it to join a match room and exchange chat messages in real time.

### Connecting

```js
import { io } from 'socket.io-client';

const socket = io('http://localhost:3001/lobby', {
  withCredentials: true,          // sends the access_token HttpOnly cookie
  // OR pass the token explicitly when the cookie is unavailable (e.g. React Native):
  auth: { token: '<jwt_string>' },
});
```

> The server validates the JWT on every new connection. Invalid tokens or unrecognised origins cause an immediate disconnect.

---

### Emitting Events

#### `join-lobby`

Join the Socket.IO room for a specific match. Must be emitted before sending messages. The server verifies the user is a registered match player.

```js
socket.emit('join-lobby', { matchId: 'm1b2c3d4-...' });
```

| Field     | Type   | Required | Description       |
|-----------|--------|----------|-------------------|
| `matchId` | string | ✅       | UUID of the match |

**Error**: If the user is not in `match_players` for that match, the server throws `WsException('You are not a member of this match.')`.

---

#### `send-message`

Send a chat message to all players in the lobby. Must have joined with `join-lobby` first.

```js
socket.emit('send-message', {
  matchId: 'm1b2c3d4-...',
  content: 'Anyone want to switch to Away team?',
});
```

| Field     | Type   | Required | Description                 |
|-----------|--------|----------|-----------------------------|
| `matchId` | string | ✅       | UUID of the match            |
| `content` | string | ✅       | Non-empty message text       |

The message is persisted in `match_messages` and broadcast to everyone in the room.

---

### Listening for Events

#### `user-joined`

Emitted to all existing room members when a new player joins the lobby.

```js
socket.on('user-joined', ({ userId }) => {
  console.log(`${userId} joined the lobby`);
});
```

| Field    | Type   | Description             |
|----------|--------|-------------------------|
| `userId` | string | UUID of the joining user |

---

#### `new-message`

Emitted to every socket in the room when a chat message is sent.

```js
socket.on('new-message', (message) => {
  console.log(message.content, 'from', message.user.handle);
});
```

**Payload**

```json
{
  "id": "msg1...",
  "match_id": "m1b2c3d4-...",
  "user_id": "u1...",
  "content": "Anyone want to switch to Away team?",
  "created_at": "2025-08-15T18:35:00.000Z",
  "user": {
    "id": "u1...",
    "full_name": "Abdullah Al-Harbi",
    "handle": "abdu_striker",
    "avatar_url": null
  }
}
```

---

#### `roster-update`

Emitted by the server when the match roster changes (e.g. a player joins or leaves). The exact shape is match-context-specific and will be documented when the Join/Leave endpoints are added.

```js
socket.on('roster-update', (payload) => {
  // Re-fetch match detail or merge delta into local state
});
```

---

## 8. Error Response Reference

All errors follow the standard NestJS exception format:

```json
{
  "statusCode": 400,
  "message": "Handle already taken.",
  "error": "Bad Request"
}
```

For validation errors the `message` field is an array:

```json
{
  "statusCode": 400,
  "message": [
    "phone must be a valid phone number",
    "code must be longer than or equal to 6 characters"
  ],
  "error": "Bad Request"
}
```

**Common status codes**

| Code | Meaning                                       |
|------|-----------------------------------------------|
| `200`| Success (most routes)                         |
| `400`| Validation error or business rule violation   |
| `401`| Missing, expired, or invalid session cookie   |
| `404`| Requested resource does not exist             |
| `409`| Conflict — e.g. duplicate idempotency key     |
| `429`| Rate limit exceeded (60 requests / 60 s)      |
| `500`| Unexpected server error                       |

---

## 9. CORS & Credentials

The API only accepts requests from the two registered frontend origins:

| Variable     | Default                   |
|--------------|---------------------------|
| `PLAYER_URL` | `http://localhost:3000`   |
| `ADMIN_URL`  | `http://localhost:3002`   |

Any request from a different origin will be rejected by the CORS preflight. In production these values are overridden by environment variables on the server.

**Required fetch / Axios settings for every authenticated call:**

```js
// fetch
fetch('/api/v1/matches', { credentials: 'include' });

// Axios (set once globally)
axios.defaults.withCredentials = true;
```

---

## 10. Interactive API Explorer (Swagger)

When the server is running locally, the full OpenAPI spec is available at:

```
http://localhost:3001/api/docs
```

Click **Authorize** → enter any valid session cookie to test authenticated routes directly from the browser.

---

## 11. Quick-Start Checklist

- [ ] Set `credentials: 'include'` (fetch) or `withCredentials: true` (Axios) globally.
- [ ] Call `POST /auth/send-otp` → `POST /auth/verify-otp` to obtain the session cookie.
- [ ] If `isNewUser === true`, redirect to the profile completion screen and call `PATCH /auth/complete-profile`.
- [ ] For match discovery pass `lat`/`lng`/`radius_km` from the device GPS.
- [ ] For the lobby screen, connect Socket.IO with `withCredentials: true` to the `/lobby` namespace.
- [ ] Emit `join-lobby` before attempting `send-message`.
- [ ] Listen for `roster-update` to keep the roster UI in sync without manual polling.
- [ ] Handle `429` responses gracefully — back off and retry after 1 minute.
