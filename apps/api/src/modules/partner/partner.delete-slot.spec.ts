import { ConflictException, NotFoundException } from '@nestjs/common';
import { PartnerService } from './partner.service';
import { pitch_slots } from '../../database/schema';

/**
 * deleteSlot TOCTOU regression specs (run #9 reviewer finding).
 *
 * Before the fix the DELETE had no `is_booked = false` predicate, so a match
 * that booked the slot between the is_booked SELECT and the DELETE silently
 * deleted a booked slot out from under the booking. Now the DELETE is
 * conditional and zero affected rows → ConflictException.
 */

function makeService(opts: {
  slotRow: unknown | null;
  deletedRows: unknown[];
  access: 'ok' | 'deny';
  /** Slot row the post-miss re-read sees (P2-12/run-85 404-vs-409 split). */
  rereadRow?: unknown;
}) {
  let plainReads = 0;
  const db = {
    // P2-12/run-85: the locked select + DELETE run in one tx (stub tx = db).
    transaction: async (fn: (tx: unknown) => Promise<unknown>): Promise<unknown> => fn(db),
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          limit: () => {
            const rows = table === pitch_slots && opts.slotRow ? [opts.slotRow] : [];
            // The pre-check is the first awaited .limit(); the tx lock chains
            // .for(); any later bare .limit() is the post-miss re-read.
            const awaited = plainReads++ === 0 || !opts.rereadRow ? rows : [opts.rereadRow];
            return {
              then: (resolve: (v: unknown) => void) => resolve(awaited),
              for: async () => rows,
            };
          },
        }),
      }),
    }),
    delete: () => ({
      where: () => ({ returning: async () => opts.deletedRows }),
    }),
  };
  const svc = new PartnerService(db as never, {
    broadcastOps: () => {},
  } as never);
  // assertPitchAccess is an internal method — stub it on the instance.
  (svc as unknown as { assertPitchAccess: () => Promise<void> }).assertPitchAccess =
    async () => {
      if (opts.access === 'deny') throw new Error('denied');
    };
  return svc;
}

const SLOT = { id: 'slot-1', pitch_id: 'pitch-1', is_booked: false };

describe('PartnerService.deleteSlot TOCTOU guard', () => {
  it('404s when the slot does not exist', async () => {
    const svc = makeService({ slotRow: null, deletedRows: [], access: 'ok' });
    await expect(svc.deleteSlot('actor', 'VenueOwner', 'slot-x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('deletes an unbooked slot (happy path)', async () => {
    const svc = makeService({ slotRow: SLOT, deletedRows: [{ id: 'slot-1' }], access: 'ok' });
    await expect(svc.deleteSlot('actor', 'VenueOwner', 'slot-1')).resolves.toEqual({
      deleted: true,
    });
  });

  it('rejects with Conflict (not silent delete) when the slot got booked mid-flight', async () => {
    // SELECT saw is_booked=false, but the conditional DELETE matched zero rows
    // because a booking flipped it in between — the row must survive.
    const svc = makeService({
      slotRow: SLOT,
      deletedRows: [],
      access: 'ok',
      rereadRow: { ...SLOT, is_booked: true },
    });
    await expect(svc.deleteSlot('actor', 'VenueOwner', 'slot-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
