import { PgDialect } from 'drizzle-orm/pg-core';
import { match_players, venue_reviews } from '../../database/schema';
import { NotificationsService } from './notifications.service';
import { MatchesService } from '../matches/matches.service';
import { renderPushText } from './push-text';

/**
 * P2-254 (run #237) — post-match venue review prompt (API notification leg).
 *
 * Pins:
 * 1. Audience = roster rows of THIS match with is_host = true OR
 *    fee_paid_sar IS NOT NULL (isNotNull — never an eq(col, null) trap).
 * 2. Dedupe: users who already reviewed the venue (venue_reviews, UNIQUE
 *    venue_id+user_id) are dropped — there is no in-app notifications table
 *    to carry an idempotency key without a migration.
 * 3. Push key + deep-link data shape { type: 'venue-review-prompt', venueId, matchId }.
 * 4. Fire-point guard: fires only when ≥1 roster row paid; skips
 *    player-hosted and pitch-less matches; a failure never throws.
 * 5. EN/AR catalog text interpolates the venue name into the title.
 *
 * DB stubbed (same pattern as notifications.sweep-stale.spec.ts).
 */
const dialect = new PgDialect();

type Captured = { op: string; table?: unknown; whereSql?: string; params?: unknown[] };

/** Thenable query-chain stub: every builder call returns the chain; awaiting
 *  it resolves to the next queued result. `where` clauses are compiled so
 *  the SQL shape can be asserted. */
function makeDb(results: unknown[][]) {
  const captured: Captured[] = [];
  const queue = [...results];
  const start = (op: string) => {
    const entry: Captured = { op };
    captured.push(entry);
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    for (const m of ['innerJoin', 'leftJoin', 'limit', 'orderBy', 'for']) chain[m] = self;
    chain.from = (table: unknown) => {
      entry.table = table;
      return chain;
    };
    chain.where = (clause: unknown) => {
      const q = dialect.sqlToQuery(clause as never);
      entry.whereSql = q.sql;
      entry.params = q.params as unknown[];
      return chain;
    };
    chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(queue.shift() ?? []).then(resolve, reject);
    return chain;
  };
  const db = {
    select: () => start('select'),
    selectDistinct: () => start('selectDistinct'),
  };
  return { db, captured };
}

function makeNotifications(db: unknown) {
  const config = { get: (_key: string, defaultValue?: string) => defaultValue };
  const svc = new NotificationsService(db as never, config as never);
  (svc as unknown as { vapidConfigured: boolean }).vapidConfigured = true;
  const push = jest.spyOn(svc, 'sendPushToUsers').mockResolvedValue(3);
  return { svc, push };
}

describe('NotificationsService.sendReviewPromptNotification (P2-254)', () => {
  it('filters the roster to host OR fee_paid_sar IS NOT NULL for THIS match', async () => {
    const { db, captured } = makeDb([[{ user_id: 'u1' }, { user_id: 'u2' }], []]);
    const { svc } = makeNotifications(db);

    await svc.sendReviewPromptNotification('m1', 'v1', 'Al Nakheel');

    const roster = captured[0];
    expect(roster.op).toBe('selectDistinct');
    expect(roster.table).toBe(match_players);
    expect(roster.whereSql).toContain('"match_players"."match_id" = $1');
    expect(roster.whereSql).toContain('"match_players"."is_host" = $2');
    expect(roster.whereSql).toContain('"match_players"."fee_paid_sar" is not null');
    expect(roster.whereSql).toMatch(/ or /);
    expect(roster.params).toEqual(['m1', true]);
  });

  it('pushes venue_review_prompt with the deep-link data shape', async () => {
    const { db } = makeDb([[{ user_id: 'u1' }, { user_id: 'u2' }], []]);
    const { svc, push } = makeNotifications(db);

    const sent = await svc.sendReviewPromptNotification('m1', 'v1', 'Al Nakheel');

    expect(sent).toBe(3);
    expect(push).toHaveBeenCalledWith(['u1', 'u2'], {
      key: 'venue_review_prompt',
      vars: { venueName: 'Al Nakheel' },
      data: { type: 'venue-review-prompt', venueId: 'v1', matchId: 'm1' },
    });
  });

  it('dedupes durably: users who already reviewed this venue are dropped', async () => {
    const { db, captured } = makeDb([
      [{ user_id: 'u1' }, { user_id: 'u2' }, { user_id: 'u3' }],
      [{ user_id: 'u2' }],
    ]);
    const { svc, push } = makeNotifications(db);

    await svc.sendReviewPromptNotification('m1', 'v1', 'Al Nakheel');

    const dedupe = captured[1];
    expect(dedupe.table).toBe(venue_reviews);
    expect(dedupe.whereSql).toContain('"venue_reviews"."venue_id" = $1');
    expect(dedupe.whereSql).toContain('"venue_reviews"."user_id" in');
    expect(dedupe.params).toEqual(['v1', 'u1', 'u2', 'u3']);
    expect(push.mock.calls[0][0]).toEqual(['u1', 'u3']);
  });

  it('sends nothing when everyone eligible already reviewed', async () => {
    const { db } = makeDb([[{ user_id: 'u1' }], [{ user_id: 'u1' }]]);
    const { svc, push } = makeNotifications(db);
    expect(await svc.sendReviewPromptNotification('m1', 'v1', 'X')).toBe(0);
    expect(push).not.toHaveBeenCalled();
  });

  it('sends nothing (and skips the dedupe read) when no roster row is eligible', async () => {
    const { db, captured } = makeDb([[]]);
    const { svc, push } = makeNotifications(db);
    expect(await svc.sendReviewPromptNotification('m1', 'v1', 'X')).toBe(0);
    expect(captured).toHaveLength(1);
    expect(push).not.toHaveBeenCalled();
  });

  it('no-ops without VAPID keys (no DB reads)', async () => {
    const { db, captured } = makeDb([]);
    const config = { get: (_key: string, defaultValue?: string) => defaultValue };
    const svc = new NotificationsService(db as never, config as never);
    expect(await svc.sendReviewPromptNotification('m1', 'v1', 'X')).toBe(0);
    expect(captured).toHaveLength(0);
  });
});

