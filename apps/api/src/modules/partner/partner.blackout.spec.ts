import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Validator } from 'class-validator';
import { PartnerService } from './partner.service';
import { pitch_slots, pitches } from '../../database/schema';
import { BlackoutSlotsDto } from './dto/slots.dto';

/**
 * P2-246 (run #161): bulk slot blackout contract.
 *
 * POST /partner/pitches/:id/slots/blackout deletes every FREE slot of the
 * pitch in an inclusive [from, to] range; booked slots are NEVER touched
 * (counted in skippedBooked). Guard parity with generateSlots: in-tx FOR
 * UPDATE pitch lock (ownership transfer mid-flight → clean 404); the DELETE
 * carries `is_booked = false` (P1-18 pattern) so a booking racing the
 * blackout can never delete a sold slot — closedInstances counts the
 * DELETE's own returning rows.
 */

const OWNER = 'owner-uuid';
const PITCH = 'pitch-uuid';

interface BlackoutOpts {
  /** Rows the pitch-lock select resolves ([] = foreign/missing pitch → 404). */
  lockedPitch?: { id: string }[];
  /** Rows the conditional DELETE returns. */
  deletedRows?: { id: string }[];
  /** The booked-count SELECT result. */
  bookedCount?: number;
  access?: 'ok' | 'deny';
}

function makeService(opts: BlackoutOpts = {}) {
  const calls: string[] = [];
  let capturedDelete: { whereArg?: unknown } = {};

  const tx = {
    select: () => ({
      from: (table: unknown) => {
        const isLock = table === pitches;
        const chain = {
          innerJoin: () => chain,
          where: () => {
            calls.push(isLock ? 'pitch-lock' : 'booked-count');
            return chain;
          },
          limit: () => chain,
          for: (mode: string) => {
            calls.push(`lock-${mode}`);
            return chain;
          },
          then: (resolve: (v: unknown) => void) =>
            resolve(
              isLock
                ? opts.lockedPitch ?? [{ id: PITCH }]
                : [{ booked: opts.bookedCount ?? 0 }],
            ),
        };
        return chain;
      },
    }),
    delete: (table: unknown) => ({
      where: (whereArg: unknown) => {
        calls.push(table === pitch_slots ? 'conditional-delete' : 'delete-other');
        capturedDelete.whereArg = whereArg;
        return {
          returning: async () => opts.deletedRows ?? [],
        };
      },
    }),
  };

  const db = {
    transaction: async (fn: (tx: unknown) => Promise<unknown>): Promise<unknown> => fn(tx),
  };

  const svc = new PartnerService(db as never, {
    broadcastOps: () => {},
  } as never);
  (svc as unknown as { assertPitchAccess: () => Promise<void> }).assertPitchAccess =
    async () => {
      if (opts.access === 'deny') throw new Error('denied');
    };
  return { svc, calls, capturedDelete };
}

const DTO: BlackoutSlotsDto = { from: '2026-11-01', to: '2026-11-05' };

