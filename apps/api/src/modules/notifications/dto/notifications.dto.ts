import { IsNotEmpty, IsUrl } from 'class-validator';

/**
 * P2-76 (run #65): body for push unsubscribe. The push endpoint is the only
 * field — a strict class DTO lets the global ValidationPipe
 * (main.ts:110-113, whitelist + forbidNonWhitelisted) actually validate it,
 * which was impossible before (the controller used a plain TS interface,
 * invisible to the pipe). `@IsUrl` keeps junk/mistyped endpoints out of the
 * scoped delete; `require_tld` blocks localhost/internal meta-addresses
 * (defense-in-depth with the service's SSRF allowlist on the send path).
 */
export class UnsubscribeDto {
  @IsUrl({ require_tld: true })
  @IsNotEmpty()
  endpoint!: string;
}
