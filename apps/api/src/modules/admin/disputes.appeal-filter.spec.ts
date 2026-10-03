import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { PgDialect } from 'drizzle-orm/pg-core';
import { ListDisputesDto } from './dto/list-disputes.dto';
import { AdminDisputesService } from './disputes.service';

/**
 * Appeal-visibility regression specs (run #98, t_e6dccff7 — Reviewer B gap).
 *
 * Players attach appeals to a dispute as JSON evidence entries
 * ({ action: 'appeal', reason, at }) via createDispute /
 * appendDisputeEvidenceAtomically (matches.service). Until now the admin
 * disputes list had NO way to see or filter that state: an appealed dispute
 * looked identical to a fresh auto-opened mark, so admins could close a case
 * without ever noticing the player had appealed.
 *
 * Contract pinned here:
 *  - `?appeal=true|false` filters via EXISTS / NOT EXISTS over the evidence
 *    JSON — the user-supplied VALUE drives the branch and must NEVER appear
 *    in the emitted SQL or the bind params (it is validated to exactly two
 *    tokens in the DTO, then branch-selected).
 *  - The predicate lands in BOTH the page query and the COUNT query (count
 *    shares the same WHERE — a filter whose total lies is the classic
 *    pagination bug).
 *  - Rows carry `appeal_count` + server-derived `has_appealed`, and the page
 *    query orders appealed disputes first (tiebroken by created_at DESC —
 *    unique-enough for page stability at this table's scale).
 *  - No `appeal` param → no EXISTS anywhere (zero regression on the old
 *    contract: plain created_at DESC ordering, no JSON probe).
 */

const APPEAL_PROBE = `e->>'action' = 'appeal'`;

function makeService(rows: Array<Record<string, unknown>>) {
  const queries: unknown[] = [];
  const db = {
    execute: async (q: unknown) => {
      queries.push(q);
      // First execute = page query, second = count query.
      return queries.length === 1 ? rows : [{ c: 42 }];
    },
  };
  const svc = new AdminDisputesService(
    db as never,
    { log: jest.fn() } as never,
    { broadcastOps: jest.fn() } as never,
    { record: jest.fn() } as never,
  );
  return { svc, queries };
}

function render(q: unknown): { sqlText: string; params: unknown[] } {
  const built = new PgDialect().sqlToQuery(q as never);
  return { sqlText: built.sql, params: built.params as unknown[] };
}

describe('AdminDisputesService.list — appeal visibility (run #98)', () => {
  it('appeal=true: EXISTS probe on the evidence JSON in page + count queries', async () => {
    const { svc, queries } = makeService([]);
    await svc.list({ appeal: 'true' } as never);

    expect(queries).toHaveLength(2); // page + count share the filter
    for (const q of queries) {
      const { sqlText, params } = render(q);
      expect(sqlText).toMatch(new RegExp(`EXISTS\\s*\\(`));
      expect(sqlText).toContain(APPEAL_PROBE);
      expect(sqlText).not.toContain('NOT EXISTS');
      // The filter VALUE drives the branch — it never rides as SQL or a param.
      expect(sqlText).not.toMatch(/\btrue\b/);
      expect(params).not.toContain('true');
    }
  });

  it('appeal=false: NOT EXISTS probe in page + count queries', async () => {
    const { svc, queries } = makeService([]);
    await svc.list({ appeal: 'false' } as never);

    for (const q of queries) {
      const { sqlText, params } = render(q);
      expect(sqlText).toContain('NOT EXISTS');
      expect(sqlText).toContain(APPEAL_PROBE);
      expect(sqlText).not.toMatch(/\bfalse\b/);
      expect(params).not.toContain('false');
    }
  });

  it('status + appeal combine with AND; status is the only bind param', async () => {
    const { svc, queries } = makeService([]);
    await svc.list({ status: 'opened', appeal: 'true' } as never);

    const { sqlText, params } = render(queries[0]);
    expect(sqlText).toContain('d.status =');
    expect(sqlText).toMatch(/AND\s+EXISTS\s*\(/);
    expect(params).toContain('opened');
    // The filter VALUE never rides as a param (branch-selected in code).
    expect(params).not.toContain('true');
    // The COUNT query carries the same WHERE (no total/filter divergence).
    const count = render(queries[1]);
    expect(count.sqlText).toContain('COUNT(*)::int');
    expect(count.sqlText).toMatch(/AND\s+EXISTS\s*\(/);
  });

  it('no appeal param: zero regression — no appeal WHERE, legacy ordering', async () => {
    const { svc, queries } = makeService([]);
    await svc.list({} as never);

    const page = render(queries[0]);
    // The appeal-first ORDER BY (with its EXISTS) is ALWAYS present; what the
    // omitted filter proves is that no predicate sits between the joins and
    // the ORDER BY (the probes' own `WHERE e->>'action'` text is expected).
    expect(page.sqlText).toMatch(/d\.match_id\s+ORDER BY EXISTS/);
    expect(page.sqlText).toContain('ORDER BY EXISTS');
    expect(page.sqlText).toMatch(/DESC, d\.created_at DESC/);
    const count = render(queries[1]);
    expect(count.sqlText).not.toContain('WHERE');
    expect(count.sqlText).not.toContain('EXISTS');
  });

  it('page query surfaces appeal_count and orders appealed disputes first', async () => {
    const { svc, queries } = makeService([]);
    await svc.list({ appeal: 'true' } as never);

    const { sqlText } = render(queries[0]);
    expect(sqlText).toContain('AS appeal_count');
    expect(sqlText).toMatch(/ORDER BY EXISTS/);
    expect(sqlText).toMatch(/DESC, d\.created_at DESC/);
  });

  it('maps appeal_count → has_appealed server-side (0/null → false)', async () => {
    const { svc } = makeService([
      { id: 'd1', appeal_count: 2 },
      { id: 'd2', appeal_count: 0 },
      { id: 'd3', appeal_count: null },
    ]);
    const res = (await svc.list({} as never)) as unknown as {
      disputes: Array<{ id: string; has_appealed: boolean }>;
      total: number;
    };

    expect(res.disputes.map((d) => d.has_appealed)).toEqual([true, false, false]);
    expect(res.total).toBe(42);
  });
});

describe('ListDisputesDto — appeal token whitelist', () => {
  const validate = (q: Record<string, unknown>) =>
    validateSync(plainToInstance(ListDisputesDto, q));

  it('accepts only true/false; garbage and numbers 400 via whitelist', () => {
    expect(validate({ appeal: 'true' }).length).toBe(0);
    expect(validate({ appeal: 'false' }).length).toBe(0);
    expect(validate({}).length).toBe(0);
    const bad = validate({ appeal: '1' });
    expect(bad.length).toBeGreaterThan(0);
    expect(bad[0].property).toBe('appeal');
  });

  it('pagination clamps still hold (page ≥ 1, perPage ≤ 100)', () => {
    expect(validate({ page: '0' }).length).toBeGreaterThan(0);
    expect(validate({ perPage: '101' }).length).toBeGreaterThan(0);
    expect(validate({ page: '2', perPage: '50' }).length).toBe(0);
  });
});
