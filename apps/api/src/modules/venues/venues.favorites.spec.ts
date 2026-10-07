import { NotFoundException } from '@nestjs/common';
import { VenuesService } from './venues.service';
import { venues, venue_favorites, users, pitches } from '../../database/schema';

/**
 * P2-161: venue favorites. The drizzle db is an in-memory fake covering the
 * four favorites methods + the venue-existence check; raw-SQL listing rows
 * are produced from the same fake row set so the composite-PK idempotency is
 * actually exercised.
 */
type FavRow = { user_id: string; venue_id: string; created_at: Date };

function makeVenues(opts: {
  venues: { id: string; owner_id: string; name: string; is_approved: boolean }[];
  users: string[];
  favorites?: FavRow[];
}) {
  const favorites = opts.favorites ?? [];
  let clock = Date.parse('2026-10-01T00:00:00Z');

  const db: any = {
    select: (projection?: unknown) => ({
      from: (table: unknown) => {
        const chain: any = {
          where: () => chain,
          innerJoin: (_other: unknown, _on: unknown) => chain,
          limit: async () => {
            if (table === venues) {
              const wanted = (makeVenues as any)._wantedVenueId;
              const hit = opts.venues.find((v) => v.id === wanted && v.is_approved);
              return hit ? [hit] : [];
            }
            if (table === venue_favorites) {
              // joined ids path: filter favorites by ctx user + venue approval
              const uid = (makeVenues as any)._ctxUserId;
              return favorites
                .filter(
                  (f) =>
                    f.user_id === uid &&
                    opts.venues.find((v) => v.id === f.venue_id)?.is_approved,
                )
                .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
            }
            return [];
          },
          orderBy: () => chain,
        };
        chain.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
          try {
            resolve((chain as any).limit());
          } catch (e) {
            reject(e);
          }
        };
        return chain;
      },
    }),
    execute: async (query: unknown) => {
      const uid = (makeVenues as any)._ctxUserId;
      const rows = favorites
        .filter((f) => f.user_id === uid)
        .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
        .map((f) => {
          const v = opts.venues.find((x) => x.id === f.venue_id);
          return {
            id: f.venue_id,
            name: v?.name ?? '',
            city: 'Riyadh',
            address: 'x',
            amenities: [],
            is_approved: v?.is_approved ?? true,
            is_koralink_partner: false,
            distance_m: null,
            owner_id: v?.owner_id ?? '',
            owner_name: null,
            pitch_count: 1,
          };
        })
        .filter((r) => r.is_approved);
      return rows;
    },
    insert: jest.fn(() => {
      let values: { user_id: string; venue_id: string };
      const chain: any = {
        values: (v: typeof values) => {
          values = v;
          return chain;
        },
        onConflictDoNothing: () => chain,
        returning: async () => {
          const dup = favorites.some(
            (r) => r.user_id === values.user_id && r.venue_id === values.venue_id,
          );
          if (dup) return [];
          clock += 1000;
          favorites.push({ ...values, created_at: new Date(clock) });
          return [{ venue_id: values.venue_id }];
        },
      };
      return chain;
    }),
    delete: jest.fn(() => {
      const chain: any = {
        where: () => chain,
        returning: async () => {
          const uid = (makeVenues as any)._ctxUserId;
          const i = favorites.findIndex((r) => r.user_id === uid && r.venue_id === (makeVenues as any)._wantedVenueId);
          if (i >= 0) {
            favorites.splice(i, 1);
            return [{ venue_id: (makeVenues as any)._wantedVenueId }];
          }
          return [];
        },
      };
      return chain;
    }),
  };
  return { db, favorites };
}

function makeService(opts: Parameters<typeof makeVenues>[0]) {
  const fake = makeVenues(opts);
  const service = new VenuesService(fake.db);
  const h = {
    service,
    favorites: fake.favorites,
    setCtx(userId: string, venueId?: string) {
      (makeVenues as any)._ctxUserId = userId;
      (makeVenues as any)._wantedVenueId = venueId;
    },
  };
  return h;
}

describe('VenuesService favorites (P2-161)', () => {
  const base = {
    venues: [
      { id: 'v1', owner_id: 'o1', name: 'Al-Nakhil Club', is_approved: true },
      { id: 'v2', owner_id: 'o1', name: 'Riyadh Padel', is_approved: true },
      { id: 'v3', owner_id: 'o2', name: 'Unapproved', is_approved: false },
    ],
    users: ['u1', 'u2'],
  };

  it('addFavorite: inserts + reports created=true; duplicate is idempotent created=false', async () => {
    const h = makeService(base);
    h.setCtx('u1', 'v1');
    await expect(h.service.addFavorite('u1', 'v1')).resolves.toEqual({
      favorited: true,
      created: true,
    });
    await expect(h.service.addFavorite('u1', 'v1')).resolves.toEqual({
      favorited: true,
      created: false,
    });
    expect(h.favorites).toHaveLength(1);
  });

  it('addFavorite: unknown OR UNAPPROVED venue 404s (PR-Agent run-#109: no unapproved-id enumeration)', async () => {
    const h = makeService(base);
    h.setCtx('u1', 'v3'); // v3 is is_approved: false
    await expect(h.service.addFavorite('u1', 'v3')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('addFavorite: unknown venue 404s', async () => {
    const h = makeService(base);
    h.setCtx('u1', 'missing');
    await expect(h.service.addFavorite('u1', 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('listFavoriteIds: newest-first ids for the caller only', async () => {
    const h = makeService({
      ...base,
      favorites: [
        { user_id: 'u1', venue_id: 'v1', created_at: new Date(1) },
        { user_id: 'u1', venue_id: 'v2', created_at: new Date(2) },
        { user_id: 'u2', venue_id: 'v1', created_at: new Date(3) },
      ],
    });
    h.setCtx('u1');
    await expect(h.service.listFavoriteIds('u1')).resolves.toEqual(['v2', 'v1']);
  });

  it('removeFavorite: removed=true on real delete, false when nothing was favorited', async () => {
    const h = makeService(base);
    h.setCtx('u1', 'v1');
    await h.service.addFavorite('u1', 'v1');
    await expect(h.service.removeFavorite('u1', 'v1')).resolves.toEqual({
      favorited: false,
      removed: true,
    });
    await expect(h.service.removeFavorite('u1', 'v1')).resolves.toEqual({
      favorited: false,
      removed: false,
    });
  });

  it('listFavoriteVenues: findNearby row shape, unapproved favorites dropped, distance null', async () => {
    const h = makeService({
      ...base,
      favorites: [
        { user_id: 'u1', venue_id: 'v1', created_at: new Date(1) },
        { user_id: 'u1', venue_id: 'v3', created_at: new Date(2) },
      ],
    });
    h.setCtx('u1');
    const rows = (await h.service.listFavoriteVenues('u1')) as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'v1',
      name: 'Al-Nakhil Club',
      distance_m: null,
      pitch_count: 1,
    });
  });

  it('isolation: u1 favoriting does not leak into u2 (directional, private)', async () => {
    const h = makeService(base);
    h.setCtx('u1', 'v1');
    await h.service.addFavorite('u1', 'v1');
    h.setCtx('u2');
    await expect(h.service.listFavoriteIds('u2')).resolves.toEqual([]);
  });
});
