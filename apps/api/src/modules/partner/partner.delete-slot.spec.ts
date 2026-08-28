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

function thenable(rows: unknown[] = []) {
  return { then: (resolve: (v: unknown) => void) => resolve(rows) };
}

function makeService(opts: {
  slotRow: unknown | null;
  deletedRows: unknown[];
  access: 'ok' | 'deny';
}) {
  const db = {
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          limit: async () => (table === pitch_slots && opts.slotRow ? [opts.slotRow] : []),
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
    const svc = makeService({ slotRow: SLOT, deletedRows: [], access: 'ok' });
    await expect(svc.deleteSlot('actor', 'VenueOwner', 'slot-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
