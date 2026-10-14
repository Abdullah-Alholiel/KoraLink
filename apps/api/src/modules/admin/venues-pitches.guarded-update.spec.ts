import { NotFoundException } from '@nestjs/common';
import { AdminVenuesService as VenuesService } from './venues.service';
import { AdminPitchesService as PitchesService } from './pitches.service';

/**
 * P2-202 (run #132): guarded-update parity for the admin venues/pitches
 * UPDATE paths (mirror of the P2-191/192 predicated-update discipline).
 *
 * Both services read `findOne(id)` for the audit `before`, then run a bare
 * UPDATE. A row deleted between that read and the UPDATE made the write a
 * SILENT NO-OP that still landed in the audit log as a change. The
 * .returning() rowcount guard closes that window: 0 rows → 404 BEFORE the
 * audit write.
 */

function makeDb(returningRows: Array<{ id: string }>) {
  const returning = jest.fn().mockResolvedValue(returningRows);
  return {
    db: {
      update: () => ({
        set: () => ({
          where: () => ({ returning }),
        }),
      }),
    } as never,
    returning,
  };
}

describe('P2-202: admin venues/pitches guarded update (run #132)', () => {
  it('venues.update: 0-row UPDATE → NotFoundException, audit.log NEVER called', async () => {
    const { db, returning } = makeDb([]);
    const audit = { log: jest.fn() };
    const svc = new VenuesService(db, audit as never, { broadcastOps: jest.fn() } as never, {} as never);
    jest.spyOn(svc, 'findOne' as never).mockResolvedValue({ id: 'v-gone' } as never);

    await expect(
      svc.update('v-gone', { name: 'Renamed' } as never, 'admin-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(returning).toHaveBeenCalledTimes(1);
    // The whole point: a no-op must never be recorded as a change.
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('venues.update: 1-row UPDATE proceeds — audit.log called, row returned', async () => {
    const { db, returning } = makeDb([{ id: 'v-1' }]);
    const audit = { log: jest.fn() };
    const realtime = { broadcastOps: jest.fn() };
    const svc = new VenuesService(db, audit as never, realtime as never, {} as never);
    const row = { id: 'v-1', name: 'Renamed' };
    jest.spyOn(svc, 'findOne' as never).mockResolvedValue(row as never);

    const out = await svc.update('v-1', { name: 'Renamed' } as never, 'admin-1', '10.0.0.1');
    expect(out).toEqual(row);
    expect(audit.log).toHaveBeenCalledTimes(1);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'venue.update', entityId: 'v-1' }),
    );
    expect(realtime.broadcastOps).toHaveBeenCalledWith('venues');
  });

  it('pitches.update: 0-row UPDATE → NotFoundException, audit.log NEVER called', async () => {
    const { db, returning } = makeDb([]);
    const audit = { log: jest.fn() };
    const svc = new PitchesService(db, audit as never, { broadcastOps: jest.fn() } as never, {} as never);
    jest.spyOn(svc, 'findOne' as never).mockResolvedValue({ id: 'p-gone' } as never);

    await expect(
      svc.update('p-gone', { name: 'Court B' } as never, 'admin-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(returning).toHaveBeenCalledTimes(1);
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('pitches.update: 1-row UPDATE proceeds — audit.log called, row returned', async () => {
    const { db, returning } = makeDb([{ id: 'p-1' }]);
    const audit = { log: jest.fn() };
    const realtime = { broadcastOps: jest.fn() };
    const svc = new PitchesService(db, audit as never, realtime as never, {} as never);
    const row = { id: 'p-1', name: 'Court B' };
    jest.spyOn(svc, 'findOne' as never).mockResolvedValue(row as never);

    const out = await svc.update('p-1', { name: 'Court B' } as never, 'admin-1');
    expect(out).toEqual(row);
    expect(audit.log).toHaveBeenCalledTimes(1);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'pitch.update', entityId: 'p-1' }),
    );
    expect(realtime.broadcastOps).toHaveBeenCalledWith('venues');
  });
});
