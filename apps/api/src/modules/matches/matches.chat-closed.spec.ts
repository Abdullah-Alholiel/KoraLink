import { ForbiddenException } from '@nestjs/common';
import { MatchesService } from './matches.service';
import { CHAT_CLOSED_ERROR_CODE } from './chat-status.predicate';
import { match_players, matches } from '../../database/schema';

/**
 * P2-111 (run #81): the match-chat terminal-status predicate.
 *
 * REST `sendMessage` and the WS `send-message` handler must BOTH reject
 * messages once a match is terminal (Completed/Cancelled) or has run past
 * its scheduled end while not actively in progress. The shared predicate
 * lives in chat-status.predicate.ts; these specs pin its behavior on the
 * REST surface (the gateway spec pins the WS surface) and the exact
 * Forbidden body that carries the stable machine code the PWA localizes.
 */

const MATCH_ID = 'match-1';
const USER = 'user-1';
const FUTURE = new Date(Date.now() + 3_600_000);
const LONG_PAST = new Date(Date.now() - 6 * 3_600_000);

/** DB stub routed by table: match_players → membership, matches → matchRow,
 * match_messages inserts → returning, query.findFirst → undefined. */
function makeDb(matchRow: unknown) {
  return {
    select: () => ({
      from: (table: unknown) => {
        const chain: any = { where: () => chain, limit: () => chain };
        chain.then = (resolve: (v: unknown) => void) => {
          if (table === match_players) resolve([{ id: 'mp-1' }]);
          else if (table === matches) resolve(matchRow ? [matchRow] : []);
          else resolve([]);
        };
        return chain;
      },
    }),
    insert: () => ({
      values: () => ({
        onConflictDoNothing: () => ({
          returning: async () => [
            { id: 'msg-1', match_id: MATCH_ID, user_id: USER, content: 'hello' },
          ],
        }),
      }),
    }),
    query: { match_messages: { findFirst: async () => undefined } },
  };
}

function makeService(matchRow: unknown) {
  return new MatchesService(
    makeDb(matchRow) as never,
    {} as never,
    { broadcastRosterUpdate: () => {}, broadcastStatusUpdate: () => {} } as never,
    { sendPushToUsers: async () => {} } as never,
    { record: async () => {} } as never,
    { getNumber: async () => 0 } as never,
    { broadcastOps: () => {} } as never,
    { promoteNextInTx: async () => null } as never,
  );
}

async function rejectionOf(promise: Promise<unknown>): Promise<ForbiddenException> {
  try {
    await promise;
  } catch (err) {
    return err as ForbiddenException;
  }
  throw new Error('expected the sendMessage call to reject');
}

describe('Match chat terminal-status predicate (P2-111, run #81)', () => {
  it('accepts a message for a live future match (happy path unchanged)', async () => {
    const svc = makeService({ status: 'Open', scheduled_at: FUTURE, duration_mins: 90 });
    const msg = await svc.sendMessage(USER, MATCH_ID, 'hello');
    expect(msg).toMatchObject({ id: 'msg-1', content: 'hello' });
  });

  it('accepts a message for an InProgress match that ran past its end (overtime stays open)', async () => {
    const svc = makeService({ status: 'InProgress', scheduled_at: LONG_PAST, duration_mins: 90 });
    const msg = await svc.sendMessage(USER, MATCH_ID, 'gg');
    expect(msg).toMatchObject({ id: 'msg-1' });
  });

  it('rejects a message once the match is Completed (Forbidden + stable code)', async () => {
    const svc = makeService({ status: 'Completed', scheduled_at: FUTURE, duration_mins: 90 });
    const err = await rejectionOf(svc.sendMessage(USER, MATCH_ID, 'late'));
    expect(err).toBeInstanceOf(ForbiddenException);
    expect((err as ForbiddenException).getResponse()).toMatchObject({
      code: CHAT_CLOSED_ERROR_CODE,
    });
  });

  it('rejects a message once the match is Cancelled (Forbidden + stable code)', async () => {
    const svc = makeService({ status: 'Cancelled', scheduled_at: FUTURE, duration_mins: 90 });
    const err = await rejectionOf(svc.sendMessage(USER, MATCH_ID, 'late'));
    expect(err).toBeInstanceOf(ForbiddenException);
    expect((err as ForbiddenException).getResponse()).toMatchObject({
      code: CHAT_CLOSED_ERROR_CODE,
    });
  });

  it('rejects a message for an Open match long past its scheduled end (expired)', async () => {
    const svc = makeService({ status: 'Open', scheduled_at: LONG_PAST, duration_mins: 90 });
    const err = await rejectionOf(svc.sendMessage(USER, MATCH_ID, 'late'));
    expect(err).toBeInstanceOf(ForbiddenException);
    expect((err as ForbiddenException).getResponse()).toMatchObject({
      code: CHAT_CLOSED_ERROR_CODE,
    });
  });

  it('keeps chat open when the matches row is missing entirely (fail open, no false 403)', async () => {
    const svc = makeService(null);
    const msg = await svc.sendMessage(USER, MATCH_ID, 'hello');
    expect(msg).toMatchObject({ id: 'msg-1' });
  });
});
