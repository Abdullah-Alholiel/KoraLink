/**
 * P2-250 (run #160, Reviewer A #159): the admin settlements list must surface
 * payout-request PROVENANCE — requested_by + requested_by_name via LEFT JOIN
 * users — so admins can distinguish partner-requested rows from
 * auto-generated ones. NULL requested_by (auto-generated / pre-0053 rows)
 * must keep its row (LEFT JOIN, never INNER).
 */
import { PgDialect } from 'drizzle-orm/pg-core';
import { AdminSettlementsService } from './settlements.service';
import { AdminSettlementsController } from './settlements.controller';
import { MetricsService } from './metrics.service';
import { buildSettlementRevenueQuery } from '../partner/settlement-revenue';

const THROTTLE_LIMIT_KEY = 'THROTTLER:LIMITdefault';
const THROTTLE_TTL_KEY = 'THROTTLER:TTLdefault';

function renderRaw(q: unknown): { sqlText: string } {
  const built = new PgDialect().sqlToQuery(q as never);
  return { sqlText: built.sql };
}

function render(q: unknown): { sqlText: string; params: unknown[] } {
  const built = new PgDialect().sqlToQuery(q as never);
  return { sqlText: built.sql, params: built.params as unknown[] };
}

describe('AdminSettlementsService.list — provenance read-model (P2-250)', () => {
  function makeService() {
    const queries: unknown[] = [];
    const db = {
      query: { settlements: { findFirst: jest.fn() } },
      update: jest.fn(),
      execute: jest.fn(async (q: unknown) => {
        queries.push(q);
        return [];
      }),
      transaction: jest.fn(),
      insert: jest.fn(),
    };
    const svc = new AdminSettlementsService(
      db as never,
      { record: jest.fn() } as never,
      { get: jest.fn() } as never,
      { broadcastOps: jest.fn() } as never,
      {} as never,
      {} as never,
    );
    return { svc, queries };
  }

  it('page SELECT carries requested_by + LEFT JOIN users (provenance)', async () => {
    const { svc, queries } = makeService();
    await svc.list({} as never);

    expect(queries.length).toBe(2); // page + count
    const page = render(queries[0]);
    expect(page.sqlText).toContain('s.requested_by');
    expect(page.sqlText).toContain('u.full_name AS requested_by_name');
    expect(page.sqlText).toContain('LEFT JOIN users u ON u.id = s.requested_by');
    // Count query stays a plain aggregate — no join needed for provenance.
    const count = render(queries[1]);
    expect(count.sqlText).not.toContain('LEFT JOIN');
  });

  it('LEFT JOIN never drops auto-generated rows (requested_by NULL)', async () => {
    const { svc, queries } = makeService();
    await svc.list({} as never);
    const page = render(queries[0]);
    // The only users join must be LEFT — an INNER join would hide the
    // auto-generated (NULL requested_by) settlements from admins.
    expect(page.sqlText.match(/JOIN users/g)).toHaveLength(1);
    expect(page.sqlText).toContain('LEFT JOIN users');
    expect(page.sqlText).not.toContain('INNER JOIN users');
  });

  it('no ::uuid casts — all id params stay varchar(36) (standing tripwire)', async () => {
    const { svc, queries } = makeService();
    await svc.list({} as never);
    for (const q of queries) {
      const { sqlText } = render(q);
      expect(sqlText).not.toContain('::uuid');
    }
  });
});

/**
 * P2-285 (run #195): the settlement VOID path. Three pins:
 * 1. POST :id/void carries the same route-level money throttle as pay/generate.
 * 2. The shared revenue query's dedupe guard excludes VOIDED rows — a voided
 *    settlement must free its (venue, period) window for re-settlement, and
 *    the admin generator + partner payout request share this exact query.
 * 3. The admin metrics pending_payouts aggregate stays status='pending' — a
 *    voided row must never inflate/deflate the payout liability number.
 */
describe('Settlement void path (P2-285) — money-truth pins', () => {
  function makeService() {
    const queries: unknown[] = [];
    const db = {
      query: { settlements: { findFirst: jest.fn() } },
      update: jest.fn(),
      execute: jest.fn(async (q: unknown) => {
        queries.push(q);
        return [];
      }),
      transaction: jest.fn(),
      insert: jest.fn(),
    };
    const svc = new AdminSettlementsService(
      db as never,
      { record: jest.fn() } as never,
      { get: jest.fn() } as never,
      { broadcastOps: jest.fn() } as never,
      {} as never,
      {} as never,
    );
    return { svc, queries };
  }

  it('POST admin/settlements/:id/void carries a route-level 10/min throttle', () => {
    const proto = AdminSettlementsController.prototype as unknown as Record<string, unknown>;
    const fn = proto['void'];
    expect(typeof fn).toBe('function');
    const target = fn as object;
    expect(Reflect.getMetadata(THROTTLE_LIMIT_KEY, target)).toBe(10);
    expect(Reflect.getMetadata(THROTTLE_TTL_KEY, target)).toBe(60_000);
  });

  it('revenue dedupe guard excludes voided rows (window frees on void)', () => {
    const q = buildSettlementRevenueQuery({
      venueIds: ['venue-1'],
      cadenceDays: 7,
      riyadhEnd: '2026-11-08',
    });
    const { sqlText } = renderRaw(q);
    expect(sqlText).toContain("s.status <> 'voided'");
  });

  it('0059 index predicate references NO new enum value (fresh-apply one-tx trap)', () => {
    const fs = require('node:fs');
    const raw = fs.readFileSync('drizzle/0059_settlement_void.sql', 'utf-8');
    const pred = raw.match(/CREATE UNIQUE INDEX[^;]+;/)?.[0] ?? '';
    expect(pred).toContain('IN (\'pending\',\'paid\',\'failed\')');
    expect(pred).not.toContain("'voided'");
  });

  it('metrics pending_payouts stays status=pending (voided rows excluded)', async () => {
    // Capture the REAL totals query MetricsService runs (not a mirror string).
    const queries: unknown[] = [];
    const db = {
      execute: jest.fn(async (q: unknown) => {
        queries.push(q);
        return [];
      }),
    };
    const metrics = new MetricsService(db as never);
    await metrics.getMetrics();
    const totals = renderRaw(queries[0]);
    expect(totals.sqlText).toContain("status = 'pending'");
    expect(totals.sqlText).not.toContain("'voided'");
  });
});
