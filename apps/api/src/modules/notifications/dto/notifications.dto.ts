import { Type } from 'class-transformer';
import {
  IsDefined,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  ValidateNested,
} from 'class-validator';

/**
 * P2-76 (run #65): body for push unsubscribe. The push endpoint is the only
 * field — a strict class DTO lets the global ValidationPipe
 * (main.ts:110-113, whitelist + forbidNonWhitelisted) actually validate it,
 * which was impossible before (the controller used a plain TS interface,
 * invisible to the pipe). `@IsUrl` keeps junk/mistyped endpoints out of the
 * scoped delete. Run #66 (reviewer A): web-push endpoints are https-only by
 * spec, so the DTO now pins `protocols: ['https']` explicitly — validator's
 * default accepts http/ftp too. `require_tld` blocks localhost/internal
 * meta-addresses (defense-in-depth with the service's SSRF allowlist on the
 * send path).
 */
export class UnsubscribeDto {
  @IsUrl({ protocols: ['https'], require_tld: true })
  @IsNotEmpty()
  endpoint!: string;
}

/**
 * P2-82 (run #69): the SAME class-DTO treatment for subscribe — until now it
 * took a plain interface, so `endpoint`/`keys` shipped completely unvalidated
 * and garbage keys only surfaced later as web-push send failures inside the
 * broadcast loop.
 *
 * THE ALLOWLIST DECISION (the reason this stayed an interface through run
 * #65): Chrome's `PushSubscription.toJSON()` includes `expirationTime: null`
 * and the PWA sends `{...sub.toJSON(), locale}` — forbidNonWhitelisted would
 * 400 every real Chrome subscribe unless `expirationTime` is EXPLICITLY
 * whitelisted. It is optional + number-only: absent, `null` and epoch-ms
 * numbers pass; strings/bools/objects 400. It is never persisted (the DB has
 * no such column — same as before this DTO).
 *
 * Key caps: real web-push keys are ~88 chars (p256dh) / ~22-24 chars (auth)
 * base64url. 256/64 are generous ceilings that still block garbage blobs and
 * DB abuse (Reviewer A, run #69).
 */
export class PushKeysDto {
  @IsString()
  @Length(1, 256)
  p256dh!: string;

  @IsString()
  @Length(1, 64)
  auth!: string;
}

export class SubscribeDto {
  /** Identical rules to UnsubscribeDto.endpoint — https + real TLD only. */
  @IsUrl({ protocols: ['https'], require_tld: true })
  @IsNotEmpty()
  endpoint!: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => PushKeysDto)
  keys!: PushKeysDto;

  /** Chrome ships `expirationTime: null` — must be whitelisted, never persisted. */
  @IsOptional()
  @IsNumber()
  expirationTime?: number | null;

  /** App locales only (PWA ships its active locale for push deep-links). */
  @IsOptional()
  @IsIn(['ar', 'en'] as const)
  locale?: 'ar' | 'en';
}
