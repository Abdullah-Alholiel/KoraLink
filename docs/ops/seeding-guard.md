# Seeding — guard rails (P2-144 rider, run #140)

`apps/api/drizzle/seed.ts` refuses to run destructive seeding by default (PR #144, be9dce1):

1. `NODE_ENV=production` is refused unless `ALLOW_DESTRUCTIVE_SEED=1` is set.
2. Any REMOTE database host (including all Neon hosts) is refused unless
   `ALLOW_DESTRUCTIVE_SEED=1` is set. Loopback hosts only by default:
   `localhost`, `127.0.0.1`, `::1`, `::ffff:127.0.0.1` (IPv6 brackets stripped).
3. An unparseable `DATABASE_URL` is treated as remote → refused (fails safe).

## Intentional re-seed of a remote/staging DB (owner/operator action)

```bash
cd apps/api
ALLOW_DESTRUCTIVE_SEED=1 node --env-file=.env dist/src/database/seed.js
```

Leave the flag unset everywhere else. The guard exists because a seed run against
the wrong host wipes real users — keep it that way.
