/**
 * P2-249 (run #160, Reviewer A #159): createSlot's INSERT must map ONLY a
 * 23505 unique-violation to the "slot already exists" ConflictException.
 * Any other tx failure (deadlock 40P01, serialization 40001, connection
 * drop) must propagate untouched — the old blind `catch` masqueraded every
 * DB failure as a user-facing conflict.
 *
 * Reuses the partner-scope-hardening mock shape (tx select/insert/delete
 * chains + real PartnerService), minus the venue-hours row so the INSERT
 * path runs.
 */
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PartnerService } from './partner.service';
import { pitch_slots, pitches, venues } from '../../database/schema';

const OWNER = 'owner-uuid';
const ADMIN = 'admin-uuid';
const PITCH = 'pitch-uuid';

type InsertBehavior = 'ok' | 'unique' | 'deadlock' | 'wrapped-deadlock';

/** Minimal tx mock: lock select → venue-hours select (empty → skip) → insert. */
function makeService(behavior: InsertBehavior, opts: { lockEmpty?: boolean } = {}) {
  const calls: string[] = [];
  let insertValues: unknown = null;

  const tx = {
    select: () => ({
      from: (table: unknown) => {
        const isLock = table === pitches;
        const chain = {
          innerJoin: (_t: unknown, _on: unknown) => chain,
          where: (w: unknown) => {
            calls.push(isLock ? 'lock-select' : 'hours-select');
            void w;
            return chain;
          },
          limit: () => chain,
          for: (mode: string) => {
            calls.push(`lock-${mode}`);
            return chain;
          },
          then: (resolve: (v: unknown) => void) =>
            resolve(isLock && !opts.lockEmpty ? [{ id: PITCH }] : []),
        };
        return chain;
      },
    }),
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        void table;
        insertValues = values;
        calls.push('insert-slot');
        return {
          returning: async () => {
            if (behavior === 'unique') {
              const err = new Error('duplicate key value violates unique constraint');
              (err as { code?: string }).code = '23505';
              throw err;
            }
            if (behavior === 'deadlock') {
              const err = new Error('deadlock detected');
              (err as { code?: string }).code = '40P01';
              throw err;
            }
            if (behavior === 'wrapped-deadlock') {
              // postgres-js style: driver code on err.cause
              const cause = new Error('deadlock detected');
              (cause as { code?: string }).code = '40P01';
              const wrapped = new Error('Failed query');
              (wrapped as { cause?: unknown }).cause = cause;
              throw wrapped;
            }
            return [{ id: 'slot-1', ...((values ?? {}) as object) }];
          },
        };
      },
    }),
  };

  const db = {
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => {
      calls.push('tx-begin');
      const out = await fn(tx);
      calls.push('tx-commit');
      return out;
    },
  };
  const broadcastOps = jest.fn();
  const svc = new PartnerService(db as never, { broadcastOps } as never);
  (svc as unknown as { assertPitchAccess: () => Promise<void> }).assertPitchAccess =
    async () => {
      calls.push('assert-access');
    };
  return { svc, calls, broadcastOps, getInsertValues: () => insertValues };
}

const SLOT_DTO = { slot_date: '2026-10-05', start_time: '18:00', end_time: '19:00' };

describe('PartnerService.createSlot INSERT error triage (P2-249)', () => {
  it('happy path: returns the inserted slot row and broadcasts', async () => {
    const { svc, calls, broadcastOps, getInsertValues } = makeService('ok');
    const slot = await svc.createSlot(OWNER, 'VenueOwner', PITCH, SLOT_DTO as never);
    expect(slot).toMatchObject({ id: 'slot-1', pitch_id: PITCH });
    expect(getInsertValues()).toMatchObject({
      pitch_id: PITCH,
      slot_date: SLOT_DTO.slot_date,
      start_time: '18:00:00',
      end_time: '19:00:00',
    });
    expect(calls).toContain('tx-commit');
    expect(broadcastOps).toHaveBeenCalledWith('venues');
  });

  it('23505 → ConflictException (same copy as the pre-existing guard)', async () => {
    const { svc } = makeService('unique');
    await expect(svc.createSlot(OWNER, 'VenueOwner', PITCH, SLOT_DTO as never)).rejects.toThrow(
      ConflictException,
    );
  });

  it('deadlock (bare driver code) propagates untouched — NOT a 409', async () => {
    const { svc } = makeService('deadlock');
    await expect(svc.createSlot(OWNER, 'VenueOwner', PITCH, SLOT_DTO as never)).rejects.toThrow(
      /deadlock detected/,
    );
  });

  it('deadlock (postgres-js err.cause surface) propagates untouched — NOT a 409', async () => {
    const { svc } = makeService('wrapped-deadlock');
    await expect(svc.createSlot(OWNER, 'VenueOwner', PITCH, SLOT_DTO as never)).rejects.toThrow(
      /Failed query/,
    );
  });

  it('guards stay ahead of the tx (validation order pinned)', async () => {
    const { svc, calls } = makeService('ok');
    await svc.createSlot(ADMIN, 'Admin', PITCH, SLOT_DTO as never);
    expect(calls.indexOf('assert-access')).toBeLessThan(calls.indexOf('lock-select'));
    expect(calls.indexOf('tx-begin')).toBeLessThan(calls.indexOf('insert-slot'));
  });

  it('inverted time range → BadRequest before any DB call', async () => {
    const { svc, calls } = makeService('ok');
    await expect(
      svc.createSlot(OWNER, 'VenueOwner', PITCH, {
        ...SLOT_DTO,
        start_time: '19:00',
        end_time: '18:00',
      } as never),
    ).rejects.toThrow(BadRequestException);
    expect(calls).not.toContain('tx-begin');
  });

  it('lost ownership race (lock select empty) → NotFoundException', async () => {
    const { svc } = makeService('ok', { lockEmpty: true });
    await expect(svc.createSlot(OWNER, 'VenueOwner', PITCH, SLOT_DTO as never)).rejects.toThrow(
      NotFoundException,
    );
  });
});