describe('PartnerService.blackoutSlots (P2-246)', () => {
  it('happy path: deletes free slots in range, reports booked skips', async () => {
    const { svc, calls } = makeService({
      deletedRows: [{ id: 's1' }, { id: 's2' }, { id: 's3' }],
      bookedCount: 2,
    });
    await expect(
      svc.blackoutSlots(OWNER, 'VenueOwner', PITCH, DTO),
    ).resolves.toEqual({
      pitchId: PITCH,
      from: '2026-11-01',
      to: '2026-11-05',
      closedInstances: 3,
      skippedBooked: 2,
    });
    expect(calls).toEqual([
      'pitch-lock',
      'lock-update',
      'conditional-delete',
      'booked-count',
    ]);
  });

  it('locks the pitch FOR UPDATE inside the tx (guard parity with generateSlots)', async () => {
    const { svc, calls } = makeService({ deletedRows: [] });
    await svc.blackoutSlots(OWNER, 'VenueOwner', PITCH, DTO);
    expect(calls).toContain('lock-update');
    expect(calls.indexOf('pitch-lock')).toBeLessThan(
      calls.indexOf('conditional-delete'),
    );
  });

  it('foreign/missing pitch → NotFoundException (ownership transfer mid-flight)', async () => {
    const { svc } = makeService({ lockedPitch: [] });
    await expect(
      svc.blackoutSlots(OWNER, 'VenueOwner', PITCH, DTO),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('empty range → 200 zeros (idempotent no-op, not 404)', async () => {
    const { svc } = makeService({ deletedRows: [], bookedCount: 0 });
    await expect(
      svc.blackoutSlots(OWNER, 'VenueOwner', PITCH, DTO),
    ).resolves.toEqual({
      pitchId: PITCH,
      from: '2026-11-01',
      to: '2026-11-05',
      closedInstances: 0,
      skippedBooked: 0,
    });
  });

  it('DELETE carries the is_booked=false predicate (P1-18 pattern)', async () => {
    const { svc, capturedDelete } = makeService({ deletedRows: [{ id: 's1' }] });
    await svc.blackoutSlots(OWNER, 'VenueOwner', PITCH, DTO);
    // The where arg is a drizzle `and(...)` chain — its presence (and that it
    // comes from the conditional-delete call) is the mock-agnostic pin; the
    // SQL shape is pinned by the source-level assertion below.
    expect(capturedDelete.whereArg).toBeDefined();
  });

  it('source pins: DELETE predicate + booked-count query exist in the service', () => {
    // Belt-and-braces for the mock-agnostic test above: read the method body.
    const { readFileSync } = require('fs') as typeof import('fs');
    const { join } = require('path') as typeof import('path');
    const src = readFileSync(join(__dirname, 'partner.service.ts'), 'utf8');
    const start = src.indexOf('async blackoutSlots');
    const body = src.slice(start, src.indexOf('// ── Match visibility', start));
    expect(body).toContain('eq(pitch_slots.is_booked, false)');
    expect(body).toContain('eq(pitch_slots.is_booked, true)');
    expect(body).toContain("for('update')");
  });

  it('assertPitchAccess still runs before any tx work', async () => {
    const { svc, calls } = makeService({ access: 'deny' });
    await expect(
      svc.blackoutSlots(OWNER, 'VenueOwner', PITCH, DTO),
    ).rejects.toThrow('denied');
    expect(calls).toEqual([]); // no tx statements fired
  });
});

describe('BlackoutSlotsDto validation (P2-246)', () => {
  const validator = new Validator();

  function validateDto(dto: Partial<BlackoutSlotsDto>) {
    const instance = Object.assign(new BlackoutSlotsDto(), dto);
    return validator.validate(instance);
  }

  it('accepts a real date range within the cap', async () => {
    const errors = await validateDto({ from: '2026-11-01', to: '2026-11-05' });
    expect(errors).toHaveLength(0);
  });

  it('rejects from > to', async () => {
    const errors = await validateDto({ from: '2026-11-05', to: '2026-11-01' });
    const msgs = errors.flatMap((e) => Object.values(e.constraints ?? {}));
    expect(msgs.some((m) => m.includes('from must be on or before to'))).toBe(
      true,
    );
  });

  it('rejects a calendar-impossible date (2026-02-31)', async () => {
    const errors = await validateDto({ from: '2026-02-31', to: '2026-11-05' });
    const msgs = errors.flatMap((e) => Object.values(e.constraints ?? {}));
    expect(msgs.some((m) => m.includes('real YYYY-MM-DD'))).toBe(true);
  });

  it('rejects ranges wider than 62 days', async () => {
    const errors = await validateDto({ from: '2026-01-01', to: '2026-04-30' });
    const msgs = errors.flatMap(
      (e) => Object.values(e.constraints ?? {}) as string[],
    );
    expect(msgs.some((m) => m.includes('62 days'))).toBe(true);
  });

  it('accepts exactly 62 days (inclusive cap boundary)', async () => {
    // 2026-01-01 .. 2026-03-03 = 62 calendar days inclusive of both ends
    // (31 + 28 + 3); 2026-03-04 would be 63 and must fail.
    const ok = await validateDto({ from: '2026-01-01', to: '2026-03-03' });
    expect(ok).toHaveLength(0);
    const over = await validateDto({ from: '2026-01-01', to: '2026-03-04' });
    expect(over.length).toBeGreaterThan(0);
  });
});

// BadRequestException import guard: reserved for the 400-class assertions the
// live validation pipe owns; kept out of unit scope intentionally.
void BadRequestException;
