import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PgDialect } from 'drizzle-orm/pg-core';
import { PartnerService } from './partner.service';
import { match_players, matches, pitches } from '../../database/schema';

/**
 * P1-26 match/roster visibility specs. Table-keyed stub (same style as
 * partner.access-control.spec.ts): rows route by the schema object the service
 * imports, and the WHERE predicate each query builds is captured so a broken
 * scoping clause fails here instead of silently passing.
 */

const OWNER = 'owner-1';
const OTHER_OWNER = 'owner-2';
const ADMIN = 'admin-1';
const PITCH_1 = 'pitch-1';

const matchRow = {
  id: 'match-1',
  pitch_id: PITCH_1,
  title: 'Thursday 7s',
  status: 'Open',
  visibility: 'public',
  scheduled_at: new Date('2026-08-30T18:00:00.000Z'),
  duration_mins: 90,
  booking_mode: 'slot',
  spots_filled: 2,
  no_show_count: 1,
  max_players: 10,
  pitch_name: 'Pitch A',
  venue_id: 'venue-1',
  venue_name: 'Riyadh Arena',
  host_name: 'Faisal',
};

const rosterRows = [
  { user_id: 'u-host', full_name: 'Faisal', phone: '+966500000001', team: 'A', is_host: true, no_show: false },
  { user_id: 'u-2', full_name: 'Salem', phone: '+966500000002', team: 'B', is_host: false, no_show: true },
];

/** Walk a Drizzle predicate, collecting every bound parameter value. */
function collectParamValues(node: unknown, out: unknown[]): void {
  if (Array.isArray(node)) {
    node.forEach((n) => collectParamValues(n, out));
    return;
  }
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    if (Array.isArray(obj.queryChunks)) {
      collectParamValues(obj.queryChunks, out);
      return;
    }
    if ('brand' in obj && 'value' in obj) {
      out.push(obj.value);
    }
  }
}

/** Walk a Drizzle predicate collecting (columnName, value) equality pairs. */
function collectEqPairs(node: unknown, out: Array<[string, unknown]>): void {
  if (Array.isArray(node)) {
    node.forEach((n) => collectEqPairs(n, out));
    return;
  }
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    if (Array.isArray(obj.queryChunks)) {
      collectEqPairs(obj.queryChunks, out);
      return;
    }
    if ('brand' in obj && 'value' in obj) {
      for (let i = out.length - 1; i >= 0; i--) {
        if (out[i][1] === undefined) {
          out[i][1] = obj.value;
          return;
        }
      }
      return;
    }
    if (typeof obj.name === 'string' && 'table' in obj) {
      out.push([obj.name, undefined]);
    }
  }
}

function ownerFilterValue(cond: unknown): unknown | undefined {
  const pairs: Array<[string, unknown]> = [];
  collectEqPairs(cond, pairs);
  return pairs.find(([col]) => col === 'owner_id')?.[1];
}

function makeService(rowsByTable: Map<unknown, unknown[]>) {
  const captured = new Map<unknown, unknown>();

  function chainFor(table: unknown) {
    const scoped = rowsByTable.get(table) ?? [];
    const chain: any = {
      where: (cond: unknown) => {
        captured.set(table, cond);
        return chain;
      },
      innerJoin: () => chain,
      leftJoin: () => chain,
      groupBy: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      offset: () => chain,
    };
    chain.then = (resolve: (v: unknown) => void) => resolve(scoped);
    return chain;
  }

  const db = {
    select: () => ({ from: (table: unknown) => chainFor(table) }),
  };

  const realtime = { broadcastOps: () => {} };
  return {
    service: new PartnerService(db as never, realtime as never),
    captured,
  };
}

