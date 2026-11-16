import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * P2-233 (run #151): push tags must identify ONE notification, not one TYPE.
 * The old tag `${type}:${matchId ?? conversationId ?? ''}` collapsed distinct
 * same-type events with no id (e.g. two different report resolutions) into a
 * single renotify-replaced notification. Fixed three ways:
 *   1. the report-resolution push now carries reportId (server, reports.service);
 *   2. the SW tag falls back through matchId → conversationId → reportId;
 *   3. an id-less typed push (and an untyped payload) gets a unique per-event
 *      tag — which also keeps `renotify: true` legal (it throws TypeError when
 *      tag is undefined).
 * Source tripwire (house pattern cf. push-notification-click.test.ts — the
 * worker has no runtime in vitest).
 */

const WORKER_SRC = readFileSync(join(__dirname, '../../worker/index.js'), 'utf-8');

const REPORTS_SRC = readFileSync(
  join(__dirname, '../../../../apps/api/src/modules/admin/reports.service.ts'),
  'utf-8',
);

describe('push tag identity (P2-233, run #151) — source tripwire', () => {
  it('worker tag falls back through matchId → conversationId → reportId', () => {
    expect(WORKER_SRC).toMatch(
      /data\.matchId \?\? data\.conversationId \?\? data\.reportId/,
    );
  });

  it('id-less typed push gets a unique per-event tag (never tag:undefined with renotify)', () => {
    // The ternary must resolve to a unique suffix, not undefined.
    expect(WORKER_SRC).toMatch(/evt-\$\{Date\.now\(\)\}/);
    // The old collapsed tag shape is gone.
    expect(WORKER_SRC).not.toMatch(
      /data\.conversationId \?\? ''`/,
    );
  });

  it('renotify stays true (same-entity re-stamps still replace)', () => {
    const pushStart = WORKER_SRC.indexOf("addEventListener('push'");
    const body = WORKER_SRC.slice(pushStart);
    expect(body).toMatch(/renotify: true/);
  });

  it('server report-resolution push carries the report id', () => {
    expect(REPORTS_SRC).toMatch(
      /type: 'report-resolved', reportId: before\.id/,
    );
  });
});
