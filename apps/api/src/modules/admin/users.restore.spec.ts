import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AdminUsersService } from './users.service';
import { AuditService } from './audit.service';
import { RealtimeService } from '../gateway/realtime.service';

/**
 * P2-47(b) (run #167) — admin restore-on-behalf:
 *
 * PATCH /admin/users/:id/restore cancels a scheduled PDPL purge /
 * un-deletes a soft-deleted account inside its grace window.
 * Contract (owner decision 2026-10-25, option b):
 *   - 404 unknown id
 *   - 400 living/already-restored account (deleted_at IS NULL under the lock)
 *   - 409 hard-purged ghost (phone LIKE 'purged-%') — irreversible
 *   - happy path: deleted_at nulled + audited (user.restore) + ops broadcast
 * All state checks run under the row FOR UPDATE lock inside ONE tx, so a
 * concurrent self-restore or purge tick serializes; the loser gets the
 * explicit rejection instead of a double write.
 */
describe('AdminUsersService.restoreByAdmin — P2-47(b) contract (run #167)', () => {
  const USER_ID = 'user-restore-1';
  const ADMIN_ID = 'admin-restore-1';

  type TxCall =
    | { kind: 'lock'; sql: string }
    | { kind: 'update'; set: Record<string, unknown> }
    | { kind: 'audit'; action: string };

  function makeService(opts: {
    /** Row returned by the FOR UPDATE select. Null = unknown id. */
    row: { deleted_at: Date | null; phone: string } | null;
    /** Fail the audit write (must roll the restore back with it). */
    auditThrows?: boolean;
    /** Fail the UPDATE (tx aborts; service must surface the raw error). */
    updateThrows?: boolean;
  }) {
    const calls: TxCall[] = [];
    let rolledBack = false;

    const tx = {
      execute: async (query: { sql?: unknown; queryChunks?: unknown[] }) => {
        calls.push({ kind: 'lock', sql: String(query.sql ?? query.queryChunks ?? 'lock') });
        return [opts.row] as unknown;
      },
      update: () => ({
        set: (set: Record<string, unknown>) => ({
          where: async () => {
            if (opts.updateThrows) throw new Error('update failed');
            calls.push({ kind: 'update', set });
            return undefined;
          },
        }),
      }),
    };

    const audit = {
      log: async (entry: { action: string }, executor?: unknown) => {
        if (!executor) throw new Error('audit MUST ride the tx (executor required)');
        if (opts.auditThrows) throw new Error('audit failed');
        calls.push({ kind: 'audit', action: entry.action });
      },
    };

    const realtime = { broadcastOps: (_: string) => undefined };

    const db = {
      transaction: async (fn: (t: typeof tx) => Promise<void>) => {
        try {
          await fn(tx);
        } catch (err) {
          rolledBack = true;
          throw err;
        }
      },
    };

    const service = new AdminUsersService(
      db as never,
      audit as unknown as AuditService,
      realtime as unknown as RealtimeService,
      {} as never,
      {} as never,
    );

    return { service, calls, rolledBack: () => rolledBack };
  }

  it('happy path: soft-deleted grace-window row → deleted_at nulled, audited on the tx, ops broadcast', async () => {
    const { service, calls, rolledBack } = makeService({
      row: { deleted_at: new Date('2026-10-20T00:00:00Z'), phone: '+966500000009' },
    });

    const res = await service.restoreByAdmin(USER_ID, ADMIN_ID, '10.0.0.9');

    expect(res).toEqual({ message: 'Account restored.' });
    expect(rolledBack()).toBe(false);
    const update = calls.find((c) => c.kind === 'update') as { set: Record<string, unknown> };
    expect(update.set.deleted_at).toBeNull();
    const audit = calls.find((c) => c.kind === 'audit') as { action: string };
    expect(audit.action).toBe('user.restore');
    // audit AFTER the write inside the same tx
    expect(calls.findIndex((c) => c.kind === 'update')).toBeLessThan(
      calls.findIndex((c) => c.kind === 'audit'),
    );
  });

  it('404 when the id is unknown', async () => {
    const { service } = makeService({ row: null });
    await expect(service.restoreByAdmin('nope', ADMIN_ID)).rejects.toThrow(NotFoundException);
  });

  it('400 when the account is living or already restored (deleted_at IS NULL under the lock)', async () => {
    const { service, calls } = makeService({ row: { deleted_at: null, phone: '+966500000009' } });
    await expect(service.restoreByAdmin(USER_ID, ADMIN_ID)).rejects.toThrow(BadRequestException);
    // the guard fires BEFORE any write/audit
    expect(calls.some((c) => c.kind === 'update')).toBe(false);
  });

  it('409 hard-purged ghost — irreversible (phone purged-%)', async () => {
    const { service, calls } = makeService({
      row: { deleted_at: new Date('2026-09-01T00:00:00Z'), phone: 'purged-abc123def456' },
    });
    await expect(service.restoreByAdmin(USER_ID, ADMIN_ID)).rejects.toThrow(ConflictException);
    expect(calls.some((c) => c.kind === 'update')).toBe(false);
  });

  it('409 past the erasure deadline — a delayed purge cron must not extend the window (PR-Agent r1)', async () => {
    // deleted_at 31 days ago: past deleted_at + PDPL_GRACE_DAYS even though
    // the row was never anonymized (cron delayed/failed).
    const { service, calls } = makeService({
      row: {
        deleted_at: new Date(Date.now() - 31 * 86_400_000),
        phone: '+966500000009',
      },
    });
    await expect(service.restoreByAdmin(USER_ID, ADMIN_ID)).rejects.toThrow(ConflictException);
    expect(calls.some((c) => c.kind === 'update')).toBe(false);
  });

  it('audit failure rolls the restore back (one atomic unit)', async () => {
    const { service, rolledBack } = makeService({
      row: { deleted_at: new Date('2026-10-20T00:00:00Z'), phone: '+966500000009' },
      auditThrows: true,
    });
    await expect(service.restoreByAdmin(USER_ID, ADMIN_ID)).rejects.toThrow('audit failed');
    expect(rolledBack()).toBe(true);
  });
});
