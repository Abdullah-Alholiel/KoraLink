---
name: koralink-runtime-troubleshooting
description: "KoraLink runtime: CSP, hydration, postgres, ARM, Tailscale."
version: 1.0.0
---

# KoraLink Runtime Troubleshooting

Use when the API won't boot, the PWA throws hydration errors, CSP blocks API calls,
PostgreSQL won't connect, or the dev-login flow is broken. Covers the runtime/infra
layer that sits between the code (compiles, tests pass) and the user seeing data.

---

## 1. API Boot Failures

### `postgres_1.default is not a function`

```
ERROR [ExceptionHandler] (0 , postgres_1.default) is not a function
    at database.module.ts:16
```

`postgres` v3+ ships ESM. NestJS compiles to CommonJS — default imports don't resolve.
Fix in both `database.module.ts` and `drizzle/seed.ts`:

```typescript
import * as pg from 'postgres';
const postgres = (pg as any).default ?? pg;
```

### `unable to determine transport target for "pino-pretty"`

`pino-pretty` is referenced in `app.module.ts` logger config but not installed.

```bash
npm install pino-pretty --save-dev
```

---

## 2. CSP Blocking All API Calls

**Symptom:** `Refused to connect because it violates the document's Content Security Policy.`

**Root cause:** `next.config.mjs` `connect-src` only allows `'self'` + `mapbox`.
Add the API origin:
```javascript
"connect-src 'self' https://api.mapbox.com ... http://localhost:* http://127.0.0.1:* http://<VPS-IP>:* wss: ws:"
```

**CRITICAL:** CSP does NOT support wildcards in IPs. `http://100.*:*` is invalid — browser ignores it.
Use exact IP: `http://100.93.99.24:*`.

---

## 3. Hydration Errors (PWA)

**Symptom:** `Hydration failed because the server rendered HTML didn't match the client.`

**Root cause:** `useState` initializer reads `navigator.onLine` or `window.location.hostname` — differ between SSR and client.

**Fix:** Default to stable SSR value, sync in `useEffect`:
```typescript
// ❌ SSR mismatch
const [isOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
// ✅ SSR-safe
const [isOnline, setIsOnline] = useState(true);
useEffect(() => { setIsOnline(navigator.onLine); }, []);
```

### Date/Time inputs not working

Replace `opacity-0` overlay with `useRef` + `showPicker()`:
```tsx
const ref = useRef<HTMLInputElement>(null);
<button onClick={() => ref.current?.showPicker()}>
  <input ref={ref} type="date" className="sr-only" onChange={...} />
</button>
```

---

## 4. Docker on ARM64 (Apple Silicon / AWS Graviton)

**Symptom:** `no matching manifest for linux/arm64/v8`

**Fix:** `platform: linux/amd64` in docker-compose (QEMU emulation):
```yaml
postgres:
  image: postgis/postgis:16-3.5
  platform: linux/amd64
```

**Pitfall:** QEMU is slow — PostgreSQL may take 30-60s. Use `until pg_isready` not `sleep N`:
```bash
until sudo docker exec koralink-postgres pg_isready -U koralink -d koralink; do sleep 5; done
```

---

## 5. Tailscale Remote PWA Setup

PWA on local IDE, API on Tailscale VPS:
1. `NEXT_PUBLIC_API_URL=http://<VPS-IP>:3001/api/v1` in `.env.local`
2. CSP `connect-src` includes VPS IP (§2)
3. API listens on `0.0.0.0` (NestJS default)

---

## 5a. Persistent API Process (systemd user service)

> **The #1 cause of "no data shows" is a dead API port.** Background
> processes started in a Hermes session die when the session ends. Use a
> persistent systemd user service so the API survives reboots and crashes.

**Prerequisites:** `loginctl show-user $(whoami) | grep Linger=yes` — if
linger is not enabled, `sudo loginctl enable-linger <user>` (or ask the
user to run it — sudo may be blocked by container no-new-privileges).

**Service file** at `~/.config/systemd/user/koralink-api.service`:

```ini
[Unit]
Description=KoraLink API (NestJS)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/home/ubuntu/projects/koralink/apps/api
EnvironmentFile=/home/ubuntu/projects/koralink/apps/api/.env
ExecStart=/home/ubuntu/.local/bin/node dist/src/main.js
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=koralink-api

[Install]
WantedBy=default.target
```

**Enable and start:**
```bash
systemctl --user daemon-reload
systemctl --user enable koralink-api.service
systemctl --user start koralink-api.service
```

**Management commands:**
```bash
systemctl --user status koralink-api    # check health
systemctl --user restart koralink-api   # after code changes / rebuild
journalctl --user -u koralink-api -f    # live logs
```

> **Pitfall:** `.env` values must NOT contain quotes for systemd's
> `EnvironmentFile` — it expects raw `KEY=VALUE`, not `KEY="value"`.
> Verify with `grep '"' apps/api/.env` — if quotes exist, the value will
> include them literally.

> **After code changes:** rebuild first (`npm run build --filter=@koralink/api`),
> then `systemctl --user restart koralink-api`. The service runs from
> `dist/`, so stale compiled output = stale behavior.

