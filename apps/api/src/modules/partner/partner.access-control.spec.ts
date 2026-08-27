import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PartnerService } from './partner.service';
import { venues, pitches, settlements, pitch_slots, matches } from '../../database/schema';

/**
 * P1-6 access-control + Admin-scope specs. Admin browsing the partner portal
 * must see/manage ALL venues/pitches; owners only their own. The DB stub routes
 * rows by table identity (same schema objects the service imports) and captures
 * the WHERE predicate each query builds, so a wrong scoping clause fails here
 * instead of silently passing. `updatePitch` must go through the same
 * `assertPitchAccess` gate as `deletePitch`/`createSlot`.
 */

/** Walk a Drizzle SQL/and/eq tree, collecting (columnName, value) pairs. */
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
    // Param nodes expose { brand, value } — bound values.
    if ('brand' in obj && 'value' in obj) {
      for (let i = out.length - 1; i >= 0; i--) {
        if (out[i][1] === undefined) {
          out[i][1] = obj.value;
          return;
        }
      }
      return;
    }
    // Column nodes expose { name, table }.
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

const OWNER = 'owner-1';
const OTHER_OWNER = 'owner-2';
const ADMIN = 'admin-1';
const PITCH_1 = 'pitch-1';

const ownerVenue = { id: 'venue-1', name: 'Owner Venue', owner_id: OWNER };
const otherVenue = { id: 'venue-2', name: 'Other Venue', owner_id: OTHER_OWNER };

const pitchOther = {
  id: PITCH_1,
  name: 'P1',
  size: '7v7',
  surface_type: 'grass',
  environment: 'outdoor',
  hourly_rate: '100',
  is_active: true,
  images: null,
  venue_id: 'venue-2',
  venue_name: 'Other Venue',
  owner_id: OTHER_OWNER,
};

interface StubRows {
  venues?: unknown[];
  pitches?: unknown[];
  settlements?: unknown[];
  pitch_slots?: unknown[];
  matches?: unknown[];
}

function makeService(rows: StubRows) {
  const captured = new Map<unknown, unknown>();
  const tableRows: Array<[unknown, unknown[]]> = [
    [venues, rows.venues ?? []],
    [pitches, rows.pitches ?? []],
    [settlements, rows.settlements ?? []],
    [pitch_slots, rows.pitch_slots ?? []],
    [matches, rows.matches ?? []],
  ];

  const allRowsFor = (table: unknown): unknown[] =>
    tableRows.find(([t]) => t === table)?.[1] ?? [];

  function chainFor(table: unknown) {
    let scoped = allRowsFor(table);
    const chain: any = {
      where: (cond: unknown) => {
        captured.set(table, cond);
        // Faithfully apply an owner_id equality predicate (the service's
        // non-Admin scope) so "owner sees only own" is exercised, while the
        // Admin `sql`true`` branch keeps all rows.
        const ownerVal = ownerFilterValue(cond);
        if (ownerVal !== undefined) {
          scoped = scoped.filter((r) => (r as { owner_id?: string }).owner_id === ownerVal);
        }
        return chain;
      },
      innerJoin: () => chain,
      leftJoin: () => chain,
      orderBy: () => chain,
      limit: () => chain,
    };
    chain.then = (resolve: (v: unknown) => void) => resolve(scoped);
    return chain;
  }

  const db = {
    select: () => ({ from: (table: unknown) => chainFor(table) }),
    update: () => ({
      set: () => ({
        where: () => {
          const t: { then: (r: (v: unknown) => void) => void } = {
            then: (r: (v: unknown) => void) => r([]),
          };
          return t;
        },
      }),
    }),
  };

  const realtime = { broadcastOps: () => {} };
  return {
    service: new PartnerService(db as never, realtime as never),
    captured,
  };
}

describe('PartnerService partner-portal Admin scope (P1-6)', () => {
  describe('updatePitch access control', () => {
    it('lets an Admin edit a pitch owned by someone else', async () => {
      const { service } = makeService({ pitches: [pitchOther] });
      const result = await service.updatePitch(ADMIN, 'Admin', PITCH_1, { name: 'Renamed' });
      expect(result.id).toBe(PITCH_1);
      expect(result.name).toBe('P1');
    });

    it('lets the owner edit their own pitch', async () => {
      const { service } = makeService({ pitches: [{ ...pitchOther, owner_id: OWNER }] });
      const result = await service.updatePitch(OWNER, 'VenueOwner', PITCH_1, { name: 'Renamed' });
      expect(result.id).toBe(PITCH_1);
    });

    it('rejects a non-owner non-admin with Forbidden', async () => {
      const { service } = makeService({ pitches: [pitchOther] });
      await expect(
        service.updatePitch(OWNER, 'VenueOwner', PITCH_1, { name: 'X' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects a missing pitch with NotFound', async () => {
      const { service } = makeService({ pitches: [] });
      await expect(
        service.updatePitch(ADMIN, 'Admin', 'missing', { name: 'X' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getEarnings scoping', () => {
    it('scopes an Admin to ALL venues (no owner filter)', async () => {
      const { service, captured } = makeService({
        venues: [ownerVenue, otherVenue],
        settlements: [{ id: 's1', amount: '10', status: 'paid', venue_id: 'venue-2' }],
      });
      const earnings = await service.getEarnings(ADMIN, 'Admin');
      expect(ownerFilterValue(captured.get(venues))).toBeUndefined();
      expect(earnings.totalPaid).toBe(10);
    });

    it('scopes an owner to their own venues only', async () => {
      const { service, captured } = makeService({
        venues: [ownerVenue, otherVenue],
        settlements: [],
      });
      await service.getEarnings(OWNER, 'VenueOwner');
      expect(ownerFilterValue(captured.get(venues))).toBe(OWNER);
    });

    it('returns an empty ledger for an owner with no venues', async () => {
      const { service } = makeService({ venues: [otherVenue], settlements: [] });
      const earnings = await service.getEarnings(OWNER, 'VenueOwner');
      expect(earnings).toEqual({ settlements: [], totalPending: 0, totalPaid: 0 });
    });
  });

  describe('getDashboard scoping', () => {
    const dashboardRows: StubRows = {
      venues: [ownerVenue, otherVenue],
      pitches: [pitchOther],
      pitch_slots: [{ booked: 0, total: 2 }],
      matches: [{ c: 0, total: 0, mins: null }],
      settlements: [],
    };

    it('shows an Admin every venue name', async () => {
      const { service } = makeService(dashboardRows);
      const dash = await service.getDashboard(ADMIN, 'Admin');
      expect(dash.venueNames).toHaveLength(2);
      expect(dash.venueNames).toContain('Other Venue');
    });

    it('shows an owner only their own venue name', async () => {
      const { service } = makeService(dashboardRows);
      const dash = await service.getDashboard(OWNER, 'VenueOwner');
      expect(dash.venueNames).toEqual(['Owner Venue']);
    });
  });
});
