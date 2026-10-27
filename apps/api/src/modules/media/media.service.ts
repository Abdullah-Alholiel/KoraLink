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

    // PR-Agent r4 (run #170): ATOMIC append — the old read-then-write lost
    // concurrent uploads (two 201s, one silently gone). The array is now
    // appended SQL-side (`images || '["path"]'::jsonb`) with dedup + cap
    // evaluated INSIDE the CASE, so racing writers merge instead of overwrite.
    const updated = await this.db
      .update(venues)
      .set({
        images: sql`CASE
          WHEN ${venues.images} @> ${JSON.stringify([stored.path])}::jsonb THEN ${venues.images}
          WHEN jsonb_array_length(${venues.images}) >= ${MAX_VENUE_IMAGES} THEN ${venues.images}
          ELSE ${venues.images} || ${JSON.stringify([stored.path])}::jsonb
        END`,
        updated_at: new Date(),
      })
      .where(eq(venues.id, venueId))
      .returning({ images: venues.images });
    if (!updated.length) {
      // Venue vanished mid-request — the object is stored but unreferenced.
      await this.storage.deleteVenueImage(stored.path);
      throw new BadRequestException('Venue no longer exists.');
    }
    const result = Array.isArray(updated[0].images) ? (updated[0].images as string[]) : [];
    if (!result.includes(stored.path)) {
      // Cap or dedup said no — the object is stored but unreferenced.
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
    // PR-Agent r2 (run #170): scope the delete to THIS venue's key prefix —
    // the generic managed-prefix check alone would let a partner delete
    // another venue's stored object by naming its path (tenant isolation).
    const venuePrefix = `/media/venues/${venueId}/`;
    if (!path.startsWith(venuePrefix)) {
      throw new BadRequestException('Image path does not belong to this venue.');
    }

    // PR-Agent r4 (run #170): ATOMIC remove (`images - '["path"]'::jsonb`)
    // so a remove racing an append cannot resurrect or duplicate entries.
    const updated = await this.db
      .update(venues)
      .set({
        images: sql`${venues.images} - ${JSON.stringify([path])}::jsonb`,
        updated_at: new Date(),
      })
      .where(eq(venues.id, venueId))
      .returning({ images: venues.images });
    const next = Array.isArray(updated[0]?.images) ? (updated[0]!.images as string[]) : [];
    await this.storage.deleteVenueImage(path);
    return next;
  }
}

/** Serialize a string[] for inline SQL (jsonb literal, single-quote escaped). */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for the P2-268 orphan-sweep query builder
function jsonbOf(arr: string[]): string {
  return JSON.stringify(arr).replace(/'/g, "''");
}
