import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { BlocksService, BLOCKED_BY_RECIPIENT } from './blocks.service';
import { ConversationsService } from '../conversations/conversations.service';
import {
  conversation_participants,
  personal_messages,
  user_blocks,
  users,
} from '../../database/schema';

/**
 * P1-53: user blocks. The drizzle db is replaced by an in-memory fake that
 * holds a `user_blocks` row set; where-clauses are not interpreted, so the
 * fake filters by the ids the service was called with (tracked per call).
 */
type BlockRow = { blocker_id: string; blocked_id: string; created_at: Date };

function rowChain(rows: () => unknown[]) {
  const chain: any = {
    where: () => chain,
    limit: () => chain,
    orderBy: () => chain,
  };
  chain.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
    try {
      resolve(rows());
    } catch (e) {
      reject(e);
    }
  };
  return chain;
}

function makeFakeDb(opts: { existingUsers: string[]; blocks?: BlockRow[] }) {
  const blocks: BlockRow[] = opts.blocks ?? [];
  // The service always queries in the context of a (a, b) pair or a single
  // user; `ctx` is set by the test helpers before each call.
  const ctx: { a?: string; b?: string; either?: boolean; userId?: string } = {};
  let clock = Date.parse('2026-10-01T00:00:00Z');

  const db: any = {
    select: () => ({
      from: (table: unknown) => {
        if (table === users) {
          return rowChain(() => (opts.existingUsers.includes(ctx.b ?? '') ? [{ id: ctx.b }] : []));
        }
        if (table === user_blocks) {
          return rowChain(() => {
            if (ctx.userId) {
              return blocks
                .filter((r) => r.blocker_id === ctx.userId)
                .sort((x, y) => y.created_at.getTime() - x.created_at.getTime());
            }
            return blocks.filter(
              (r) =>
                (r.blocker_id === ctx.a && r.blocked_id === ctx.b) ||
                (!!ctx.either && r.blocker_id === ctx.b && r.blocked_id === ctx.a),
            );
          });
        }
        return rowChain(() => []);
      },
    }),
    insert: jest.fn(() => {
      let values: { blocker_id: string; blocked_id: string };
      const chain: any = {
        values: (v: typeof values) => {
          values = v;
          return chain;
        },
        onConflictDoNothing: () => chain,
        returning: async () => {
          const dup = blocks.some(
            (r) => r.blocker_id === values.blocker_id && r.blocked_id === values.blocked_id,
          );
          if (dup) return [];
          clock += 1000;
          const row = { ...values, created_at: new Date(clock) };
          blocks.push(row);
          return [row];
        },
      };
      return chain;
    }),
    delete: jest.fn(() => {
      const chain: any = {
        where: () => chain,
        returning: async () => {
          const i = blocks.findIndex((r) => r.blocker_id === ctx.a && r.blocked_id === ctx.b);
          if (i >= 0) {
            blocks.splice(i, 1);
            return [{ blocked_id: ctx.b }];
          }
          return [];
        },
      };
      return chain;
    }),
  };
  return { db, blocks, ctx };
}

function makeBlocks(opts: { existingUsers: string[]; blocks?: BlockRow[] }) {
  const fake = makeFakeDb(opts);
  const service = new BlocksService(fake.db);
  const { ctx } = fake;
  const reset = () => {
    delete ctx.a;
    delete ctx.b;
    delete ctx.either;
    delete ctx.userId;
  };
  return {
    ...fake,
    service,
    block: (a: string, b: string) => (reset(), Object.assign(ctx, { a, b }), service.block(a, b)),
    unblock: (a: string, b: string) => (reset(), Object.assign(ctx, { a, b }), service.unblock(a, b)),
    status: (a: string, b: string) =>
      (reset(), Object.assign(ctx, { a, b }), service.isBlockedBy(a, b)),
    list: (userId: string) => (reset(), Object.assign(ctx, { userId }), service.listBlocked(userId)),
    assertBetween: (a: string, b: string) => (
      reset(), Object.assign(ctx, { a, b, either: true }), service.assertNotBlockedBetween(a, b)
    ),
  };
}

