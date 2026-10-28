import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtCookieAuthGuard } from '../../common/guards/jwt-cookie-auth.guard';
import { MAX_UPLOAD_BYTES } from '../../common/storage/storage.service';
import { MediaService } from './media.service';

/** PR-Agent r3 MINOR (run #170): a malformed venueId must 400, not reach a Drizzle eq() (PG cast error = 500). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Media routes (P1-38 first leg, run #170).
 *
 * POST /media/venues?venueId=… — upload a venue photo (auth; owner-or-admin;
 *   ≤5MB jpeg/png/webp enforced by magic-byte sniffing; 10/min throttle).
 *   The canonical path is APPENDED to venues.images server-side — the venue
 *   row is the source of truth (a crashed client can't orphan an image).
 * GET /media/venues/* — PUBLIC serve of one stored image (immutable cache;
 *   bucket-pinned inside StorageService so only koralink-venues objects are
 *   reachable; 404 unknown key; nosniff).
 */
@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post('venues')
  @UseGuards(JwtCookieAuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  // PR-Agent r1 (run #170): without `limits`, multer buffers the WHOLE body in
  // memory before any size check runs — an authenticated user could exhaust
  // API memory with an oversized multipart body. fileSize aborts the stream
  // at 5 MB (busboy-level, pre-buffer); files=1 pins the single-file shape.
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  uploadVenueImage(
    @CurrentUser() user: { sub: string; role: string },
    @UploadedFile() file: Express.Multer['File'] | undefined,
    @Query('venueId') venueId: string,
  ) {
    if (!venueId || !UUID_RE.test(venueId)) {
      throw new BadRequestException('venueId must be a valid venue id.');
    }
    if (!file?.buffer?.length) {
      throw new BadRequestException('No file uploaded (multipart field "file").');
    }
    return this.media.uploadVenueImage(user.sub, user.role, venueId, {
      buffer: file.buffer,
      size: file.size,
      mimetype: file.mimetype,
    });
  }

  // Express 4 / path-to-regexp v0 (Nest 10): a bare `*` wildcard puts the
  // whole tail in req.params[0] — the named `*path` form only works on
  // Express 5 (probed live 2026-10-27: `*path` mapped but never matched).
  // PR-Agent r9 (run #171): the GET is a byte-streaming proxy read against
  // SeaweedFS (up to 5 MB per hit) — the global 60/min APP_GUARD alone is
  // too loose for unauthenticated bandwidth amplification; images are
  // immutable + browser-cached (1y), so 60/min/IP costs real users nothing.
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @Get('venues/*')
  async serveVenueImage(@Param() params: Record<string, string>, @Res() res: Response): Promise<void> {
    const tail = params['0'] ?? '';
    // PR-Agent r3 MINORs (run #170): scope decodeURIComponent (a stray % would
    // throw URIError → 500); reject `..` traversal + pin to the path charset.
    let key: string;
    try {
      key = decodeURIComponent(tail);
    } catch {
      throw new BadRequestException('Bad image path encoding.');
    }
    if (!key || key.includes('..') || !/^[A-Za-z0-9/._-]+$/.test(key)) {
      throw new BadRequestException('Bad image path.');
    }
    // key = "<venueId>/<sha>.<ext>" — the /media/venues prefix is consumed by
    // the route itself (Express 4 wildcard = params[0] tail only).
    const img = await this.media.serveVenueImage(key);
    if (!img) {
      res.status(404).json({ message: 'Image not found.' });
      return;
    }
    res.setHeader('Content-Type', img.contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(img.body);
  }
}
