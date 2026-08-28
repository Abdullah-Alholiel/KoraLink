import { ConflictException } from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import {
  conversation_participants,
  personal_messages,
  users,
} from '../../database/schema';

/**
 * `sendMessage` idempotency (P1-11): the DM send was a `findFirst`→`insert`
 * TOCTOU with no unique index on (sender_id, conversation_id, client_message_id),
 * so a concurrent retry could insert a duplicate. The insert is now guarded by
 * `onConflictDoNothing` against the partial unique index
 * `personal_messages_client_msg_uidx`, with a winner re-read when the insert
 * returns zero rows — mirroring `match_messages_client_msg_uidx`.
 */
describe('ConversationsService.sendMessage idempotency', () => {
  const SENDER_ROW = { id: 'u1', full_name: 'Ali', handle: 'ali', avatar_url: null };
  const MESSAGE_ROW = {
    id: 'm1',
    conversation_id: 'c1',
    sender_id: 'u1',
    content: 'hello',
    client_message_id: 'cid-1',
    created_at: new Date('2026-08-28T00:00:00Z'),
  };

  function rowChain(rows: unknown[]) {
    const chain: any = { where: () => chain, limit: () => chain };
    chain.then = (resolve: (v: unknown) => void) => resolve(rows);
    return chain;
  }

  function makeService(opts: {
    participant?: unknown[];
    others?: unknown[];
    existing?: unknown | null;
    inserted?: unknown[];
  }) {
    const db: any = {
      select: (sel: Record<string, unknown>) => ({
        from: (table: unknown) => {
          if (table === users) return rowChain([SENDER_ROW]);
          if (table === conversation_participants) {
            // isParticipant selects { id }; the "others" query selects { user_id }.
            if ('user_id' in (sel ?? {})) return rowChain(opts.others ?? []);
            return rowChain(opts.participant ?? [{ id: 'u1' }]);
          }
          return rowChain([]);
        },
      }),
      query: {
        personal_messages: {
          findFirst: jest.fn(async () => opts.existing ?? null),
        },
      },
      insert: jest.fn(() => {
        const chain: any = {
          values: () => chain,
          onConflictDoNothing: () => chain,
          returning: () => opts.inserted ?? [],
        };
        return chain;
      }),
      update: jest.fn(() => ({
        set: () => ({ where: () => Promise.resolve() }),
      })),
    };

    const activities = { record: jest.fn(async () => undefined) };
    const notifications = { sendPushToUsers: jest.fn(async () => 0) };
    const realtime = { isUserOnline: jest.fn(() => true) };

    const service = new ConversationsService(
      db,
      activities as never,
      notifications as never,
      realtime as never,
    );
    return { service, db, activities, notifications, realtime };
  }

  it('inserts and returns the message with its sender (happy path)', async () => {
    const { service, db, activities } = makeService({ inserted: [MESSAGE_ROW] });

    const result = await service.sendMessage('u1', 'c1', 'hello', 'cid-1');

    expect(result.id).toBe('m1');
    expect(result.sender.id).toBe('u1');
    // onConflictDoNothing was wired onto the insert.
    expect(db.insert).toHaveBeenCalled();
    expect(activities.record).toHaveBeenCalled();
  });

  it('returns the existing message on a sequential retry (fast-path, no duplicate insert)', async () => {
    const { service, db } = makeService({ existing: MESSAGE_ROW });

    const result = await service.sendMessage('u1', 'c1', 'hello', 'cid-1');

    expect(result.id).toBe('m1');
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('returns the winner row and skips side effects when the unique index swallows a concurrent retry', async () => {
    // First findFirst (fast-path) sees nothing, insert returns [] (conflict), the
    // winner re-read finds the row the other request inserted.
    const { service, activities, notifications, realtime } = makeService({
      existing: MESSAGE_ROW,
      inserted: [],
      others: [{ user_id: 'u2' }],
    });

    const result = await service.sendMessage('u1', 'c1', 'hello', 'cid-1');

    expect(result.id).toBe('m1');
    // Side effects must NOT re-fire on a duplicate retry.
    expect(activities.record).not.toHaveBeenCalled();
    expect(notifications.sendPushToUsers).not.toHaveBeenCalled();
    expect(realtime.isUserOnline).not.toHaveBeenCalled();
  });

  it('throws ConflictException when the insert loses the race and no winner row exists', async () => {
    const { service } = makeService({ existing: null, inserted: [] });

    await expect(service.sendMessage('u1', 'c1', 'hello', 'cid-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('still inserts normally when no client_message_id is provided', async () => {
    const { service, db } = makeService({ inserted: [MESSAGE_ROW] });

    const result = await service.sendMessage('u1', 'c1', 'hello');

    expect(result.id).toBe('m1');
    expect(db.query.personal_messages.findFirst).not.toHaveBeenCalled();
  });
});