> **⚠️ New NestJS module added?** When a new NestJS module is added to
> `app.module.ts`'s imports array (e.g. `PitchesModule`), the running
> NestJS process still has the OLD module graph — new routes return 404.
> Rebuild AND restart the API service for the new module to register.
> This tripped up the 404-after-module-addition debugging session in Cycle 4+5.

---

## 6. Database Connectivity

- Check ports: `ss -tlnp | grep 543` (Supabase/Docker/native may conflict)
- No `.env` → `cp apps/api/.env.example apps/api/.env`
- No migrations → `apps/api/drizzle/meta/_journal.json` missing
- No seed → `DATABASE_URL=... npx tsx drizzle/seed.ts`

### 6b. `drizzle-kit push` hangs on interactive prompt

**Symptom:** `drizzle-kit push` outputs an interactive selector (e.g. "Is pitch_slots table created or renamed from another table?") and hangs forever in non-PTY sessions (WebUI, background, cron).

**Root cause:** `drizzle-kit push` uses an interactive TUI prompt to resolve ambiguous schema changes. Without a real terminal (PTY), it never receives input.

**Fix — apply SQL directly:** Read the migration file and execute it via the `postgres` driver:
```bash
cd apps/api
npx tsx --env-file=.env -e "
const pg = require('postgres');
const fs = require('fs');
const postgres = pg.default ?? pg;
const sql_text = fs.readFileSync('drizzle/0002_mushy_fenris.sql', 'utf8');
const pool = postgres(process.env.DATABASE_URL, { max: 1 });
pool.unsafe(sql_text).then(() => { console.log('Migration applied'); pool.end(); });
"
```
This bypasses the interactive prompt entirely. Use the latest migration file name from `drizzle/`.

### 6c. `__drizzle_migrations` missing — Prisma-era DB prevents `drizzle-kit migrate`

- **Symptom**: `npm run db:migrate` fails with 42710 `DefineEnum` — duplicate enum type. The DB already has all tables (from a Prisma-era setup), but `__drizzle_migrations` tracking table doesn't exist. drizzle-kit tries to re-apply migrations 0000... from scratch → duplicate enums.
- **Root cause**: The DB was originally created by Prisma (tables exist, enums exist), then Drizzle migration files were generated afterward. Without the `__drizzle_migrations` tracking table, drizzle-kit thinks NO migrations have been applied and tries to run them all.
- **Fix — manual bootstrap**: Create the tracking table, mark existing migrations as applied, then apply only the NEW delta:
  ```sql
  CREATE TABLE IF NOT EXISTS __drizzle_migrations (
    id SERIAL PRIMARY KEY, hash text NOT NULL, created_at timestamptz DEFAULT now()
  );
  INSERT INTO __drizzle_migrations (hash) VALUES ('0000_daily_dormammu'), ('0001_daily_boomerang'), ('0002_mushy_fenris');
  ```
  Then apply only the latest migration SQL manually (CREATE TABLE + indexes + ALTER TYPE ADD VALUE), and mark it applied:
  ```sql
  INSERT INTO __drizzle_migrations (hash) VALUES ('0003_acoustic_reptil');
  ```
- **After this**: `drizzle-kit migrate` will work cleanly for future migrations.
- **Check**: `SELECT * FROM __drizzle_migrations` → should show all applied migrations.
- **Related**: When adding new tables to `schema.ts`, ALWAYS run `drizzle-kit generate` + `db:migrate` before declaring the feature done.

---

## 7. Silent 500s — PostgreSQL Type Mismatch (varchar vs uuid)

**Symptom:** A feed/list endpoint returns HTTP 500, but the PWA swallows the error and shows an *empty* state (looks like "no data" rather than "broken"). Build passes, tests pass.

**Root cause:** The KoraLink schema uses `varchar(36)` for all ID columns (`match_players.user_id`, etc.), but raw SQL in `db.execute(sql\`...\`)` casts bound parameters to `::uuid`. PostgreSQL error 42883: `operator does not exist: character varying = uuid`.

**The classic instance:** `COALESCE(BOOL_OR(mp.user_id = ${currentUserId}::uuid), FALSE)` in the `findNearby` query — broke every authenticated `GET /matches` call.

**Fix:** Cast to `::text` instead of `::uuid` to match the varchar column type. See `references/debugging-silent-500s.md` for the full debugging technique (extract SQL from pino logs, run directly via `postgres` to surface the real PG error code).

---

## 8. Verification Checklist

When "no data shows" despite build + tests passing:

- [ ] Is the API process actually running? `ss -tlnp | grep 3001` — a dead port is the #1 cause of "nothing shows"
- [ ] `curl localhost:3001/api/v1/auth/dev-login -X POST -d '{"phone":"+966****0001"}'` → 200 + token
- [ ] `curl .../matches -H "Authorization: Bearer <token>"` → 200 + JSON array (not 500)
- [ ] If 500: check process logs for `Failed query:` → extract SQL → run directly (§7)
- [ ] Browser: no CSP violations for API origin
- [ ] Browser Cookies: `access_token` present after dev-login
- [ ] Network tab: API calls return 200 (not 401/CORS/CSP)
