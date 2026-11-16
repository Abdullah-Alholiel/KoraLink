import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MatchesService } from './matches.service';
import { CHAT_CLOSED_ERROR_CODE } from './chat-status.predicate';
import { match_players, matches } from '../../database/schema';

/**
 * P2-111 (run #81) + P2-220 (run #146): the match-chat terminal-status
 * predicate, now enforced INSIDE the send transaction.
 *
 * REST `sendMessage` and the WS `send-message` handler must BOTH reject
 * messages once a match is terminal (Completed/Cancelled) or has run past
 * its scheduled end while not actively in progress. The shared predicate
 * lives in chat-status.predicate.ts; these specs pin its behavior on the
 * REST surface (the gateway spec pins the WS surface) and the exact
 * Forbidden body that carries the stable machine code the PWA localizes.
 *
 * P2-220 (run #146) tightened the REST path: membership + chat-closed now
 * share ONE transaction with `SELECT … FOR UPDATE` on the match row, so a
 * concurrent complete/cancel can no longer slip a message in between the
 * check and the INSERT. An unknown match now 404s (previously it skipped the
 * guard and died on the FK as a 500). Idempotent retries reconcile BEFORE the
 * chat-closed guard so a terminal-race retry still returns the original row
 * (P2-172 offline-queue reconcile contract).
 */

const MATCH_ID = 'match-1';
const USER = 'user-1';
const FUTURE = new Date(Date.now() + 3_600_000);
const LONG_PAST = new Date(Date.now() - 6 * 3_600_000);

type EventLog = string[];

/**
 * DB stub routed by table: match_players → membership, matches → matchRow,
 * match_messages inserts → returning, query.findFirst → idempotency source.
 * `transaction(fn)` invokes fn with the same routed surface (the tx handle
 * IS the stub), recording `tx:` events so specs can pin what ran inside.
 */
function makeDb(
  matchRow: unknown,
  opts: { existingByIdem?: unknown; events?: EventLog } = {},
) {
  const events = opts.events ?? [];
  const rowsFor = (table: unknown) => {
    if (table === match_players) return [{ id: 'mp-1' }];
    if (table === matches) return matchRow ? [matchRow] : [];
    return [];
  };
  const makeSelect = (rows: unknown[], label: string) => {
    const chain: any = {};
    chain.where = () => chain;
    chain.limit = () => chain;
    chain.for = (mode: string) => {
      events.push(`tx:lock:${label}:${mode}`);
      return chain;
    };
    chain.then = (resolve: (v: unknown) => void) => resolve(rows);
    return chain;
  };
  const surface = () => ({
    select: () => ({
      from: (table: unknown) => {
        if (table === matches) return makeSelect(rowsFor(table), 'match');
        return makeSelect(rowsFor(table), 'other');
      },
    }),
    insert: () => ({
      values: () => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            events.push('tx:insert');
            return [
              { id: 'msg-1', match_id: MATCH_ID, user_id: USER, content: 'hello' },
            ];
          },
        }),
      }),
    }),
    query: {
      match_messages: {
        findFirst: async () => opts.existingByIdem ?? undefined,
      },
    },
  });
  const outer = surface() as any;
  outer.transaction = async (fn: (tx: unknown) => unknown) => fn(surface());
  return outer;
}

function makeService(db: unknown) {
  return new MatchesService(
    db as never,
    {} as never,
    { broadcastRosterUpdate: () => {}, broadcastStatusUpdate: () => {} } as never,
    { sendPushToUsers: async () => {} } as never,
    { record: async () => {} } as never,
    { getNumber: async () => 0 } as never,
    { broadcastOps: () => {} } as never,
    { promoteNextInTx: async () => null } as never,
  );
}

async function rejectionOf(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (err) {
    return err as Error;
  }
  throw new Error('expected the sendMessage call to reject');
}

