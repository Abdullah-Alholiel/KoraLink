import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { VenuesService } from './venues.service';
import { venues, venue_reviews } from '../../database/schema';

/**
 * P1-55: booking-verified venue reviews (run #117). The drizzle db is an
 * in-memory fake covering: the FOR UPDATE venue probe, the tx-scoped
 * verified-booking SQL, the upsert, the aggregate recompute, the venues
 * update, and the listing read. txUsed pins that the write path ran THROUGH
 * the transaction-scoped handle (favorites-spec precedent, run #111).
 */

type ReviewRow = {
  id: string;
  venue_id: string;
  user_id: string;
  match_id: string;
  rating: number;
  comment: string | null;
  created_at: Date;
  updated_at: Date;
};

function makeDb(opts: {
  venues: Array<{ id: string }>;
  /** Completed-match ids visible to the verified-booking probe, per user. */
  proofMatchId?: string | null;
  reviews: ReviewRow[];
}) {
  const reviews = opts.reviews.map((r) => ({ ...r }));

  const db: any = {
    transaction: jest.fn(async (fn: (tx: any) => unknown) => {
      const txUsed = { select: false, execute: false, insert: false, update: false };
      (makeDb as any)._txUsed = txUsed;
      const tx: any = {
        select: (...args: unknown[]) => {
          txUsed.select = true;
          return db.select(...args);
        },
        execute: async (query: unknown) => {
          txUsed.execute = true;
          return db.__execute(query);
        },
        insert: (...args: unknown[]) => {
          txUsed.insert = true;
          return db.insert(...args);
        },
        update: (...args: unknown[]) => {
          txUsed.update = true;
          return db.update(...args);
        },
      };
      return await fn(tx);
    }),
    __execute: async (_query: unknown) => {
      (makeDb as any)._probeCalled = true;
      return opts.proofMatchId ? [{ id: opts.proofMatchId }] : [];
    },
    execute: jest.fn((query: unknown) => db.__execute(query)),
    select: (projection?: unknown) => {
      // The aggregate read projects {average, count}; the FOR UPDATE venue
      // probe projects {id}. Distinguish by projection so each resolves the
      // right shape.
      const isAggregate =
        !!projection && typeof projection === 'object' && 'average' in (projection as object);
      const aggRow = () => (makeDb as any)._aggregate ?? { average: '0', count: 0 };
      const chain: any = {
        from: (table: unknown) => {
          const inner: any = {
            where: (_cond?: unknown) => {
              // Hybrid tail: chainable (.for('update').limit() — the venue
              // probe) AND directly-awaitable (the aggregate select ends at
              // .where()). `then` makes the same object a thenable.
              const tail: any = {
                for: (mode: string) => {
                  (makeDb as any)._forUpdate = mode;
                  return tail;
                },
                limit: async () => {
                  if (table === venues) {
                    const wanted = (makeDb as any)._wantedVenueId;
                    const hits = opts.venues.filter((v) => v.id === wanted);
                    // listVenueReviews' aggregate read doubles as the venue
                    // existence probe — an unknown id resolves EMPTY (404s).
                    if (isAggregate) return hits.length ? [aggRow()] : [];
                    return hits;
                  }
                  // venue_reviews aggregate select (legacy .limit() tail path)
                  return [aggRow()];
                },
                then: (
                  resolve: (v: unknown) => unknown,
                  reject: (e: unknown) => unknown,
                ) => Promise.resolve([aggRow()]).then(resolve, reject),
              };
              return tail;
            },
            for: (mode: string) => {
              (makeDb as any)._forUpdate = mode;
              return inner;
            },
            limit: async () => {
              if (table === venues) {
                const wanted = (makeDb as any)._wantedVenueId;
                const hits = opts.venues.filter((v) => v.id === wanted);
                if (isAggregate) return hits.length ? [aggRow()] : [];
                return hits;
              }
              return [aggRow()];
            },
          };
          return inner;
        },
      };
      return chain;
    },
    insert: (table: unknown) => {
      const chain: any = {
        values: (vals: any) => {
          (makeDb as any)._inserted = vals;
          return chain;
        },
        onConflictDoUpdate: (_cfg: unknown) => chain,
        returning: async () => {
          const existingIdx = reviews.findIndex(
            (r) =>
              r.venue_id === (makeDb as any)._inserted.venue_id &&
              r.user_id === (makeDb as any)._inserted.user_id,
          );
          const row: ReviewRow = {
            id: existingIdx >= 0 ? reviews[existingIdx].id : 'new-review-id',
            venue_id: (makeDb as any)._inserted.venue_id,
            user_id: (makeDb as any)._inserted.user_id,
            match_id: (makeDb as any)._inserted.match_id,
            rating: (makeDb as any)._inserted.rating,
            comment: (makeDb as any)._inserted.comment,
            created_at: new Date('2026-10-09T12:00:00Z'),
            updated_at: new Date('2026-10-09T12:00:00Z'),
          };
          if (existingIdx >= 0) reviews[existingIdx] = row;
          else reviews.push(row);
          return [row];
        },
      };
      return chain;
    },
    update: (table: unknown) => {
      const chain: any = {
        set: (vals: any) => {
          if (table === venues) (makeDb as any)._venueUpdate = vals;
          return chain;
        },
        where: async () => undefined,
      };
      return chain;
    },
  };
  return db;
}

