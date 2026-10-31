/**
 * Partner email lane (run #165, P2-214 expansion): the venue OWNER gets an
 * email when a match at their venue is cancelled (staff/pitch planning; the
 * players get their pushes in the same post-commit block — never re-tested
 * here, matches.money-notify.spec.ts owns those). The email rides the
 * EXISTING `match_cancelled_admin` template (audience: "this session was
 * dropped") with a Riyadh-local `when` + venue-name `where` details box.
 * Best-effort contract: ANY failure in the owner-email path (owner resolve
 * throw, mailer absence, mailer rejection) must never fail the cancel.
 */
process.env.TZ = 'UTC';

import { MatchesService } from './matches.service';
import { matches, match_players, users, transactions, pitch_slots } from '../../database/schema';

const HOST = 'host-1';
const OWNER = 'venue-owner-1';
const MATCH_ID = 'match-1';

interface MailRec {
  ids: string[];
  template: string;
  vars?: Record<string, unknown>;
  details?: Record<string, unknown>;
}

function thenable(): { then: (r: (v: unknown) => void) => void } {
  return { then: (r: (v: unknown) => void) => r([]) };
}

function makeHarness(opts: {
  match?: Record<string, unknown> | null;
  ownerRow?: Array<{ owner_id: string; venue_name: string | null }>;
  mailer?: { sendToUsers: (ids: string[], t: string, v: unknown, d: unknown) => Promise<unknown> };
  /** Pass NO mailer at all (legacy 8-arg construction). */
  mailerAbsent?: boolean;
  executeThrows?: boolean;
}) {
  const pushes: Array<{ users: string[]; key?: string }> = [];
  const mails: MailRec[] = [];
  const notificationsService = {
    sendPushToUsers: async (usersArg: string[], p: { key?: string }) => {
      pushes.push({ users: usersArg, key: p.key });
    },
  };
  const activitiesService = { record: async () => undefined };
  const recorder = {
    sendToUsers: async (ids: string[], template: string, vars: unknown, details: unknown) => {
      mails.push({ ids, template, vars: vars as Record<string, unknown>, details: details as Record<string, unknown> });
      return [];
    },
  };
  const mailer = opts.mailerAbsent ? undefined : (opts.mailer ?? recorder);

  function chainFor(rows: unknown[]) {
    const chain: any = {
      where: () => chain,
      limit: () => chain,
      for: function (this: any) {
        return this;
      },
    };
    chain.then = (resolve: (v: unknown) => void) => resolve(rows);
    return chain;
  }

  const tx = {
    select: () => ({
      from: (table: unknown) => {
        if (table === matches) return chainFor(opts.match ? [opts.match] : []);
        if (table === match_players) return chainFor([]);
        if (table === pitch_slots) return chainFor([{ id: 'slot-1', is_booked: true }]);
        if (table === users) return chainFor([{ id: HOST, wallet_balance: '0' }]);
        if (table === transactions) return chainFor([]);
        return chainFor([]);
      },
    }),
    update: () => ({
      set: () => {
        const c: any = { where: () => c, returning: () => [{ id: MATCH_ID }] };
        return c;
      },
    }),
    delete: () => ({ where: () => thenable() }),
    insert: () => ({ values: () => thenable() }),
    execute: () => chainFor(opts.match ? [opts.match] : []),
  };

  const db = {
    transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb(tx),
    // Post-tx owner resolve rides db.execute (OUTSIDE the tx) — the money-notify
    // harness routes refund legs through tx.execute; this one is the raw
    // pooled-db SELECT for the venue owner.
    execute:
      opts.executeThrows
        ? async () => {
            throw new Error('pool drained');
          }
        : async () => opts.ownerRow ?? [],
    query: {
      matches: {
        findFirst: async () => ({
          id: MATCH_ID,
          status: 'Cancelled',
          title: 'Friday 7s',
          scheduled_at: new Date('2030-01-01T18:00:00Z'),
          duration_mins: 90,
          completed_at: null,
          players: [],
          messages: [],
          pitch: opts.ownerRow?.length ? { id: 'pitch-1' } : null,
        }),
      },
    },
  };

  const svc = new MatchesService(
    db as never,
    {} as never, // walletService
    { broadcastRosterUpdate: () => {}, broadcastStatusUpdate: () => {} } as never,
    notificationsService as never,
    activitiesService as never,
    { getNumber: async () => 0 } as never,
    { broadcastOps: () => {} } as never,
    { promoteNextInTx: async () => null } as never,
    mailer as never,
  );
  return { svc, pushes, mails };
}

