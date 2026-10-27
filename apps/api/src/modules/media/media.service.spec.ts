import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { MediaService, MAX_VENUE_IMAGES } from './media.service';
import type { StorageService } from '../../common/storage/storage.service';

/**
 * Media service contract specs (P1-38, run #170).
 * Drizzle is mocked at the db-handle level (same pattern as partner suites);
 * assertions pin the SQL predicates that matter (cap guard, ownership).
 */

type Rows = Record<string, unknown>[];

function makeDb(venueRow: Rows | [] | null, updateResult: Rows = [{ id: 'v1' }]) {
  const update = jest.fn().mockReturnValue({
    set: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue(updateResult),
      }),
    }),
  });
  const db = {
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          // No-venue case: drizzle resolves [] and the service destructures
          // undefined out of it (const [venue] = []) → falsy venue.
          limit: jest.fn().mockResolvedValue(venueRow ?? []),
        }),
      }),
    }),
    update,
  };
  return { db, update };
}

const storage = {
  putVenueImage: jest.fn(),
  getVenueImage: jest.fn(),
  deleteVenueImage: jest.fn(),
  isManagedVenuePath: jest.fn().mockImplementation((p: string) => p.startsWith('/media/venues/')),
} as unknown as StorageService;

const FILE = { buffer: Buffer.from('fakejpeg'), size: 100, mimetype: 'image/jpeg' };

beforeEach(() => {
  jest.clearAllMocks();
  (storage.isManagedVenuePath as jest.Mock).mockImplementation((p: string) =>
    p.startsWith('/media/venues/'),
  );
});

describe('MediaService.uploadVenueImage', () => {
  it('stores + appends the path for the owning partner', async () => {
    const { db } = makeDb([{ id: 'v1', owner_id: 'u1', images: [] }]);
    (storage.putVenueImage as jest.Mock).mockResolvedValue({
      path: '/media/venues/v1/abc.jpg',
      bytes: 100,
      mime: 'image/jpeg',
    });
    const svc = new MediaService(db as never, storage);

    const res = await svc.uploadVenueImage('u1', 'VenueOwner', 'v1', FILE);
    expect(res.path).toBe('/media/venues/v1/abc.jpg');
    expect(storage.putVenueImage).toHaveBeenCalledWith('v1', FILE.buffer, 'image/jpeg');
  });

  it('403s a non-owner non-admin', async () => {
    const { db } = makeDb([{ id: 'v1', owner_id: 'someone-else', images: [] }]);
    const svc = new MediaService(db as never, storage);
    await expect(svc.uploadVenueImage('u9', 'VenueOwner', 'v1', FILE)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('404s an unknown venue', async () => {
    const { db } = makeDb(null);
    const svc = new MediaService(db as never, storage);
    await expect(svc.uploadVenueImage('u1', 'Admin', 'nope', FILE)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('400s when the venue already holds the max photos', async () => {
    const full = Array.from({ length: MAX_VENUE_IMAGES }, (_, i) => `/media/venues/v1/h${i}.jpg`);
    const { db } = makeDb([{ id: 'v1', owner_id: 'u1', images: full }]);
    const svc = new MediaService(db as never, storage);
    await expect(svc.uploadVenueImage('u1', 'VenueOwner', 'v1', FILE)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(storage.putVenueImage).not.toHaveBeenCalled();
  });

  it('rolls the stored object back when the capped UPDATE loses a race', async () => {
    const { db } = makeDb([{ id: 'v1', owner_id: 'u1', images: [] }], []); // update returns 0 rows
    (storage.putVenueImage as jest.Mock).mockResolvedValue({
      path: '/media/venues/v1/abc.jpg',
      bytes: 100,
      mime: 'image/jpeg',
    });
    const svc = new MediaService(db as never, storage);
    await expect(svc.uploadVenueImage('u1', 'VenueOwner', 'v1', FILE)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(storage.deleteVenueImage).toHaveBeenCalledWith('/media/venues/v1/abc.jpg');
  });

  it('400s an unsupported image type from storage', async () => {
    const { db } = makeDb([{ id: 'v1', owner_id: 'u1', images: [] }]);
    (storage.putVenueImage as jest.Mock).mockRejectedValue(new Error('unsupported image type'));
    const svc = new MediaService(db as never, storage);
    await expect(svc.uploadVenueImage('u1', 'VenueOwner', 'v1', FILE)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('maps a storage outage to 502 (not a silent 400)', async () => {
    const { db } = makeDb([{ id: 'v1', owner_id: 'u1', images: [] }]);
    (storage.putVenueImage as jest.Mock).mockRejectedValue(new Error('connect ECONNREFUSED'));
    const svc = new MediaService(db as never, storage);
    await expect(svc.uploadVenueImage('u1', 'VenueOwner', 'v1', FILE)).rejects.toThrow(
      'Image storage is unavailable',
    );
  });
});

describe('MediaService.removeVenueImage', () => {
  it('filters the path out and deletes the object', async () => {
    const rows = {
      select: jest
        .fn()
        // first call: venue ownership; second call: current images
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([{ id: 'v1', owner_id: 'u1' }]),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([
                { images: ['/media/venues/v1/a.jpg', '/media/venues/v1/b.jpg'] },
              ]),
            }),
          }),
        }),
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(undefined),
        }),
      }),
    };
    const svc = new MediaService(rows as never, storage);
    const next = await svc.removeVenueImage('u1', 'VenueOwner', 'v1', '/media/venues/v1/a.jpg');
    expect(next).toEqual(['/media/venues/v1/b.jpg']);
    expect(storage.deleteVenueImage).toHaveBeenCalledWith('/media/venues/v1/a.jpg');
  });

  it('400s a path outside the managed prefix', async () => {
    const { db } = makeDb([{ id: 'v1', owner_id: 'u1' }]);
    const svc = new MediaService(db as never, storage);
    await expect(
      svc.removeVenueImage('u1', 'Admin', 'v1', '/etc/passwd'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
