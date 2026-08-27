import { BadRequestException } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { reports, users } from '../../database/schema';

/**
 * `create` dedup TOCTOU guard: the open/reviewing report dedup was a
 * select-then-insert outside any transaction with no unique index, so
 * concurrent duplicate submits could both pass the check. The insert is now
 * guarded by `onConflictDoNothing` against a partial unique index on
 * (reporter_id, subject_type, subject_id) WHERE status IN ('open','reviewing').
 */
describe('ReportsService.create dedup', () => {
  function selectChain(rows: unknown[]) {
    const chain: any = { where: () => chain, limit: () => chain };
    chain.then = (resolve: (v: unknown) => void) => resolve(rows);
    return chain;
  }

  function insertChain(returningRows: unknown[]) {
    const chain: any = {
      values: () => chain,
      onConflictDoNothing: () => chain,
      returning: () => returningRows,
    };
    return chain;
  }

  function makeService(opts: { existing: unknown[]; inserted: unknown[] }) {
    const db = {
      select: () => ({
        from: (table: unknown) => {
          // assertSubjectExists probes `users`; the dedup check probes `reports`.
          if (table === users) return selectChain([{ id: 'u2' }]);
          if (table === reports) return selectChain(opts.existing);
          return selectChain([]);
        },
      }),
      insert: jest.fn(() => insertChain(opts.inserted)),
    };
    return new ReportsService(db as never);
  }

  const DTO = { subjectType: 'user', subjectId: 'u2', reason: 'spam' } as never;

  it('throws BadRequest when a duplicate open report already exists (fast-path)', async () => {
    const svc = makeService({ existing: [{ id: 'r1' }], inserted: [] });
    await expect(svc.create('u1', DTO)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns the report when the insert succeeds', async () => {
    const svc = makeService({ existing: [], inserted: [{ id: 'r2', status: 'open' }] });
    const result = await svc.create('u1', DTO);
    expect(result.id).toBe('r2');
  });

  it('throws BadRequest when the unique index swallows a concurrent duplicate (insert returns nothing)', async () => {
    const svc = makeService({ existing: [], inserted: [] });
    await expect(svc.create('u1', DTO)).rejects.toBeInstanceOf(BadRequestException);
  });
});
