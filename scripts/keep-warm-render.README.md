# keep-warm-render.mjs — Sentry-monitored Render keep-warm

**What this does (1 minute summary):**
Hits `https://koralink-api.onrender.com/api/v1/health` every 10 min so the
Render FREE instance never spins down. Simultaneously reports a Sentry
Cron-Monitor check-in, so a missed run (Render down OR the cron itself
broken OR VPS down) triggers a Sentry alert → email.

## Runtime
- Run by `koralink-keepwarm.timer` (systemd user, every 10 min)
- Calls `@sentry/node` from `apps/api/node_modules` — no new install
- Reads `SENTRY_DSN` from `apps/api/.env` (gitignored, never echoed)

## Files
| Path | Role |
|---|---|
| `scripts/keep-warm-render.mjs` | this script |
| `scripts/keep-warm-render.sh`  | previous bash version (kept for diff reference; not invoked) |
| `/home/ubuntu/.config/systemd/user/koralink-keepwarm.service` | systemd unit |
| `/home/ubuntu/.config/systemd/user/koralink-keepwarm.timer`   | timer unit |
| `/home/ubuntu/.local/state/koralink-keepwarm.log`             | log (256 KiB rotating) |

## Sentry wiring — what you do (1 click)

The script auto-creates the **Monitor entity** in Sentry on first check-in.
Sentry's REST API confirms the check-in envelopes are arriving (verified
via `Sentry.init({ debug: true })` log: `Sending checkin: koralink-render-keepwarm ok`).

What's **not** auto-created is the **alert rule**. To get an email when
check-ins are missed, you must create the rule once in the Sentry UI:

1. Go to **https://hztl.sentry.io/crons/koralink-api/koralink-render-keepwarm/**
2. Click **"Create Alert"** (or "Add Alert Rule")
3. Condition: **"Cron Monitor fails"** (auto-filled)
4. Action: **"Send a notification to ActiveMembers"** (the org default)
5. Save

That's it. After that:
- Render down for ≥20 min → Sentry email to your address
- The cron job broken / VPS offline → Sentry email
- A single bad ping (5xx, timeout) → Sentry email

## Verification
```bash
# one-shot
node /home/ubuntu/projects/koralink/scripts/keep-warm-render.mjs

# tail the log
tail -f /home/ubuntu/.local/state/koralink-keepwarm.log

# timer status
systemctl --user status koralink-keepwarm.timer
```

## Rollback
```bash
# Restore the bash version (revert script + service ExecStart)
git checkout HEAD~1 -- scripts/keep-warm-render.mjs
# (also revert the systemd unit, see git diff for the path)
```
