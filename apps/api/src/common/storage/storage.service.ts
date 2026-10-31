import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, randomUUID } from 'crypto';
import * as Sentry from '@sentry/node';

/**
 * Minimal S3 client for the self-hosted SeaweedFS gateway (P1-38, run #170).
 *
 * Zero-dependency AWS SigV4 (aws-sdk is intentionally NOT a dependency —
 * a 3-package tree + heavy install for four operations on one fixed endpoint;
 * docs/plans/upload-pipeline-vps/00-plan.md keeps storage lean).
 *
 * Contract with the storage service (koralink-storage.service, 127.0.0.1:8333):
 * - PUT /<bucket>/<key>  (SigV4, payload hash in header)
 * - GET  /<bucket>/<key> (SigV4)
 * - DELETE /<bucket>/<key> (SigV4)
 * Keys are sha256-prefixed and immutable — uploads never overwrite a different
 * object, and deletes only target keys this module generated.
 */

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
/** 5 MB — venue photos, not originals. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
/** 2 MB — avatars are small square photos; the client downscale target. */
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

/** Magic-byte sniffing — never trust the client-declared Content-Type. */
function sniffMime(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) {
    return 'image/png';
  }
  // WebP: "RIFF" .... "WEBP"
  if (
    buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

export interface StoredObject {
  /** Path as stored in venues.images — also the public serve path. */
  path: string;
  bytes: number;
  mime: string;
}

@Injectable()
export class StorageService {
  private readonly endpoint: string; // http://127.0.0.1:8333
  private readonly bucket: string;
  private readonly avatarBucket: string;
  private readonly accessKey: string;
  private readonly secretKey: string;
  private readonly region: string;

  constructor(config: ConfigService) {
    // Boot-time hard requirements — same posture as JWT_SECRET (P0-3):
    // a misconfigured storage env must fail loudly, not 502 every upload.
    this.endpoint = (config.get<string>('S3_ENDPOINT') ?? 'http://127.0.0.1:8333').replace(/\/+$/, '');
    this.bucket = config.get<string>('S3_BUCKET_VENUES') ?? '';
    this.accessKey = config.get<string>('S3_ACCESS_KEY') ?? '';
    this.secretKey = config.get<string>('S3_SECRET_KEY') ?? '';
    this.region = config.get<string>('S3_REGION') ?? 'us-east-1';
    if (!this.bucket || !this.accessKey || !this.secretKey) {
      throw new Error(
        'Storage env incomplete: S3_BUCKET_VENUES / S3_ACCESS_KEY / S3_SECRET_KEY are required (see docs/plans/upload-pipeline-vps/00-plan.md).',
      );
    }
    // Avatars live in a SECOND bucket (P2-50, run #181). OPTIONAL at boot so a
    // Render/Vercel deploy without the key still serves venues; the avatar
    // endpoints map the empty bucket to a typed 503 instead of crashing boot.
    this.avatarBucket = config.get<string>('S3_BUCKET_AVATARS') ?? '';
  }

  /** True when the avatars bucket is configured (else avatar routes 503). */
  get avatarConfigured(): boolean {
    return this.avatarBucket.length > 0;
  }

  /** True when the caller may serve from this module's bucket (path-prefix defense). */
  isManagedVenuePath(path: string): boolean {
    return (
      path.startsWith('/media/venues/') &&
      /^[A-Za-z0-9/._-]+$/.test(path.slice('/media/'.length)) &&
      !path.includes('..')
    );
  }

  /**
   * Store an uploaded venue image. Returns the canonical /media/venues/... path.
   * Throws BadRequest on bad mime/size; the caller maps storage failures.
   */
  async putVenueImage(venueId: string, buf: Buffer, declaredMime: string | undefined): Promise<StoredObject> {
    if (!buf.length) throw new Error('empty body');
    if (buf.length > MAX_UPLOAD_BYTES) throw new Error('file too large');
    // Magic bytes ONLY (PR-Agent r1 run #170): a client-declared Content-Type
    // is never trusted — sniff failure = reject, so non-image bytes can never
    // be stored and served under an image/* content type. (multer's busboy
    // `fileSize` limit already aborts oversized bodies pre-buffer.)
    const mime = sniffMime(buf);
    if (!mime || !ALLOWED_MIME.has(mime)) throw new Error('unsupported image type');

    const sha = createHash('sha256').update(buf).digest('hex');
    const ext = MIME_EXT[mime];
    const key = `venues/${venueId}/${sha}.${ext}`;
    const res = await this.sigv4Request('PUT', `/${this.bucket}/${key}`, buf, {
      'Content-Type': mime,
    });
    // A failed PUT must NOT return a path (run #170 live bug: an unsigned
    // x-amz-meta-* header made SeaweedFS reject the signature, and without
    // this check the API still answered 201 with a path to a nonexistent
    // object). Every x-amz-* header MUST be signed — never add extras here.
    if (res.status !== 200) {
      const detail = await res.text().catch(() => '');
      throw new Error(`storage PUT ${res.status}: ${detail.slice(0, 200)}`);
    }
    return { path: `/media/${key}`, bytes: buf.length, mime };
  }

  /** Fetch a managed object's bytes + content type (public serve route backing). */
  async getVenueImage(
    key: string,
  ): Promise<{ body: Buffer; contentType: string; length: number } | null> {
    const s3key = key.replace(/^\/media\//, '');
    if (!s3key.startsWith('venues/') || s3key.includes('..')) return null;
    try {
      const res = await this.sigv4Request('GET', `/${this.bucket}/${s3key}`, null, {});
      if (res.status === 404) return null;
      if (res.status !== 200) throw new Error(`storage GET ${res.status}`);
      const body = Buffer.from(await res.arrayBuffer());
      return { body, contentType: res.headers.get('content-type') ?? 'application/octet-stream', length: body.length };
    } catch (err) {
      // PR-Agent r3 MINOR (run #170): a storage outage must not be invisible —
      // the serve route maps null → 404, so without this capture a SeaweedFS
      // failure looks like missing photos. Genuine 404s return before this.
      Sentry.captureException(err, { tags: { scope: 'media.serve' } });
      return null;
    }
  }

  /** Best-effort delete when an upload's venue record vanished mid-request. */
  async deleteVenueImage(path: string): Promise<void> {
    const s3key = path.replace(/^\/media\//, '');
    if (!s3key.startsWith('venues/') || s3key.includes('..')) return;
    try {
      await this.sigv4Request('DELETE', `/${this.bucket}/${s3key}`, null, {});
    } catch {
      // Orphan cleanup is best-effort; the object is unreferenced either way.
    }
  }

  // ── Avatars (P2-50, run #181) — second bucket, same zero-dep SigV4 client ──

  /** True when the caller may touch this module's avatar bucket (path-prefix defense). */
  isManagedAvatarPath(path: string): boolean {
    return (
      path.startsWith('/media/avatars/') &&
      /^[A-Za-z0-9/._-]+$/.test(path.slice('/media/'.length)) &&
      !path.includes('..')
    );
  }

  /**
   * Store an uploaded avatar. Returns the canonical /media/avatars/... path.
   * Throws Error('avatars bucket not configured') / Error('unsupported image
   * type') / Error('file too large') / storage PUT errors — the caller maps them.
   */
  async putAvatar(userId: string, buf: Buffer, declaredMime: string | undefined): Promise<StoredObject> {
    if (!this.avatarBucket) throw new Error('avatars bucket not configured');
    void declaredMime; // never trusted — magic bytes only (same rule as venues)
    if (!buf.length) throw new Error('empty body');
    if (buf.length > MAX_AVATAR_BYTES) throw new Error('file too large');
    const mime = sniffMime(buf);
    if (!mime || !ALLOWED_MIME.has(mime)) throw new Error('unsupported image type');

    const sha = createHash('sha256').update(buf).digest('hex');
    const ext = MIME_EXT[mime];
    const key = `avatars/${userId}/${sha}.${ext}`;
    const res = await this.sigv4Request('PUT', `/${this.avatarBucket}/${key}`, buf, {
      'Content-Type': mime,
    });
    if (res.status !== 200) {
      const detail = await res.text().catch(() => '');
      throw new Error(`storage PUT ${res.status}: ${detail.slice(0, 200)}`);
    }
    return { path: `/media/${key}`, bytes: buf.length, mime };
  }

  /** Fetch a managed avatar's bytes (public serve route backing; avatar-bucket-pinned). */
  async getAvatar(
    key: string,
  ): Promise<{ body: Buffer; contentType: string; length: number } | null> {
    if (!this.avatarBucket) return null;
    const s3key = key.replace(/^\/media\//, '');
    if (!s3key.startsWith('avatars/') || s3key.includes('..')) return null;
    try {
      const res = await this.sigv4Request('GET', `/${this.avatarBucket}/${s3key}`, null, {});
      if (res.status === 404) return null;
      if (res.status !== 200) throw new Error(`storage GET ${res.status}`);
      const body = Buffer.from(await res.arrayBuffer());
      return { body, contentType: res.headers.get('content-type') ?? 'application/octet-stream', length: body.length };
    } catch (err) {
      Sentry.captureException(err, { tags: { scope: 'media.avatarServe' } });
      return null;
    }
  }

  /** Best-effort delete of a PREVIOUS avatar object (same-user prefix enforced upstream). */
  async deleteAvatar(path: string): Promise<void> {
    if (!this.avatarBucket) return;
    const s3key = path.replace(/^\/media\//, '');
    if (!s3key.startsWith('avatars/') || s3key.includes('..')) return;
    try {
      await this.sigv4Request('DELETE', `/${this.avatarBucket}/${s3key}`, null, {});
    } catch {
      // Orphan cleanup is best-effort.
    }
  }

  /** Signed request against the SeaweedFS S3 gateway. */
  private async sigv4Request(
    method: 'PUT' | 'GET' | 'DELETE',
    pathAndQuery: string,
    body: Buffer | null,
    extraHeaders: Record<string, string>,
  ): Promise<Response> {
    const url = new URL(this.endpoint + pathAndQuery);
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ''); // YYYYMMDDTHHMMSSZ
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = createHash('sha256').update(body ?? Buffer.alloc(0)).digest('hex');

    const host = url.host;
    const canonicalHeaders =
      `content-type:${extraHeaders['Content-Type'] ?? 'application/octet-stream'}\n` +
      `host:${host}\n` +
      `x-amz-content-sha256:${payloadHash}\n` +
      `x-amz-date:${amzDate}\n`;
    const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';

    const canonicalRequest = [
      method,
      url.pathname,
      '', // no query string used
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    const scope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      scope,
      createHash('sha256').update(canonicalRequest).digest('hex'),
    ].join('\n');

    const kDate = createHmac('sha256', `AWS4${this.secretKey}`).update(dateStamp).digest();
    const kRegion = createHmac('sha256', kDate).update(this.region).digest();
    const kService = createHmac('sha256', kRegion).update('s3').digest();
    const kSigning = createHmac('sha256', kService).update('aws4_request').digest();
    const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');

    const headers: Record<string, string> = {
      ...extraHeaders,
      Host: host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      Authorization:
        `AWS4-HMAC-SHA256 Credential=${this.accessKey}/${scope}, ` +
        `SignedHeaders=${signedHeaders}, Signature=${signature}`,
    };
    // The canonical form ALWAYS signs content-type — the actual request must
    // SEND whatever was signed, or SeaweedFS computes a different canonical
    // request and rejects with SignatureDoesNotMatch (run #170: GET signed
    // octet-stream but sent none → every serve probe 404'd).
    if (!headers['Content-Type']) headers['Content-Type'] = 'application/octet-stream';

    return fetch(url, { method, headers, body: body ? new Uint8Array(body) : undefined });
  }
}

/** Unused today; kept for the future presign leg (public-upload phase). */
export function newUploadId(): string {
  return randomUUID();
}