describe('Match chat terminal-status predicate (P2-111, tx-guarded run #146)', () => {
  it('accepts a message for a live future match (happy path unchanged)', async () => {
    const svc = makeService(makeDb({ status: 'Open', scheduled_at: FUTURE, duration_mins: 90 }));
    const msg = await svc.sendMessage(USER, MATCH_ID, 'hello');
    expect(msg).toMatchObject({ id: 'msg-1', content: 'hello' });
  });

  it('accepts a message for an InProgress match that ran past its end (overtime stays open)', async () => {
    const svc = makeService(
      makeDb({ status: 'InProgress', scheduled_at: LONG_PAST, duration_mins: 90 }),
    );
    const msg = await svc.sendMessage(USER, MATCH_ID, 'gg');
    expect(msg).toMatchObject({ id: 'msg-1' });
  });

  it('rejects a message once the match is Completed (Forbidden + stable code)', async () => {
    const svc = makeService(
      makeDb({ status: 'Completed', scheduled_at: FUTURE, duration_mins: 90 }),
    );
    const err = await rejectionOf(svc.sendMessage(USER, MATCH_ID, 'late'));
    expect(err).toBeInstanceOf(ForbiddenException);
    expect((err as ForbiddenException).getResponse()).toMatchObject({
      code: CHAT_CLOSED_ERROR_CODE,
    });
  });

  it('rejects a message once the match is Cancelled (Forbidden + stable code)', async () => {
    const svc = makeService(
      makeDb({ status: 'Cancelled', scheduled_at: FUTURE, duration_mins: 90 }),
    );
    const err = await rejectionOf(svc.sendMessage(USER, MATCH_ID, 'late'));
    expect(err).toBeInstanceOf(ForbiddenException);
    expect((err as ForbiddenException).getResponse()).toMatchObject({
      code: CHAT_CLOSED_ERROR_CODE,
    });
  });

  it('rejects a message for an Open match long past its scheduled end (expired)', async () => {
    const svc = makeService(
      makeDb({ status: 'Open', scheduled_at: LONG_PAST, duration_mins: 90 }),
    );
    const err = await rejectionOf(svc.sendMessage(USER, MATCH_ID, 'late'));
    expect(err).toBeInstanceOf(ForbiddenException);
    expect((err as ForbiddenException).getResponse()).toMatchObject({
      code: CHAT_CLOSED_ERROR_CODE,
    });
  });

  it('404s an unknown match (was: skipped the guard and FK-500ed)', async () => {
    const svc = makeService(makeDb(null));
    const err = await rejectionOf(svc.sendMessage(USER, MATCH_ID, 'hello'));
    expect(err).toBeInstanceOf(NotFoundException);
    expect((err as NotFoundException).message).toContain('not found');
  });

  it('serializes: the chat-closed state is read under FOR UPDATE inside the tx, before the insert', async () => {
    const events: EventLog = [];
    const svc = makeService(
      makeDb({ status: 'Open', scheduled_at: FUTURE, duration_mins: 90 }, { events }),
    );
    await svc.sendMessage(USER, MATCH_ID, 'hello');
    const lockIdx = events.findIndex((e) => e === 'tx:lock:match:update');
    const insertIdx = events.findIndex((e) => e === 'tx:insert');
    expect(lockIdx).toBeGreaterThanOrEqual(0);
    expect(insertIdx).toBeGreaterThan(lockIdx);
  });

  it('reconciles an idempotent retry BEFORE the closed-chat guard (terminal-race retry returns the original row)', async () => {
    const events: EventLog = [];
    const existing = {
      id: 'msg-0',
      match_id: MATCH_ID,
      user_id: USER,
      content: 'first',
      user: { id: USER, full_name: 'U', handle: 'u', avatar_url: null },
    };
    const svc = makeService(
      makeDb(
        { status: 'Completed', scheduled_at: FUTURE, duration_mins: 90 },
        { events, existingByIdem: existing },
      ),
    );
    const msg = await svc.sendMessage(USER, MATCH_ID, 'first', 'cid-1');
    expect(msg).toMatchObject({ id: 'msg-0' });
    // The tx never opened: no lock event, no insert — the retry reconciled.
    expect(events.some((e) => e.startsWith('tx:lock'))).toBe(false);
    expect(events.some((e) => e === 'tx:insert')).toBe(false);
  });
});