function makeService(db: any) {
  return new VenuesService(db as never);
}

describe('P1-55 venue reviews', () => {
  const VENUE = 'venue-1';
  const USER = 'user-1';

  function baseRows(): ReviewRow[] {
    return [
      {
        id: 'rv-1',
        venue_id: VENUE,
        user_id: 'someone-else',
        match_id: 'm-9',
        rating: 5,
        comment: 'great',
        created_at: new Date('2026-10-01T00:00:00Z'),
        updated_at: new Date('2026-10-01T00:00:00Z'),
      },
    ];
  }

  beforeEach(() => {
    (makeDb as any)._forUpdate = null;
    (makeDb as any)._probeCalled = false;
    (makeDb as any)._wantedVenueId = VENUE;
    (makeDb as any)._aggregate = { average: '4.5', count: 2 };
  });

  it('403s when the caller has no completed booking (probe returned no rows)', async () => {
    const db = makeDb({ venues: [{ id: VENUE }], proofMatchId: null, reviews: [] });
    const svc = makeService(db);
    await expect(svc.submitVenueReview(USER, VENUE, 5, null)).rejects.toThrow(
      ForbiddenException,
    );
    expect((makeDb as any)._probeCalled).toBe(true);
    // No write happened through the tx handles' write methods
    expect((makeDb as any)._inserted).toBeUndefined();
  });

  it('404s an unknown venue before any write', async () => {
    (makeDb as any)._wantedVenueId = 'nope';
    const db = makeDb({ venues: [{ id: VENUE }], proofMatchId: 'm-1', reviews: [] });
    const svc = makeService(db);
    await expect(svc.submitVenueReview(USER, 'nope', 4, null)).rejects.toThrow(
      NotFoundException,
    );
    expect((makeDb as any)._inserted).toBeUndefined();
  });

  it('upserts through the tx and updates aggregates in the SAME tx', async () => {
    const db = makeDb({ venues: [{ id: VENUE }], proofMatchId: 'm-1', reviews: baseRows() });
    const svc = makeService(db);
    const out = await svc.submitVenueReview(USER, VENUE, 4, 'solid');
    expect(out.review.rating).toBe(4);
    expect(out.review.comment).toBe('solid');
    expect(out.venueRating).toEqual({ average: 4.5, count: 2 });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect((makeDb as any)._txUsed).toEqual({
      select: true,
      execute: true,
      insert: true,
      update: true,
    });
    expect((makeDb as any)._forUpdate).toBe('update');
    expect((makeDb as any)._venueUpdate).toMatchObject({
      rating_avg: 4.5,
      rating_count: 2,
  });
  });

  it('review rating is a plain number in the payload', async () => {
    const db = makeDb({ venues: [{ id: VENUE }], proofMatchId: 'm-1', reviews: [] });
    const svc = makeService(db);
    const out = await svc.submitVenueReview(USER, VENUE, 3, null);
    expect(out.review.rating).toBe(3);
    expect(typeof out.review.rating).toBe('number');
  });

  it('listing maps rows to the contract shape and reports can_review', async () => {
    const db = makeDb({ venues: [{ id: VENUE }], proofMatchId: 'm-1', reviews: baseRows() });
    // listing raw-SQL rows
    db.execute.mockImplementationOnce(async () => [
      {
        id: 'rv-1',
        rating: 5,
        comment: 'great',
        created_at: '2026-10-01T00:00:00Z',
        updated_at: '2026-10-01T00:00:00Z',
        user_id: USER,
        user_full_name: 'Tester',
        user_avatar_url: null,
        mine: true,
      },
    ]);
    // venues aggregate read (drizzle select from venues → .limit() tail)
    (makeDb as any)._aggregate = { average: 4.5, count: 2 };
    const svc = makeService(db);
    const page = await svc.listVenueReviews(USER, VENUE);
    expect(page.reviews).toHaveLength(1);
    expect(page.reviews[0]).toMatchObject({
      id: 'rv-1',
      rating: 5,
      comment: 'great',
      user: { id: USER, full_name: 'Tester', avatar_url: null },
      mine: true,
    });
    expect(page.average).toBe(4.5);
    expect(page.count).toBe(2);
    expect(page.can_review).toBe(true);
  });

  it('listing 404s an unknown venue', async () => {
    (makeDb as any)._wantedVenueId = 'nope';
    const db = makeDb({ venues: [{ id: VENUE }], proofMatchId: null, reviews: [] });
    db.execute.mockImplementationOnce(async () => []);
    const svc = makeService(db);
    await expect(svc.listVenueReviews(USER, 'nope')).rejects.toThrow(NotFoundException);
  });

  it('upsert flag: submitting twice replaces the row (latest wins)', async () => {
    const db = makeDb({ venues: [{ id: VENUE }], proofMatchId: 'm-1', reviews: baseRows() });
    const svc = makeService(db);
    await svc.submitVenueReview(USER, VENUE, 2, 'first');
    const first = (makeDb as any)._inserted;
    await svc.submitVenueReview(USER, VENUE, 5, 'second');
    const second = (makeDb as any)._inserted;
    expect(second.rating).toBe(5);
    expect(second.comment).toBe('second');
    expect(first.rating).toBe(2);
    // same (venue_id,user_id) target both times — the UNIQUE index does the replace
    expect(second.venue_id).toBe(first.venue_id);
    expect(second.user_id).toBe(first.user_id);
  });
});
