/**
 * Run #94 (Reviewer-A P2-136, PR-Agent round 3 DRY note): the KoraLink id
 * shape lives here so every id-bearing DTO validates the SAME way.
 *
 * Convention: ALL id columns are varchar(36) — never native uuid. Id-shaped
 * fields use this UUID regex + @MaxLength(36), NOT @IsUUID (documented drift
 * per the MarkNoShowDto/CastVoteDto run-#41 note).
 */
import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
export const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const UUID_SHAPE_MSG = 'must be a 36-char UUID-shaped id';

/**
 * P2-241 (run #153 cluster, item 7): route-param sibling of the DTO-level
 * UUID_SHAPE convention. Same regex, same house rule — all id columns are
 * varchar(36), so path params are shape-checked, never scheme-parsed.
 * A garbage `:id` now 400s cleanly instead of running a doomed query that
 * 500s (or worse, 404s from a shape the client should never have sent).
 */
@Injectable()
export class ParseUuidShapePipe implements PipeTransform<string> {
  transform(value: string): string {
    if (!UUID_SHAPE.test(value)) {
      throw new BadRequestException(`id ${UUID_SHAPE_MSG}`);
    }
    return value;
  }
}
