import { MatchesService } from './matches.service';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { renderPushText } from '../notifications/push-text';

/**
 * P2-100 (run #74): the match-start reminder ladder.
 *
 * Before this change a single T-45m leg ([15m, 45m) window, stamped once via
 * reminders_sent_at) meant a joiner added inside the window could still miss
 * the reminder depending on the 15-min tick phase, and there was no day-ahead
 * anchor. The ladder adds a T-24h leg with its own stamp column:
 *
 * - the two legs MUST be independent (own NULL-guard column, own window, own
 *   push type / mail template) so neither can suppress the other;
 * - the stamp is written ONLY after the leg's fan-out succeeded (a push
 *   failure must leave the leg armed so the next tick retries);
 * - the day-ahead push carries the Riyadh-local DATE (kickoffDateISO) — a
 *   missing value must render a visibly broken marker, never "today".
 *
 * The db fake classifies selects by their projection (the roster read selects
 * `user_id`; the leg reads select id/title/scheduled_at) and renders every
 * captured WHERE through PgDialect.sqlToQuery so the window/NULL-guard
 * predicates are asserted as real SQL text (run #13 regression style).
 */

const KICKOFF_ISO = '2026-09-26T18:00:00.000Z';

function makeMatch(id: string) {
  return { id, title: `Match ${id}`, scheduled_at: KICKOFF_ISO };
}

interface RecordedCall {
  kind: 'legSelect' | 'rosterSelect' | 'update';
  whereSql?: string;
  setArg?: Record<string, unknown>;
}

interface Harness {
  svc: MatchesService;
  calls: RecordedCall[];
  sendPush: jest.Mock;
  sendMail: jest.Mock;
}

function sqlText(node: unknown): string {
  return new PgDialect().sqlToQuery(node as SQL).sql;
}

function makeHarness(
  opts: {
    legQueue?: unknown[][];
    rosterQueue?: unknown[][];
    pushFailsFor?: 'match_starting_24h' | 'match_starting_soon';
    withMailer?: boolean;
  } = {},
): Harness {
  const calls: RecordedCall[] = [];
  const legQueue = [...(opts.legQueue ?? [])];
  const rosterQueue = [...(opts.rosterQueue ?? [])];

  const thenable = (value: unknown) => ({
    then: (res: (v: unknown) => void) => {
      res(value);
      return undefined;
    },
  });

  const db = {
    select: (projection: Record<string, unknown>) => {
      const isRoster = 'user_id' in projection;
      return {
        from: () => ({
          where: (whereArg: unknown) => {
            if (isRoster) {
              return {
                ...thenable(rosterQueue.shift() ?? []),
                // the roster read is awaited directly (no .limit())
              };
            }
            return {
              limit: () => {
                calls.push({ kind: 'legSelect', whereSql: sqlText(whereArg) });
                return thenable(legQueue.shift() ?? []);
              },
            };
          },
        }),
      };
    },
    update: () => ({
      set: (setArg: Record<string, unknown>) => ({
        where: () => {
          calls.push({ kind: 'update', setArg });
          return thenable([]);
        },
      }),
    }),
  };

  const sendPush = jest.fn(async (_users: unknown, payload: { key?: string }) => {
    if (opts.pushFailsFor && payload?.key === opts.pushFailsFor) {
      throw new Error('push transport down');
    }
  });
  const sendMail = jest.fn(async () => undefined);

  const svc = new MatchesService(
    db as never,
    {} as never, // walletService (unused on this path)
    {} as never, // appGateway
    { sendPushToUsers: sendPush } as never,
    { record: jest.fn() } as never, // activitiesService
    {} as never, // settings
    {} as never, // realtime
    { promoteNextInTx: async () => null } as never, // waitlist
    opts.withMailer ? ({ sendToUsers: sendMail } as never) : undefined,
  );
  return { svc, calls, sendPush, sendMail };
}

