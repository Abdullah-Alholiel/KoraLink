import { PartnerService } from './partner.service';
import { pitches, venues } from '../../database/schema';

/**
 * P2-5 residual contract (run #39): createVenue must return the FULL inserted
 * row (every venues column, is_approved:false) instead of the sparse
 * {id,name,city} projection — the admin partner-venues row type
 * (PartnerVenueRow) is the full column set, and API Contract Rule §2 requires
 * mutations to return a complete entity.
 */
describe('PartnerService.createVenue contract (P2-5, run #39)', () => {
  const OWNER = 'owner-1';

  const fullRow = {
    id: 'v-1',
    owner_id: OWNER,
    name: 'Riyadh Padel Club',
    city: 'Riyadh',
    address: 'Olaya St',
    amenities: [],
    rating: null,
    is_approved: false,
    is_koralink_partner: false,
    open_hour: null,
    close_hour: null,
    created_at: new Date(),
    updated_at: new Date(),
  };

  function makeDb(returned: unknown[]) {
    return {
      insert: () => ({
        values: () => ({
          returning: async () => returned,
        }),
      }),
    };
  }

  function makeService(db: ReturnType<typeof makeDb>) {
    return new PartnerService(db as never, { broadcastOps: () => {} } as never);
  }

  it('returns the full venues row (not the sparse {id,name,city} projection)', async () => {
    const svc = makeService(makeDb([fullRow]));
    const result = (await svc.createVenue(OWNER, {
      name: 'Riyadh Padel Club',
      city: 'Riyadh',
      address: 'Olaya St',
    } as never)) as Record<string, unknown>;

    expect(result.id).toBe('v-1');
    // Full-row contract: columns beyond the old sparse projection are present.
    for (const key of ['owner_id', 'address', 'is_approved', 'is_koralink_partner', 'created_at']) {
      expect(result).toHaveProperty(key);
    }
    // Creation invariant: venue starts unapproved.
    expect(result.is_approved).toBe(false);
  });

  it('createSlot keeps returning the complete slot row (refuted as a violation — regression pin)', async () => {
    const slotRow = {
      id: 's-1',
      pitch_id: 'p-1',
      slot_date: '2026-09-10',
      start_time: '18:00',
      end_time: '20:00',
      price: 200,
      is_booked: false,
      booked_match_id: null,
      booked_by: null,
      created_at: new Date(),
    };
    const accessRow = { id: 'p-1', owner_id: OWNER };
    const hoursRow = {
      open_hour: null,
      close_hour: null,
      closed_day_0: false,
      closed_day_1: false,
      closed_day_2: false,
      closed_day_3: false,
      closed_day_4: false,
      closed_day_5: false,
      closed_day_6: false,
    };
    const db = {
      select: () => ({
        from: (table: unknown) => {
          const chain: any = { where: () => chain, limit: () => chain, innerJoin: () => chain };
          chain.then = (resolve: (v: unknown) => void) => {
            if (table === pitches) resolve([accessRow]);
            else resolve([hoursRow]);
          };
          return chain;
        },
      }),
      insert: () => ({
        values: () => ({
          returning: async () => [slotRow],
        }),
      }),
    };
    const svc = new PartnerService(db as never, { broadcastOps: () => {} } as never);
    const result = await svc.createSlot(OWNER, 'VenueOwner', 'p-1', {
      slot_date: '2026-09-10',
      start_time: '18:00',
      end_time: '20:00',
    } as never);
    expect(result).toMatchObject({ id: 's-1', pitch_id: 'p-1', is_booked: false });
  });
});
