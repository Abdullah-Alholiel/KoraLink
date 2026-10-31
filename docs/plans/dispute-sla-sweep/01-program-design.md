# Program Design — P1-63 dispute SLA sweep (+ run-#118 reviewer fixes)

## Problem
Open/under_review disputes lock player funds/standing with no deadline — resolve is
admin-only and nothing escalates neglect (Reviewer B, run #109). Default **7-day
reminder** was formally clocked run #109 (2026-10-07T02:3xZ), elapsed 2026-10-09 ~02:30Z,
**no veto in chat/board** → built as written per Defaults+48h-Veto.

## User story
As an admin, a dispute sitting unanswered for 7+ days surfaces itself (timeline entry +
priority flag) so it cannot silently rot; as a reporter, my case gets re-attention.

## Scope
IN: (1) DisputeSlSweep — daily 06:17 UTC cron in admin module; escalates `opened`/
`under_review` disputes older than 7 days (created_at < now-7d): appends ONE
`{action:'sla_escalated', at, note}` evidence entry (dedup: skip if already present —
idempotent across ticks/restarts); sets `sla_escalated=true` on the SAME guarded UPDATE
WHERE status IN (opened,under_review) AND sla_escalated = false. (2) Admin disputes list
exposes `sla_escalated` (types.ts + admin service select) so the queue can filter/flag.
(3) Admin UI: red "SLA escalated" chip on the disputes page rows + detail header.
(4) EN+AR i18n for the chip + timeline label (evidenceLabel switch gains sla_escalated).
(5) Reviewer-A fixes: auditSafe() wrapper (audit/activity failures log + Sentry-tag, never
throw post-commit) applied to resolve/addMessage/reopen; migrate-vps env read → try/catch
to fail-loud exit 5 when no URL source exists.
OUT: notifications to players (email layer log-only per P1-41); auto-resolution; SLA
config surface (7d hardcoded constant, documented).

## Contracts
- No API request/response shape changes: `sla_escalated` is a NEW nullable boolean column;
  admin list rows gain the field (additive). Migration 0049: `ALTER TABLE disputes ADD
  COLUMN sla_escalated boolean NOT NULL DEFAULT false;` (hand-written, journal idx 50,
  snapshot chain copied from 0048 entry; tripwires must pass 8/8).
- Sweep returns `{ escalated: number }`; tick logs only when >0 (matches.scheduler style).
- i18n keys: admin `disputes.slaEscalated` (+`slaTimeline` label) in BOTH en/ar.json;
  leaf parity preserved.

## Files
- apps/api/drizzle/0049_dispute_sla.sql (+journal, +snapshot copy)
- apps/api/src/database/schema.ts (disputes.slaEscalated)
- apps/api/src/modules/admin/disputes.service.ts (sweep method + auditSafe + select col)
- apps/api/src/modules/admin/disputes.scheduler.ts (NEW)
- apps/api/src/modules/admin/admin.module.ts (provider)
- apps/api/src/modules/admin/disputes.sla-sweep.spec.ts (NEW: dedup, guard, 7d boundary)
- apps/admin/src/lib/types.ts, disputes list/detail pages, messages/{en,ar}.json
- scripts/migrate-vps.mjs (env-read try/catch)

## Risks
- Double-escalation → guarded UPDATE + evidence dedup check in-tx (FOR UPDATE row lock,
  reopen() precedent). Reopen flow unaffected (status predicate excludes decided rows).
- Non-ASCII in SQL files is forbidden (CI non-ascii tripwire) — plain ASCII only.