describe('MatchesService.sendMatchStartReminders — P2-100 reminder ladder', () => {
  it('runs BOTH legs: independent windows, guards and stamps', async () => {
    const h = makeHarness({
      legQueue: [[makeMatch('m-24')], [makeMatch('m-45')]],
      rosterQueue: [[{ user_id: 'u1' }], [{ user_id: 'u1' }]],
    });
    const result = await h.svc.sendMatchStartReminders();

    expect(result).toEqual({ sent45: 1, sent24: 1 });

    const legSelects = h.calls.filter((c) => c.kind === 'legSelect');
    expect(legSelects).toHaveLength(2);

    // Day-ahead window: [23h45m, 24h15m] before kickoff, NULL-guard on the
    // 24h stamp column only.
    const sql24 = legSelects[0].whereSql ?? '';
    expect(sql24).toContain('23 hours 45 minutes');
    expect(sql24).toContain('24 hours 15 minutes');
    expect(sql24).toContain('"matches"."reminders_24h_sent_at"');
    expect(sql24).not.toContain('"matches"."reminders_sent_at" is not null');
    // Status filter is an inArray bound-param clause ($1,$2 = 'Open','Full').
    expect(sql24).toContain(' in ($1, $2)');
    expect(sql24).toContain('reminders_24h_sent_at" is null');

    // Near-kickoff window unchanged: [15m, 45m], guard on the original stamp.
    const sql45 = legSelects[1].whereSql ?? '';
    expect(sql45).toContain("INTERVAL '15 minutes'");
    expect(sql45).toContain("INTERVAL '45 minutes'");
    expect(sql45).toContain('"matches"."reminders_sent_at"');
    expect(sql45).not.toContain('reminders_24h_sent_at');

    // Each leg stamps ONLY its own column.
    const updates = h.calls.filter((c) => c.kind === 'update');
    expect(updates).toHaveLength(2);
    expect(updates[0].setArg).toHaveProperty('reminders_24h_sent_at');
    expect(updates[0].setArg).not.toHaveProperty('reminders_sent_at');
    expect(updates[1].setArg).toHaveProperty('reminders_sent_at');
    expect(updates[1].setArg).not.toHaveProperty('reminders_24h_sent_at');
  });

  it('sends the day-ahead push with its own type and the kickoff DATE var', async () => {
    const h = makeHarness({
      legQueue: [[makeMatch('m-24')], [makeMatch('m-45')]],
      rosterQueue: [[{ user_id: 'u1' }], [{ user_id: 'u1' }]],
    });
    await h.svc.sendMatchStartReminders();

    expect(h.sendPush).toHaveBeenCalledTimes(2);

    const push24 = h.sendPush.mock.calls[0];
    expect(push24[1].key).toBe('match_starting_24h');
    expect(push24[1].vars.kickoffDateISO).toBe(KICKOFF_ISO);
    expect(push24[1].vars.kickoffISO).toBe(KICKOFF_ISO);
    expect(push24[1].data).toEqual({ type: 'match_starting_24h', matchId: 'm-24' });

    // The 45m leg keeps its original payload shape (no date var).
    const push45 = h.sendPush.mock.calls[1];
    expect(push45[1].key).toBe('match_starting_soon');
    expect(push45[1].vars).toEqual({
      title: 'Match m-45',
      kickoffISO: KICKOFF_ISO,
    });
    expect(push45[1].data).toEqual({ type: 'match_starting_soon', matchId: 'm-45' });
  });

  it('mirrors each leg to its own email template', async () => {
    const h = makeHarness({
      withMailer: true,
      legQueue: [[makeMatch('m-24')], [makeMatch('m-45')]],
      rosterQueue: [[{ user_id: 'u1' }], [{ user_id: 'u1' }]],
    });
    await h.svc.sendMatchStartReminders();

    expect(h.sendMail).toHaveBeenCalledTimes(2);
    expect(h.sendMail.mock.calls[0][1]).toBe('match_reminder_24h');
    expect(h.sendMail.mock.calls[0][2]).toEqual({ title: 'Match m-24' });
    expect(h.sendMail.mock.calls[1][1]).toBe('match_reminder');
  });

  it('an empty roster still stamps the leg but pushes nobody', async () => {
    const h = makeHarness({
      legQueue: [[makeMatch('m-24')], [makeMatch('m-45')]],
      rosterQueue: [[], []],
    });
    const result = await h.svc.sendMatchStartReminders();

    expect(h.sendPush).not.toHaveBeenCalled();
    expect(result).toEqual({ sent45: 1, sent24: 1 });
    expect(h.calls.filter((c) => c.kind === 'update')).toHaveLength(2);
  });

  it('a push failure leaves the leg ARMED (no stamp) and does not throw', async () => {
    const h = makeHarness({
      pushFailsFor: 'match_starting_24h',
      legQueue: [[makeMatch('m-24')], [makeMatch('m-45')]],
      rosterQueue: [[{ user_id: 'u1' }], [{ user_id: 'u1' }]],
    });
    const result = await h.svc.sendMatchStartReminders();

    // 24h leg failed before its stamp → retry next tick; 45m leg completed.
    expect(result).toEqual({ sent45: 1, sent24: 0 });
    const updates = h.calls.filter((c) => c.kind === 'update');
    expect(updates).toHaveLength(1);
    expect(updates[0].setArg).toHaveProperty('reminders_sent_at');
    expect(updates[0].setArg).not.toHaveProperty('reminders_24h_sent_at');
  });

  it('no matches in either window → nothing sent, nothing stamped', async () => {
    const h = makeHarness({ legQueue: [[], []], rosterQueue: [] });
    const result = await h.svc.sendMatchStartReminders();

    expect(result).toEqual({ sent45: 0, sent24: 0 });
    expect(h.sendPush).not.toHaveBeenCalled();
    expect(h.calls.filter((c) => c.kind === 'update')).toHaveLength(0);
  });
});

describe('match_starting_24h push copy — P2-100 catalog contract', () => {
  it('renders the Riyadh-local DATE + time in both locales', () => {
    const vars = {
      title: 'Tuesday football',
      kickoffISO: KICKOFF_ISO,
      kickoffDateISO: KICKOFF_ISO,
    };
    const en = renderPushText('match_starting_24h', vars, 'en');
    expect(en.title).toContain('Match tomorrow');
    expect(en.body).toContain('Tuesday football');
    expect(en.body).toMatch(/tomorrow/);
    expect(en.body).toMatch(/\d{2}:\d{2}/); // kickoff time present
    expect(en.body).not.toContain('--');

    const ar = renderPushText('match_starting_24h', vars, 'ar');
    expect(ar.title).toContain('مباراتك غدًا');
    expect(ar.body).toContain('غدًا');
    // ar-SA renders Arabic-Indic digits (٢١:٠٠) — the product's numeral
    // convention (Abdullah: Arabic-Indic numerals in money/dates).
    expect(ar.body).toMatch(/[٠-٩]{2}:[٠-٩]{2}/);
    expect(ar.body).not.toContain('--');
  });

  it('a missing kickoffDateISO renders the visibly-broken marker (never "today")', () => {
    const en = renderPushText('match_starting_24h', { title: 'X' }, 'en');
    expect(en.body).toContain('--');
    // Total-render contract: neither leg's fallback path may throw.
    expect(() => renderPushText('match_starting_soon', {}, 'en')).not.toThrow();
    expect(() => renderPushText('match_starting_soon', { kickoffISO: 'not-a-date' }, 'ar')).not.toThrow();
    expect(renderPushText('match_starting_soon', { kickoffISO: 'not-a-date' }, 'en').body).toContain('--:--');
  });
});
