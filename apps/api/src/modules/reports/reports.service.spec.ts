import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { personal_messages, reports, users } from '../../database/schema';

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

/**
 * P1-31 (run #18): `message` subject type — a chat message becomes reportable.
 * Rules: cannot report your OWN message; subject must exist; mine-list label
 * resolves to "Message from <sender>" instead of the raw message id.
 */
describe('ReportsService message subjects (P1-31)', () => {
  function makeService(opts: {
    messageRow?: { id: string; sender_id: string } | null;
    existing?: unknown[];
    inserted?: unknown[];
    senderRow?: Array<{ full_name: string | null }>;
  }) {
    const selectChain = (rows: unknown[]) => {
      const chain: any = {
        where: () => chain,
        leftJoin: () => chain,
        orderBy: () => chain,
        limit: () => chain,
      };
      chain.then = (resolve: (v: unknown) => void) => resolve(rows);
      return chain;
    };
    const insertChain = (returningRows: unknown[]) => {
      const chain: any = {
        values: () => chain,
        onConflictDoNothing: () => chain,
        returning: () => returningRows,
      };
      return chain;
    };
    const db = {
      select: () => ({
        from: (table: unknown) => {
          if (table === personal_messages)
            return selectChain(opts.messageRow ? [opts.messageRow] : []);
          if (table === users) return selectChain(opts.senderRow ? [opts.senderRow] : []);
          if (table === reports) return selectChain(opts.existing ?? []);
          return selectChain([]);
        },
      }),
      insert: jest.fn(() => insertChain(opts.inserted ?? [])),
    };
    return new ReportsService(db as never);
  }

  const MSG_DTO = { subjectType: 'message', subjectId: 'pm1', reason: 'abuse' } as never;

  it('rejects reporting your own message', async () => {
    const svc = makeService({ messageRow: { id: 'pm1', sender_id: 'u1' } });
    await expect(svc.create('u1', MSG_DTO)).rejects.toThrow('You cannot report your own message.');
  });

  it('404s when the reported message does not exist', async () => {
    const svc = makeService({ messageRow: null });
    await expect(svc.create('u1', MSG_DTO)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('creates a message report against someone else’s message', async () => {
    const svc = makeService({
      messageRow: { id: 'pm1', sender_id: 'u2' },
      inserted: [{ id: 'r9', status: 'open' }],
    });
    const result = await svc.create('u1', MSG_DTO);
    expect(result.id).toBe('r9');
  });

  it('labels a message report after its sender, not the raw id (mine-list)', async () => {
    const svc = makeService({
      existing: [
        {
          id: 'r1',
          subject_type: 'message',
          subject_id: 'pm1',
          reason: 'abuse',
          status: 'open',
          resolution: null,
          resolved_at: null,
          created_at: new Date(),
          user_name: null,
          match_title: null,
          venue_name: null,
          message_sender_name: 'Salem',
        },
      ],
    });
    const result = await svc.listMine('u1');
    expect(result.reports).toHaveLength(1);
    expect(result.reports[0].subject_label).toBe('Message from Salem');
  });
});
