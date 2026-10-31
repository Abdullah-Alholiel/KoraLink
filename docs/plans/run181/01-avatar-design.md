# Run #181 — Avatar Upload Slice (P2-50) — Program Design

## Contract (Gate 3, exact shapes)

### `POST /users/me/avatar` (auth; `@Throttle 5/min`)
- Feature flag: `AVATAR_UPLOAD_ENABLED !== 'true'` → **403** `{ "message": "Avatar upload is not enabled.", "error": "Forbidden", "statusCode": 403 }`
  (explicit-flag pattern per P0-2/P0-7 — NEVER a NODE_ENV string gate).
- multipart field `file`; missing/empty → **400** `"No file uploaded (multipart field \"file\")."`
- `> MAX_AVATAR_BYTES` (2 MB) → **400** `"Avatar exceeds the 2 MB limit."` (multer aborts pre-buffer)
- non-image bytes (magic-sniff fail) → **400** `"Only JPEG, PNG or WebP images are accepted."`
- avatars bucket unconfigured (S3_BUCKET_AVATARS empty) → **503** `"Avatar storage is not configured."`
- other storage failure → **502** `"Image storage is unavailable — try again shortly."` + Sentry
- **201** → `{ "avatarUrl": "/media/avatars/<userId>/<sha256hex>.<jpg|png|webp>" }`

### `GET /media/avatars/*` (public; `@Throttle 60/min`)
- 200: bytes + sniffed Content-Type + `Cache-Control: public, max-age=31536000, immutable` + nosniff
- 404: `{ "message": "Image not found." }` — unknown key, foreign-bucket path, storage outage (mapped), bad encoding/path → 400 variants mirroring venues serve

### TS signatures
```ts
// storage.service.ts
async putAvatar(userId: string, buf: Buffer, declaredMime?: string): Promise<StoredObject>
async getAvatar(key: string): Promise<{ body: Buffer; contentType: string; length: number } | null>
async deleteAvatar(path: string): Promise<void>
isManagedAvatarPath(path: string): boolean
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

// media.service.ts
async uploadAvatar(userId: string, file: { buffer: Buffer; size: number; mimetype?: string }):
  Promise<{ avatarUrl: string }>
async serveAvatar(key: string): Promise<{ body: Buffer; contentType: string } | null>

// users.service.ts
async uploadAvatar(userId: string, file: { buffer: Buffer; size: number; mimetype?: string }):
  Promise<{ avatarUrl: string }>
```

### users.service.uploadAvatar flow
`size check` → `storage.putAvatar` → guarded `UPDATE users SET avatar_url = path, updated_at WHERE id`
(returning avatar_url; 0 rows → 404) → best-effort `deleteAvatar(previous)` when previous was a
managed `/media/avatars/<same-user>/` path (never deletes cross-user objects; best-effort = orphan
risk only, never a failure) → `{ avatarUrl }`. Write is last (no orphan-on-user-vanish case: the
caller is the authenticated user).

### PWA
- `fetcher`: when `options.body instanceof FormData`, delete the JSON Content-Type (browser sets
  the multipart boundary); token/origin gate unchanged.
- profile page identity row: camera/edit pill wraps a hidden `<input type=file accept="image/*">`;
  change → uploadAvatar hook → success: store.updateUser(avatarUrl) + toast `profile.avatarUpdated`;
  failures map FetchError status → localized copy (403 flag → `avatarFailed` generic; 400 size/type
  → specific; else network) per error-message standard (what/why/next).
- PostHog `avatar_updated` on success; i18n keys ×EN+AR:
  `profile.avatarUpdated`, `profile.avatarUpdatedDesc`, `profile.avatarTooLarge`,
  `profile.avatarInvalidType`, `profile.avatarFailed`.

## Checklist (contract verification)
- [x] Mutation returns the new canonical path (no bare row; profile re-read via store update)
- [x] Every error branch localized EN+AR (5 new keys, parity-checked by script)
- [x] No migration (users.avatar_url exists), no schema change
- [x] Flag-gated (explicit env), throttled (5/min write, 60/min serve), magic-sniff enforced
- [x] Tenant isolation: deletes scoped to `/media/avatars/<userId>/` prefix, managed-path checks
- [x] Tests: jest avatar suite (flag 403, oversize 400, sniff 400, previous-object cleanup,
      serve 404 mapping) + PWA fetcher FormData spec
