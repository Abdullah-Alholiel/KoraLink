#!/usr/bin/env node
// KoraLink prod-API keep-warm + Sentry Cron Monitor
// Runs every 10 min via systemd user timer (koralink-keepwarm.timer).
//
// Two responsibilities:
//   1. GET /api/v1/health on Render FREE so the instance never idles into
//      spin-down (the original keep-warm purpose).
//   2. Sentry captureCheckIn() so the run is recorded as a Cron Monitor
//      check-in. Missed check-ins (job didn't run, OR Render was down)
//      trigger Sentry's "missed check-in" alert → email to Abdullah.
//
// The Sentry DSN is read from apps/api/.env (gitignored). The
// @sentry/node package is reused from apps/api/node_modules — no new install.
//
// Failure modes:
//   - curl non-2xx          → check-in "error"    → Sentry alerts
//   - network/timeout       → check-in "error"    → Sentry alerts
//   - Sentry SDK unreachable → still completes; health-ping purpose is met
//   - script crashes        → systemd marks service failed; Sentry alerts
//     on the next missed check-in (grace = 2× the timer interval = 20 min).
//
// Exit codes: 0 = ok, 1 = health check failed, 2 = Sentry send failed.
// Systemd treats anything non-zero as a failed unit run.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
// Resolve @sentry/node from the API app's node_modules (it's a dep there).
// No new install; we never duplicate a 200-package tree on the VPS.
const requireHere = createRequire(import.meta.url);
const Sentry = requireHere('/home/ubuntu/projects/koralink/apps/api/node_modules/@sentry/node');

const STATE_DIR = '/home/ubuntu/.local/state';
const LOG = `${STATE_DIR}/koralink-keepwarm.log`;
const MAXLOG = 262144; // 256 KiB

// Source-of-truth config
const URL = 'https://koralink-api.onrender.com/api/v1/health';
const HEALTH_TIMEOUT_MS = 25_000;
const MONITOR_SLUG = 'koralink-render-keepwarm';
const MONITOR_SCHEDULE = 'interval';  // Sentry "interval" type = fixed cadence
const MONITOR_INTERVAL = 'every-10-minutes';
// Sentry will mark the check-in "missed" if the next `in_progress` is
// MONITOR_CHECKIN_MARGIN minutes late. Two 10-min ticks is a safe grace.
const MONITOR_CHECKIN_MARGIN_MIN = 20;
const ENV_FILE = '/home/ubuntu/projects/koralink/apps/api/.env';

// ---- log helper (append, rotate at 256 KiB) ----
const { statSync, existsSync, mkdirSync, appendFileSync, writeFileSync } = requireHere('node:fs');
function log(line) {
  const ts = new Date().toISOString();
  const out = `${ts} ${line}\n`;
  try {
    mkdirSync(STATE_DIR, { recursive: true });
    if (existsSync(LOG) && statSync(LOG).size > MAXLOG) writeFileSync(LOG, '');
    appendFileSync(LOG, out);
  } catch { /* never let logging crash the run */ }
  // also echo to stdout so journalctl captures it
  process.stdout.write(out);
}

// ---- load Sentry DSN from API .env (key=value, no source so no shell leak) ----
function loadDsn() {
  try {
    const txt = readFileSync(ENV_FILE, 'utf8');
    for (const raw of txt.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 0) continue;
      const k = line.slice(0, eq).trim();
      if (k === 'SENTRY_DSN') return line.slice(eq + 1).trim();
    }
  } catch (e) {
    log(`WARN could not read ${ENV_FILE}: ${e.message}`);
  }
  return null;
}

const dsn = loadDsn();
if (!dsn) {
  log('FATAL no SENTRY_DSN in API .env; Sentry check-in disabled (health ping still runs)');
}

if (dsn) {
  Sentry.init({
    dsn,
    release: 'koralink-keepwarm@1.0.0',
    environment: 'production',
    // No tracesSampleRate needed for cron monitors; check-ins are events.
    // Do NOT enable PII; this script sees no user data.
    sendDefaultPii: false,
  });
}

// Generate a stable check-in id so Sentry can correlate in_progress → ok/error
const checkInId = Sentry.captureCheckIn(
  { monitorSlug: MONITOR_SLUG, status: 'in_progress' },
  MONITOR_SCHEDULE,
  MONITOR_INTERVAL,
);

(async () => {
  let exitCode = 0;
  let resultStatus = 'ok';
  let detail = '';

  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), HEALTH_TIMEOUT_MS);
    const res = await fetch(URL, { signal: ctrl.signal, headers: { 'user-agent': 'koralink-keepwarm/1.0' } });
    clearTimeout(to);

    if (res.ok) {
      const body = await res.text();
      detail = `HTTP ${res.status} (${body.length}B)`;
      log(`OK ${URL} -> ${detail}`);
    } else {
      resultStatus = 'error';
      detail = `HTTP ${res.status}`;
      log(`FAIL ${URL} -> ${detail}`);
      exitCode = 1;
    }
  } catch (e) {
    resultStatus = 'error';
    detail = e.name === 'AbortError' ? `timeout after ${HEALTH_TIMEOUT_MS}ms` : e.message;
    log(`FAIL ${URL} -> ${detail}`);
    exitCode = 1;
  }

  // Report outcome to Sentry (best-effort, ~3s budget)
  if (dsn) {
    try {
      Sentry.captureCheckIn(
        {
          checkInId,
          monitorSlug: MONITOR_SLUG,
          status: resultStatus,
        },
        MONITOR_SCHEDULE,
        MONITOR_INTERVAL,
      );
      // Flush so we don't lose the event on process.exit
      await Sentry.flush(2000);
    } catch (e) {
      log(`WARN Sentry captureCheckIn failed: ${e.message}`);
      if (exitCode === 0) exitCode = 2;
    }
  }

  log(`exit=${exitCode} sentry_status=${resultStatus}`);
  process.exit(exitCode);
})();
