#!/usr/bin/env node
// Prod Neon migration-state probe (watchdog helper).
// Reads PROD_DB_URI (or NEON_URI_URL) from env, prints ROWS:<n> or ERR:<msg>.
// Lives in apps/api so require('postgres') resolves against the app's node_modules.
const postgres = require('postgres');
const uri = process.env.PROD_DB_URI || process.env.NEON_URI_URL;
if (!uri) { console.log('ERR:no-uri'); process.exit(0); }
const sql = postgres(uri, { ssl: 'require', max: 1, connect_timeout: 20 });
sql`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`
  .then(r => { console.log('ROWS:' + r[0].n); return sql.end(); })
  .catch(e => { console.log('ERR:' + e.message.split('\n')[0]); return sql.end(); });