describe('venue_review_prompt catalog text (P2-254)', () => {
  it('EN + AR interpolate the venue name into title and body', () => {
    expect(renderPushText('venue_review_prompt', { venueName: 'Al Nakheel' }, 'en')).toEqual({
      title: 'How was Al Nakheel?',
      body: 'Rate your match at Al Nakheel and help other players.',
    });
    expect(renderPushText('venue_review_prompt', { venueName: 'النخيل' }, 'ar')).toEqual({
      title: 'كيف كانت النخيل؟',
      body: 'قيّم ملعبك في النخيل وساعد اللاعبين الآخرين.',
    });
  });
});

describe('MatchesService.fireVenueReviewPrompt guards (P2-254 fire points)', () => {
  type Fire = (matchId: string, pitchId: string | null, isPlayerHosted: boolean) => Promise<void>;
  const fire = (MatchesService.prototype as unknown as { fireVenueReviewPrompt: Fire })
    .fireVenueReviewPrompt;

  function makeCtx(results: unknown[][], sendImpl?: () => Promise<number>) {
    const { db, captured } = makeDb(results);
    const sendReviewPromptNotification = jest.fn(sendImpl ?? (() => Promise.resolve(1)));
    const ctx = {
      db,
      notificationsService: { sendReviewPromptNotification },
      logger: { error: jest.fn(), log: jest.fn(), warn: jest.fn() },
    };
    return { ctx, captured, sendReviewPromptNotification };
  }

  it('fires when the match has a venue pitch and ≥1 paid roster row', async () => {
    const { ctx, captured, sendReviewPromptNotification } = makeCtx([
      [{ id: 'v1', name: 'Al Nakheel' }],
      [{ id: 'mp1' }],
    ]);
    await fire.call(ctx, 'm1', 'p1', false);

    expect(captured[0].whereSql).toContain('"pitches"."id" = $1');
    expect(captured[0].params).toEqual(['p1']);
    expect(captured[1].table).toBe(match_players);
    expect(captured[1].whereSql).toContain('"match_players"."fee_paid_sar" is not null');
    expect(sendReviewPromptNotification).toHaveBeenCalledWith('m1', 'v1', 'Al Nakheel');
  });

  it('does NOT fire when nobody paid', async () => {
    const { ctx, sendReviewPromptNotification } = makeCtx([[{ id: 'v1', name: 'X' }], []]);
    await fire.call(ctx, 'm1', 'p1', false);
    expect(sendReviewPromptNotification).not.toHaveBeenCalled();
  });

  it('skips player-hosted matches without touching the DB', async () => {
    const { ctx, captured, sendReviewPromptNotification } = makeCtx([]);
    await fire.call(ctx, 'm1', 'p1', true);
    expect(captured).toHaveLength(0);
    expect(sendReviewPromptNotification).not.toHaveBeenCalled();
  });

  it('skips matches without a pitch', async () => {
    const { ctx, captured, sendReviewPromptNotification } = makeCtx([]);
    await fire.call(ctx, 'm1', null, false);
    expect(captured).toHaveLength(0);
    expect(sendReviewPromptNotification).not.toHaveBeenCalled();
  });

  it('never throws — a push failure is logged and the completion stands', async () => {
    const { ctx } = makeCtx([[{ id: 'v1', name: 'X' }], [{ id: 'mp1' }]], () =>
      Promise.reject(new Error('push down')),
    );
    await expect(fire.call(ctx, 'm1', 'p1', false)).resolves.toBeUndefined();
    expect(ctx.logger.error).toHaveBeenCalledWith(expect.stringContaining('venue_review_prompt failed for m1'));
  });
});
