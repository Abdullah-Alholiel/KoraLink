import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PgDialect } from 'drizzle-orm/pg-core';
import { ConversationsService } from './conversations.service';
import {
  conversations,
  conversation_participants,
  users,
} from '../../database/schema';

/**
 * P2-227 (run #149): the DM send is serialized — conversation lookup (FOR
 * UPDATE), membership proof, block checks, idempotency re-read and the INSERT
 * all run inside ONE transaction. The stub routes every read through the same
 * chain the tx callback sees (the tx surface IS the db surface here, mirroring
 * the app.gateway.spec.ts P2-220-twin stub pattern).
 */
describe('ConversationsService.sendMessage — tx serialization (P2-227, run #149)', () => {
  const SENDER_ROW = { id: 'u1', full_name: 'Ali', handle: 'ali', avatar_url: null };
  const MESSAGE_ROW = {
    id: 'm1',
    conversation_id: 'c1',
    sender_id: 'u1',
    content: 'hello',
    client_message_id: 'cid-1',
    created_at: new Date('2026-08-28T00:00:00Z'),
  };

  /** Thenable drizzle chain resolving to `rows` from any link. */
  function rowChain(rows: unknown[]) {
    const chain: any = { where: () => chain, limit: () => chain, for: () => chain };
    chain.then = (resolve: (v: unknown) => void) => resolve(rows);
    return chain;
  }

  function makeService(opts: {
    conversationExists?: boolean;
    participant?: unknown[];
    others?: unknown[];
    /** Result of the FIRST in-tx idempotency findFirst (fast path). */
    existing?: unknown | null;
    /** Result of the SECOND findFirst (lost-race winner re-read). */
    conflictWinner?: unknown | null;
    inserted?: unknown[];
    blocked?: boolean;
  }) {
    // Call-count-aware findFirst: call 1 = fast-path idempotency read,
    // call 2 = the in-tx lost-race winner re-read.
    let findFirstCall = 0;
    const findFirstResults: unknown[] = [
      'existing' in opts ? opts.existing : null,
      'conflictWinner' in opts ? opts.conflictWinner : null,
    ];

    const routedSelect = (sel: Record<string, unknown>) => ({
      from: (table: unknown) => {
        if (table === users) return rowChain([SENDER_ROW]); // sender view
        if (table === conversation_participants) {
          // "others" selects { user_id }; the membership probe selects { id }.
          if ('user_id' in (sel ?? {})) return rowChain(opts.others ?? []);
          return rowChain(opts.participant ?? [{ id: 'p1' }]);
        }
        if (table === conversations) {
          return rowChain(opts.conversationExists === false ? [] : [{ id: 'c1' }]);
        }
        return rowChain([]);
      },
    });

    const chain: any = {
      select: routedSelect,
      insert: jest.fn(() => {
        const insertChain: any = {
          values: () => insertChain,
          onConflictDoNothing: () => insertChain,
          returning: () => opts.inserted ?? [],
        };
        return insertChain;
      }),
      update: jest.fn(() => ({
        set: () => ({ where: () => Promise.resolve() }),
      })),
      query: {
        personal_messages: {
          findFirst: jest.fn(async () => {
            const result = findFirstResults[findFirstCall] ?? null;
            findFirstCall += 1;
            return result;
          }),
        },
      },
    };

    const db: any = {
      // The tx callback sees the SAME surface as the outer db stub.
      transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb(chain),
      select: chain.select,
      update: chain.update,
    };

    const assertNotBlockedBetweenMany = jest.fn(async () => {
      if (opts.blocked) {
        throw new ForbiddenException({
          message: 'You can no longer message this user.',
          code: 'BLOCKED_BY_RECIPIENT',
        });
      }
    });

    const activities = { record: jest.fn(async () => undefined) };
    const notifications = { sendPushToUsers: jest.fn(async () => 0) };
    const realtime = { isUserOnline: jest.fn(() => true) };

    const service = new ConversationsService(
      db,
      activities as never,
      notifications as never,
      realtime as never,
      { assertNotBlockedBetweenMany } as never,
    );
    return { service, db, chain, activities, notifications, realtime, assertNotBlockedBetweenMany };
  }

  it('happy path: inserts inside the tx and returns the message with its sender', async () => {
    const { service, chain, activities, assertNotBlockedBetweenMany } = makeService({
      inserted: [MESSAGE_ROW],
      others: [{ user_id: 'u2' }],
    });

    const result = await service.sendMessage('u1', 'c1', 'hello', 'cid-1');

    expect(result.id).toBe('m1');
    expect(result.sender.id).toBe('u1');
    expect(chain.insert).toHaveBeenCalled();
    // Block check ran inside the tx against the other participant (P2-241:
    // one set-based call carrying ALL other participant ids).
    expect(assertNotBlockedBetweenMany).toHaveBeenCalledWith('u1', ['u2']);
    // Side effects fire exactly once after commit.
    expect(activities.record).toHaveBeenCalledTimes(1);
  });

  // P2-241: the block gate is set-based — one call, ALL other participant
  // ids — so a future group conversation needs no loop and no N+1.
  it('block gate is set-based: one call carries every other participant id (P2-241)', async () => {
    const { service, chain, assertNotBlockedBetweenMany } = makeService({
      inserted: [MESSAGE_ROW],
      others: [{ user_id: 'u2' }, { user_id: 'u3' }, { user_id: 'u4' }],
    });

    await service.sendMessage('u1', 'c1', 'hello', 'cid-1');

    expect(assertNotBlockedBetweenMany).toHaveBeenCalledTimes(1);
    expect(assertNotBlockedBetweenMany).toHaveBeenCalledWith('u1', ['u2', 'u3', 'u4']);
    expect(chain.insert).toHaveBeenCalled();
  });

  it('unknown conversation → NotFoundException before any membership/insert work', async () => {
    const { service, chain } = makeService({ conversationExists: false });

    await expect(service.sendMessage('u1', 'missing', 'hello', 'cid-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(chain.insert).not.toHaveBeenCalled();
  });

  it('non-participant → ForbiddenException, nothing inserted', async () => {
    const { service, chain } = makeService({ participant: [] });

    await expect(service.sendMessage('u1', 'c1', 'hello', 'cid-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(chain.insert).not.toHaveBeenCalled();
  });

  it('block between sender and recipient → ForbiddenException, nothing inserted, no side effects', async () => {
    const { service, chain, activities } = makeService({
      blocked: true,
      others: [{ user_id: 'u2' }],
    });

    await expect(service.sendMessage('u1', 'c1', 'hello', 'cid-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(chain.insert).not.toHaveBeenCalled();
    expect(activities.record).not.toHaveBeenCalled();
  });

  it('idempotency fast-path (in-tx re-read) returns the original row with zero side effects', async () => {
    const { service, chain, activities, notifications, realtime } = makeService({
      existing: MESSAGE_ROW,
      others: [{ user_id: 'u2' }],
    });

    const result = await service.sendMessage('u1', 'c1', 'hello', 'cid-1');

    expect(result.id).toBe('m1');
    expect(result.sender.id).toBe('u1');
    expect(chain.insert).not.toHaveBeenCalled();
    // Side effects must NOT re-fire on a duplicate retry.
    expect(activities.record).not.toHaveBeenCalled();
    expect(notifications.sendPushToUsers).not.toHaveBeenCalled();
    expect(realtime.isUserOnline).not.toHaveBeenCalled();
  });

  it('lost race WITH a winner → returns the winner row, side effects skipped', async () => {
    const { service, activities } = makeService({
      existing: null,
      inserted: [],
      conflictWinner: MESSAGE_ROW,
      others: [{ user_id: 'u2' }],
    });

    const result = await service.sendMessage('u1', 'c1', 'hello', 'cid-1');

    expect(result.id).toBe('m1');
    expect(activities.record).not.toHaveBeenCalled();
  });

  it('lost race with NO winner → ConflictException (caller retries)', async () => {
    const { service } = makeService({ existing: null, inserted: [] });

    await expect(service.sendMessage('u1', 'c1', 'hello', 'cid-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('still inserts normally when no client_message_id is provided (find_first never runs)', async () => {
    const { service, chain } = makeService({ inserted: [MESSAGE_ROW] });

    const result = await service.sendMessage('u1', 'c1', 'hello');

    expect(result.id).toBe('m1');
    expect(chain.query.personal_messages.findFirst).not.toHaveBeenCalled();
  });
});

// ── P2-241 (Reviewer A run #153): listMessages pagination determinism ──
// Reference impl: listForUser (window-function total + id tiebreaker).
// listMessages now matches: ONE query, COUNT(*) OVER() rides the page rows,
// ORDER BY created_at DESC, id ASC.

describe('ConversationsService.listMessages — pagination (P2-241)', () => {
  const dialect = new PgDialect();

  function makeRawDb(rows: unknown[]) {
    const queries: string[] = [];
    const db = {
      execute: async (q: unknown) => {
        queries.push(dialect.sqlToQuery(q as never).sql);
        return rows;
      },
      // assertParticipant's membership probe rides the drizzle builder.
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [{ id: 'cp1' }],
          }),
        }),
      }),
    };
    return { db, queries };
  }

  const base = {
    id: 'm2',
    conversation_id: 'c1',
    content: 'hi',
    created_at: new Date('2026-10-01T00:00:00Z'),
    sender_id: 'u2',
    sender_name: 'Sara',
    sender_handle: 'sara',
    sender_avatar: null,
    total_count: 57,
  };
  // makeService's membership probe routes through select().from(conversation_participants)
  const svcDeps = {
    activities: { record: jest.fn(async () => undefined) },
    notifications: { sendPushToUsers: jest.fn(async () => 0) },
    realtime: { isUserOnline: jest.fn(() => true) },
    blocks: { assertNotBlockedBetweenMany: jest.fn(async () => undefined) },
  };

  it('total comes from the window function on the page rows (no second COUNT query)', async () => {
    const { db, queries } = makeRawDb([{ ...base }]);
    const service = new ConversationsService(
      db as never,
      svcDeps.activities as never,
      svcDeps.notifications as never,
      svcDeps.realtime as never,
      svcDeps.blocks as never,
    );
    const res = await service.listMessages('u1', 'c1', 1, 30);
    expect(res.total).toBe(57);
    expect(res.messages).toHaveLength(1);
    expect(res.hasMore).toBe(true); // offset 0 + 1 row < 57
    expect(queries).toHaveLength(1); // membership check is drizzle select; only ONE execute
    expect(queries[0]).toContain('COUNT(*) OVER()');
    expect(queries[0]).toContain('pm.id ASC');
  });

  it('rows are returned chronological ascending despite the DESC fetch', async () => {
    const r1 = { ...base, id: 'm1', created_at: new Date('2026-10-01T00:00:00Z') };
    const r2 = { ...base, id: 'm2', created_at: new Date('2026-10-01T00:01:00Z') };
    const { db } = makeRawDb([r2, r1]); // DESC fetch order
    const service = new ConversationsService(
      db as never,
      svcDeps.activities as never,
      svcDeps.notifications as never,
      svcDeps.realtime as never,
      svcDeps.blocks as never,
    );
    const res = await service.listMessages('u1', 'c1');
    expect(res.messages.map((m) => m.id)).toEqual(['m1', 'm2']);
  });

  it('empty page: total 0, hasMore false', async () => {
    const { db } = makeRawDb([]);
    const service = new ConversationsService(
      db as never,
      svcDeps.activities as never,
      svcDeps.notifications as never,
      svcDeps.realtime as never,
      svcDeps.blocks as never,
    );
    const res = await service.listMessages('u1', 'c1', 5, 30);
    expect(res.total).toBe(0);
    expect(res.messages).toEqual([]);
    expect(res.hasMore).toBe(false);
  });

  // PR-Agent r1 (PR #161): a beyond-end page returns no rows, so the window
  // count never materializes. The service must fall back to one degenerate
  // COUNT — total 0 is a lie for a conversation that still has messages.
  it('beyond-end page: falls back to a degenerate COUNT and reports the true total (PR-Agent r1)', async () => {
    const calls: string[] = [];
    const db = {
      execute: async (q: unknown) => {
        calls.push(dialect.sqlToQuery(q as never).sql);
        // call 1 = page query (no rows beyond the end), call 2 = fallback COUNT
        return calls.length === 1 ? [] : [{ total: 57 }];
      },
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [{ id: 'cp1' }],
          }),
        }),
      }),
    };
    const service = new ConversationsService(
      db as never,
      svcDeps.activities as never,
      svcDeps.notifications as never,
      svcDeps.realtime as never,
      svcDeps.blocks as never,
    );
    const res = await service.listMessages('u1', 'c1', 9, 30);
    expect(calls).toHaveLength(2);
    expect(res.total).toBe(57);
    expect(res.messages).toEqual([]);
    expect(res.hasMore).toBe(false);
  });
});