describe('PartnerService match visibility (P1-26)', () => {
  describe('getPartnerMatches', () => {
    it('returns the scoped envelope and filters by the actor pitch ids', async () => {
      const rowsByTable = new Map<unknown, unknown[]>([
        [pitches, [{ id: PITCH_1, owner_id: OWNER }]],
        [matches, [{ ...matchRow, total: 1 }]],
      ]);
      const { service, captured } = makeService(rowsByTable);
      const result = await service.getPartnerMatches(OWNER, 'VenueOwner', {
        scope: 'today',
        limit: 50,
        offset: 0,
      });
      expect(result.total).toBe(1);
      expect(result.hasMore).toBe(false);
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]).not.toHaveProperty('total');
      // The scoped WHERE must reference the actor's pitch ids (inArray params).
      const params: unknown[] = [];
      collectParamValues(captured.get(matches), params);
      expect(params).toContain(PITCH_1);
    });

    it('scopes an owner to their own pitches and an Admin to all (no owner filter)', async () => {
      const rowsByTable = new Map<unknown, unknown[]>([
        [
          pitches,
          [
            { id: PITCH_1, owner_id: OWNER },
            { id: 'pitch-2', owner_id: OTHER_OWNER },
          ],
        ],
        [matches, []],
      ]);
      const { service, captured } = makeService(rowsByTable);
      await service.getPartnerMatches(OWNER, 'VenueOwner', {
        scope: 'upcoming',
        limit: 50,
        offset: 0,
      });
      expect(ownerFilterValue(captured.get(pitches))).toBe(OWNER);
      await service.getPartnerMatches(ADMIN, 'Admin', {
        scope: 'upcoming',
        limit: 50,
        offset: 0,
      });
      expect(ownerFilterValue(captured.get(pitches))).toBeUndefined();
    });

    it('returns an empty envelope for an actor with no pitches', async () => {
      const rowsByTable = new Map<unknown, unknown[]>();
      rowsByTable.set(pitches, []);
      const { service } = makeService(rowsByTable);
      const result = await service.getPartnerMatches(OWNER, 'VenueOwner', {
        scope: 'today',
        limit: 50,
        offset: 0,
      });
      expect(result).toEqual({ matches: [], total: 0, hasMore: false });
    });

    it('upcoming excludes Cancelled by default; explicit ?status= wins (P1-34)', async () => {
      const rowsByTable = new Map<unknown, unknown[]>([
        [pitches, [{ id: PITCH_1, owner_id: OWNER }]],
        [matches, []],
      ]);
      const { service, captured } = makeService(rowsByTable);
      const dialect = new PgDialect();

      // Default upcoming: WHERE must reference the status column with the
      // 'Cancelled' exclusion bound as a parameter (PgDialect materializes the
      // build-time params — the raw chunk walker cannot see them).
      await service.getPartnerMatches(OWNER, 'VenueOwner', {
        scope: 'upcoming',
        limit: 50,
        offset: 0,
      });
      const defaultQuery = dialect.sqlToQuery(captured.get(matches) as unknown as Parameters<typeof dialect.sqlToQuery>[0]);
      expect(defaultQuery.sql).toContain('"matches"."status"');
      expect(defaultQuery.params).toContain('Cancelled');

      // Explicit ?status= replaces the default exclusion (Open proves precedence —
      // the default would have forced 'Cancelled').
      await service.getPartnerMatches(OWNER, 'VenueOwner', {
        scope: 'upcoming',
        status: 'Open',
        limit: 50,
        offset: 0,
      });
      const explicitQuery = dialect.sqlToQuery(captured.get(matches) as unknown as Parameters<typeof dialect.sqlToQuery>[0]);
      expect(explicitQuery.params).toContain('Open');
      expect(explicitQuery.params).not.toContain('Cancelled');

      // Today recap keeps the all-status default: no status predicate at all.
      await service.getPartnerMatches(OWNER, 'VenueOwner', {
        scope: 'today',
        limit: 50,
        offset: 0,
      });
      const todayQuery = dialect.sqlToQuery(captured.get(matches) as unknown as Parameters<typeof dialect.sqlToQuery>[0]);
      expect(todayQuery.sql).not.toContain('"matches"."status"');
    });
  });

  describe('getPartnerMatch', () => {
    const detailTables = () =>
      new Map<unknown, unknown[]>([
        [matches, [matchRow]],
        [pitches, [{ id: PITCH_1, owner_id: OWNER }]],
        [match_players, rosterRows],
      ]);

    it('serves the populated roster with the host first', async () => {
      const { service } = makeService(detailTables());
      const detail = await service.getPartnerMatch(OWNER, 'VenueOwner', 'match-1');
      expect(detail.title).toBe('Thursday 7s');
      expect(detail.spots_filled).toBe(2);
      expect(detail.no_show_count).toBe(1);
      expect(detail.players).toHaveLength(2);
      expect(detail.players[0].is_host).toBe(true);
      expect(detail.players[0].full_name).toBe('Faisal');
      expect(detail.players.some((p) => p.no_show)).toBe(true);
    });

    it('rejects a non-owner non-admin with Forbidden', async () => {
      const rowsByTable = detailTables();
      rowsByTable.set(pitches, [{ id: PITCH_1, owner_id: OTHER_OWNER }]);
      const { service } = makeService(rowsByTable);
      await expect(
        service.getPartnerMatch(OWNER, 'VenueOwner', 'match-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects a missing match with NotFound', async () => {
      const rowsByTable = new Map<unknown, unknown[]>([
        [matches, []],
        [pitches, [{ id: PITCH_1, owner_id: OWNER }]],
        [match_players, []],
      ]);
      const { service } = makeService(rowsByTable);
      await expect(
        service.getPartnerMatch(ADMIN, 'Admin', 'missing'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
