/**
 * Run #94 (Reviewer-A P2-136, PR-Agent round 3 DRY note): the KoraLink id
 * shape lives here so every id-bearing DTO validates the SAME way.
 *
 * Convention: ALL id columns are varchar(36) — never native uuid. Id-shaped
 * fields use this UUID regex + @MaxLength(36), NOT @IsUUID (documented drift
 * per the MarkNoShowDto/CastVoteDto run-#41 note).
 */
export const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const UUID_SHAPE_MSG = 'must be a 36-char UUID-shaped id';
