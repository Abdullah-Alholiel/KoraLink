import { BadRequestException, ForbiddenException, Injectable, InternalServerErrorException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as Sentry from '@sentry/node';
import * as schema from '../../database/schema';
import { users, venues } from '../../database/schema';
import { StorageService, MAX_UPLOAD_BYTES, MAX_AVATAR_BYTES } from '../../common/storage/storage.service';

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

  // ── Avatars (P2-50, run #181) ─────────────────────────────────────────────

  /**
   * Store a player avatar and persist it on the user row in ONE flow.
   * The users row is the source of truth (same rule as venue images): the
   * previous object is deleted best-effort AFTER the write lands, so a crash
   * can orphan an old object but never lose the new reference.
   * Error mapping mirrors uploadVenueImage (typed messages → 4xx/5xx).
   */
  async uploadAvatar(
    userId: string,
    file: { buffer: Buffer; size: number; mimetype?: string },
  ): Promise<{ avatarUrl: string }> {
    if (!file || !file.buffer || !file.buffer.length) {
      throw new BadRequestException('No file uploaded (multipart field "file").');
    }
    if (file.size > MAX_AVATAR_BYTES) {
      throw new BadRequestException('Avatar exceeds the 2 MB limit.');
    }

    const current = await this.getCurrentUserAvatar(userId);
    if (current === undefined) throw new NotFoundException('User not found.');

    let stored: { path: string; bytes: number; mime: string };
    try {
      stored = await this.storage.putAvatar(userId, file.buffer, file.mimetype);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('avatars bucket not configured')) {
        throw new ServiceUnavailableException('Avatar storage is not configured.');
      }
      if (msg.includes('unsupported image type')) {
        throw new BadRequestException('Only JPEG, PNG or WebP images are accepted.');
      }
      if (msg.includes('too large')) {
        throw new BadRequestException('Avatar exceeds the 2 MB limit.');
      }
      Sentry.captureException(err, { tags: { scope: 'media.avatarUpload' } });
      throw new InternalServerErrorException('Image storage is unavailable — try again shortly.');
    }

    const updated = await this.setUserAvatar(userId, stored.path);
    if (!updated) {
      // User vanished mid-request (PDPL purge race) — the object is stored
      // but unreferenced; clean it up and surface 404.
      await this.storage.deleteAvatar(stored.path);
      throw new NotFoundException('User not found.');
    }

    // Best-effort cleanup of the PREVIOUS object — only when it was a managed
    // avatar path of THIS user (cross-user deletes are structurally impossible:
    // the prefix check + putAvatar's userId-keyed paths pin ownership).
    if (
      current &&
      current !== stored.path &&
      this.storage.isManagedAvatarPath(current) &&
      current.startsWith(`/media/avatars/${userId}/`)
    ) {
      await this.storage.deleteAvatar(current);
    }

    return { avatarUrl: stored.path };
  }

  /** Read a stored avatar (public serve route; avatar-bucket-pinned). */
  async serveAvatar(key: string): Promise<{ body: Buffer; contentType: string } | null> {
    const s3key = key.startsWith('avatars/') ? key : `avatars/${key}`;
    if (!this.storage.isManagedAvatarPath(`/media/${s3key}`)) return null;
    const img = await this.storage.getAvatar(`/media/${s3key}`);
    return img ? { body: img.body, contentType: img.contentType } : null;
  }

  /** Current avatar_url of a user, or null when missing/unset; null-null = no user. */
  private async getCurrentUserAvatar(userId: string): Promise<string | null | undefined> {
    const [row] = await this.db
      .select({ avatar_url: users.avatar_url })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return row ? row.avatar_url : undefined;
  }

  /** Guarded avatar write; returns false when the user row vanished (purge race). */
  private async setUserAvatar(userId: string, path: string): Promise<boolean> {
    const updated = await this.db
      .update(users)
      .set({ avatar_url: path })
      .where(eq(users.id, userId))
      .returning({ id: users.id });
    return updated.length > 0;
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

    // PR-Agent r4 (run #170): ATOMIC remove so a remove racing an append
    // cannot resurrect or duplicate entries.
    // PR-Agent r10 (run #171, live-PG-verified): `jsonb - jsonb` DOES NOT
    // EXIST as an operator — the r4 cast form 500s at runtime. `jsonb - text`
    // deletes the matching string element and keeps atomicity (verified on
    // the staging DB: `'"[\"a\",\"b\"]"'::jsonb - 'a'` → `["b"]`).
    const updated = await this.db
      .update(venues)
      .set({
        images: sql`${venues.images} - ${path}`,
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