const baseMatch = {
  id: MATCH_ID,
  host_id: HOST,
  status: 'Open',
  booking_mode: 'koralink',
  booking_slot_id: 'slot-1',
  pitch_cost_sar: '120.00',
  price_per_player: '37.00',
  max_players: 10,
  is_player_hosted: false,
  host_payout_state: 'n/a',
};

describe('P2-214 — cancelMatch venue-owner email', () => {
  it('emails the venue owner with the cancelled match title, Riyadh time and venue name', async () => {
    const { svc, mails } = makeHarness({
      match: baseMatch,
      ownerRow: [{ owner_id: OWNER, venue_name: 'Riyadh Arena' }],
    });

    await svc.cancelMatch(HOST, MATCH_ID);

    expect(mails).toHaveLength(1);
    expect(mails[0].ids).toEqual([OWNER]);
    expect(mails[0].template).toBe('match_cancelled_admin');
    expect(mails[0].vars).toMatchObject({ title: 'Friday 7s' });
    expect(mails[0].details).toMatchObject({
      matchId: MATCH_ID,
      matchTitle: 'Friday 7s',
      where: 'Riyadh Arena',
    });
    expect(typeof mails[0].details?.when).toBe('string');
    expect((mails[0].details?.when as string).length).toBeGreaterThan(0);
  });

  it('no self-email when the host IS the venue owner', async () => {
    const { svc, mails } = makeHarness({
      match: baseMatch,
      ownerRow: [{ owner_id: HOST, venue_name: 'Riyadh Arena' }],
    });

    await svc.cancelMatch(HOST, MATCH_ID);

    expect(mails).toHaveLength(0);
  });

  it('no email without a venue-bound pitch (owner row empty)', async () => {
    const { svc, mails } = makeHarness({
      match: baseMatch,
      ownerRow: [],
    });

    await svc.cancelMatch(HOST, MATCH_ID);

    expect(mails).toHaveLength(0);
  });

  it('no email when the mailer is absent (legacy construction)', async () => {
    const { svc, mails } = makeHarness({
      match: baseMatch,
      ownerRow: [{ owner_id: OWNER, venue_name: 'Riyadh Arena' }],
      mailerAbsent: true,
    });

    await svc.cancelMatch(HOST, MATCH_ID);

    expect(mails).toHaveLength(0);
  });

  it('owner-resolve failure never fails the cancel (best-effort contract)', async () => {
    const { svc } = makeHarness({
      match: baseMatch,
      ownerRow: [{ owner_id: OWNER, venue_name: 'Riyadh Arena' }],
      executeThrows: true,
    });

    const updated = await svc.cancelMatch(HOST, MATCH_ID);
    expect(updated.status).toBe('Cancelled');
  });

  it('rejected mailer promise never fails the cancel (fire-and-forget contract)', async () => {
    const { svc } = makeHarness({
      match: baseMatch,
      ownerRow: [{ owner_id: OWNER, venue_name: 'Riyadh Arena' }],
      mailer: {
        sendToUsers: async () => {
          throw new Error('resend 503');
        },
      },
    });

    const updated = await svc.cancelMatch(HOST, MATCH_ID);
    expect(updated.status).toBe('Cancelled');
  });
});
