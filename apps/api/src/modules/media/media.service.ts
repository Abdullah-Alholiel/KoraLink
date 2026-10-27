import { BadRequestException, ForbiddenException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as Sentry from '@sentry/node';
import * as schema from '../../database/schema';
import { venues } from '../../database/schema';
import { StorageService, MAX_UPLOAD_BYTES } from '../../common/storage/storage.service';

type DB = PostgresJsDatabase<typeof schema>;

/** venues.images cap — moderation-sane, keeps the admin grid tidy. */
export const MAX_VENUE_IMAGES = 6;

/**
 * Media service (P1-38, run #170): venue photo upload + serve.
 *
 * Ownership + venue validation live here (venue-scoped SQL — hex-clean:
 * no cross-module service import). The storage client (StorageService) is a
 * common/ port consumed via DI; failures map to 502 with Sentry capture so
 * a storage outage is visible, not silent.
 */
@Injectable()
export class MediaService {
  constructor(
    @Inject('DB_CONNECTION') private readonly db: DB,
    private readonly storage: StorageService,
  ) {}

  /**
   * Store an image and APPEND it to the venue's images array in ONE flow.
   * Returns the canonical path. The append happens server-side so a client
   * crash between upload and PATCH can never orphan an image silently —
   * the venue row is the source of truth.
   */
  async uploadVenueImage(
    actorId: string,
    actorRole: string,
    venueId: string,
    file: { buffer: Buffer; size: number; mimetype?: string },
  ): Promise<{ path: string; bytes: number }> {
    if (!file || !file.buffer || !file.buffer.length) {
      throw new BadRequestException('No file uploaded (multipart field "file").');
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new BadRequestException('Image exceeds the 5 MB limit.');
    }

    // Venue must exist; non-admins must own it (same rule as partner updateVenue).
    const [venue] = await this.db
      .select({ id: venues.id, owner_id: venues.owner_id, images: venues.images })
      .from(venues)
      .where(eq(venues.id, venueId))
      .limit(1);
    if (!venue) throw new NotFoundException('Venue not found.');
    if (actorRole !== 'Admin' && venue.owner_id !== actorId) {
      throw new ForbiddenException('You can only upload photos for your own venues.');
    }

    // Cap check against the CURRENT stored array (concurrent uploads may
    // exceed by a race; the append is idempotent-per-path so worst case is
    // a 7th image on a truly simultaneous pair — acceptable, documented).
    const current = Array.isArray(venue.images) ? (venue.images as string[]) : [];
    if (current.length >= MAX_VENUE_IMAGES) {
      throw new BadRequestException(`Venue already has the maximum of ${MAX_VENUE_IMAGES} photos.`);
    }

    let stored: { path: string; bytes: number; mime: string };
    try {
      stored = await this.storage.putVenueImage(venueId, file.buffer, file.mimetype);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('unsupported image type')) {
        throw new BadRequestException('Only JPEG, PNG or WebP images are accepted.');
      }
      if (msg.includes('too large')) {
        throw new BadRequestException('Image exceeds the 5 MB limit.');
      }
      Sentry.captureException(err, { tags: { scope: 'media.upload' } });
      throw new InternalServerErrorException('Image storage is unavailable — try again shortly.');
    }

    // Append to the venue row. Dedup by path (sha256 key makes a re-upload of
    // the same bytes a no-op) + cap re-check INSIDE the predicate so a raced
    // pair cannot push past 6 via the UPDATE itself.
    const next = [...current.filter((p) => p !== stored.path), stored.path].slice(0, MAX_VENUE_IMAGES);
    const updated = await this.db
      .update(venues)
      .set({ images: sql`${jsonbOf(next)}::jsonb`, updated_at: new Date() })
      .where(and(eq(venues.id, venueId), sql`jsonb_array_length(${venues.images}) < ${MAX_VENUE_IMAGES}`))
      .returning({ id: venues.id });
    if (!updated.length) {
      // Lost a race against the cap — the object is stored but unreferenced.
      await this.storage.deleteVenueImage(stored.path);
      throw new BadRequestException(`Venue already has the maximum of ${MAX_VENUE_IMAGES} photos.`);
    }

    return { path: stored.path, bytes: stored.bytes };
  }

  /** Read a stored venue image (public serve route; bucket-pinned inside StorageService). */
  async serveVenueImage(key: string): Promise<{ body: Buffer; contentType: string } | null> {
    // The route consumes /media/venues — the caller passes "<venueId>/<file>";
    // reconstruct the S3 key ("venues/<venueId>/<file>") defensively either way.
    const s3key = key.startsWith('venues/') ? key : `venues/${key}`;
    if (!this.storage.isManagedVenuePath(`/media/${s3key}`)) return null;
    return this.storage.getVenueImage(`/media/${s3key}`);
  }

  /** Remove a path from the venue's array (admin/partner form delete button). */
  async removeVenueImage(actorId: string, actorRole: string, venueId: string, path: string): Promise<string[]> {
    const [venue] = await this.db
      .select({ id: venues.id, owner_id: venues.owner_id })
      .from(venues)
      .where(eq(venues.id, venueId))
      .limit(1);
    if (!venue) throw new NotFoundException('Venue not found.');
    if (actorRole !== 'Admin' && venue.owner_id !== actorId) {
      throw new ForbiddenException('You can only edit your own venues.');
    }
    if (!this.storage.isManagedVenuePath(path)) {
      throw new BadRequestException('Not a managed venue image path.');
    }

    const [row] = await this.db
      .select({ images: venues.images })
      .from(venues)
      .where(eq(venues.id, venueId))
      .limit(1);
    const current = Array.isArray(row?.images) ? (row!.images as string[]) : [];
    const next = current.filter((p) => p !== path);
    await this.db
      .update(venues)
      .set({ images: sql`${jsonbOf(next)}::jsonb`, updated_at: new Date() })
      .where(eq(venues.id, venueId));
    await this.storage.deleteVenueImage(path);
    return next;
  }
}

/** Serialize a string[] for inline SQL (jsonb literal, single-quote escaped). */
function jsonbOf(arr: string[]): string {
  return JSON.stringify(arr).replace(/'/g, "''");
}
