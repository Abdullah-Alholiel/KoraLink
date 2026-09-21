import { IsNotEmpty, IsUrl } from 'class-validator';

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