describe('BlocksService', () => {
  it('block: returns { blockedId, createdAt } with an ISO timestamp', async () => {
    const h = makeBlocks({ existingUsers: ['u1', 'u2'] });

    const result = await h.block('u1', 'u2');

    expect(result).toEqual({ blockedId: 'u2', createdAt: expect.any(String) });
    expect(new Date(result.createdAt).toISOString()).toBe(result.createdAt);
    expect(h.blocks).toHaveLength(1);
  });

  it('block: self-block → BadRequestException (no insert)', async () => {
    const h = makeBlocks({ existingUsers: ['u1'] });

    await expect(h.block('u1', 'u1')).rejects.toBeInstanceOf(BadRequestException);
    expect(h.db.insert).not.toHaveBeenCalled();
  });

  it('block: missing target user → NotFoundException (no insert)', async () => {
    const h = makeBlocks({ existingUsers: ['u1'] });

    await expect(h.block('u1', 'ghost')).rejects.toBeInstanceOf(NotFoundException);
    expect(h.db.insert).not.toHaveBeenCalled();
  });

  it('block: duplicate block is idempotent (same row, same createdAt)', async () => {
    const h = makeBlocks({ existingUsers: ['u1', 'u2'] });

    const first = await h.block('u1', 'u2');
    const second = await h.block('u1', 'u2');

    expect(second).toEqual(first);
    expect(h.blocks).toHaveLength(1);
  });

  it('unblock: idempotent — removed flag distinguishes a real delete (P2-161 rider)', async () => {
    const h = makeBlocks({ existingUsers: ['u1', 'u2'] });
    await h.block('u1', 'u2');

    await expect(h.unblock('u1', 'u2')).resolves.toEqual({ blocked: false, removed: true });
    await expect(h.unblock('u1', 'u2')).resolves.toEqual({ blocked: false, removed: false });
    expect(h.blocks).toHaveLength(0);
  });

  it('status: true while blocked, false after unblock, directional', async () => {
    const h = makeBlocks({ existingUsers: ['u1', 'u2'] });
    await h.block('u1', 'u2');

    await expect(h.status('u1', 'u2')).resolves.toBe(true);
    await expect(h.status('u2', 'u1')).resolves.toBe(false);

    await h.unblock('u1', 'u2');
    await expect(h.status('u1', 'u2')).resolves.toBe(false);
  });

  it('listBlocked: newest first', async () => {
    const h = makeBlocks({ existingUsers: ['u1', 'u2', 'u3'] });
    await h.block('u1', 'u2');
    await h.block('u1', 'u3');

    const list = await h.list('u1');

    expect(list.map((b) => b.blockedId)).toEqual(['u3', 'u2']);
  });

  it('assertNotBlockedBetween: throws 403 BLOCKED_BY_RECIPIENT in either direction', async () => {
    const h = makeBlocks({ existingUsers: ['u1', 'u2'] });
    await h.block('u2', 'u1');

    for (const [a, b] of [
      ['u1', 'u2'],
      ['u2', 'u1'],
    ]) {
      const err = await h.assertBetween(a, b).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ForbiddenException);
      const body = (err as ForbiddenException).getResponse() as { code: string; message: string };
      expect(body.code).toBe(BLOCKED_BY_RECIPIENT);
      expect(body.message).toBe('You can no longer message this user.');
    }
  });
});

describe('ConversationsService.sendMessage × blocks (P1-53)', () => {
  const SENDER_ROW = { id: 'u1', full_name: 'Ali', handle: 'ali', avatar_url: null };
  const MESSAGE_ROW = {
    id: 'm1',
    conversation_id: 'c1',
    sender_id: 'u1',
    content: 'hello',
    client_message_id: null,
    created_at: new Date('2026-10-01T00:00:00Z'),
  };

  function makeConversations() {
    const blocksHarness = makeBlocks({ existingUsers: ['u1', 'u2'] });
    // Every sendMessage block check is u1 ↔ u2 in either direction.
    const blocksService = {
      assertNotBlockedBetween: (a: string, b: string) => blocksHarness.assertBetween(a, b),
    };

    const simple = (rows: unknown[]) => rowChain(() => rows);
    const db: any = {
      select: (sel: Record<string, unknown>) => ({
        from: (table: unknown) => {
          if (table === users) return simple([SENDER_ROW]);
          if (table === conversation_participants) {
            if ('user_id' in (sel ?? {})) return simple([{ user_id: 'u2' }]);
            return simple([{ id: 'cp1' }]);
          }
          return simple([]);
        },
      }),
      query: { personal_messages: { findFirst: jest.fn(async () => null) } },
      insert: jest.fn((table: unknown) => {
        expect(table).toBe(personal_messages);
        const chain: any = {
          values: () => chain,
          onConflictDoNothing: () => chain,
          returning: () => [MESSAGE_ROW],
        };
        return chain;
      }),
      update: jest.fn(() => ({ set: () => ({ where: () => Promise.resolve() }) })),
    };

    const service = new ConversationsService(
      db,
      { record: jest.fn(async () => undefined) } as never,
      { sendPushToUsers: jest.fn(async () => 0) } as never,
      { isUserOnline: jest.fn(() => true) } as never,
      blocksService as never,
    );
    return { service, db, blocksHarness };
  }

  it('blocked DM send → 403 carrying BLOCKED_BY_RECIPIENT, nothing inserted', async () => {
    const { service, db, blocksHarness } = makeConversations();
    await blocksHarness.block('u2', 'u1'); // recipient blocked the sender

    const err = await service.sendMessage('u1', 'c1', 'hello').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ForbiddenException);
    expect(((err as ForbiddenException).getResponse() as { code: string }).code).toBe(
      BLOCKED_BY_RECIPIENT,
    );
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('send succeeds again after unblock', async () => {
    const { service, db, blocksHarness } = makeConversations();
    await blocksHarness.block('u1', 'u2'); // sender blocked the recipient
    await expect(service.sendMessage('u1', 'c1', 'hello')).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    await blocksHarness.unblock('u1', 'u2');
    const result = await service.sendMessage('u1', 'c1', 'hello');

    expect(result.id).toBe('m1');
    expect(db.insert).toHaveBeenCalledTimes(1);
  });
});
