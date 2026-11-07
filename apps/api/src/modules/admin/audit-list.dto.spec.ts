import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ListAuditDto, AUDIT_ENTITY_TYPES } from './dto/list-audit.dto';

/**
 * P2-308 (run #187, Reviewer A #186 + Reviewer B #187): the audit-list query
 * DTO hardened — entityType was a bare @IsString (a non-UI caller could probe
 * arbitrary entity_type strings and get silent empty results) and adminId was
 * an unshaped string (a malformed id silently matched nothing). The console UI
 * already sends only valid values (ENTITY_TYPES select), so the narrowed API
 * cannot break it.
 *
 * Behavioral pins follow the dto-caps.spec.ts house pattern (run #94).
 */
const VALID_ID = '0b7f6c1e-1111-4222-8333-444455556666';

const errsOn = (payload: Record<string, unknown>, prop: string) =>
  validateSync(plainToInstance(ListAuditDto, payload)).filter(
    (e) => e.property === prop,
  );

describe('ListAuditDto (P2-308 hardening contract)', () => {
  it('accepts the console-shaped query (valid entityType + adminId + paging)', () => {
    expect(
      errsOn(
        { entityType: 'venue_review', adminId: VALID_ID, page: 1, perPage: 50 },
        'entityType',
      ),
    ).toHaveLength(0);
    expect(
      errsOn(
        { entityType: 'venue_review', adminId: VALID_ID, page: 1, perPage: 50 },
        'adminId',
      ),
    ).toHaveLength(0);
  });

  it('accepts omitted filters (all defaults valid)', () => {
    const dto = plainToInstance(ListAuditDto, {});
    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.perPage).toBe(50);
  });

  it('rejects an entityType outside the 11 audited types', () => {
    expect(errsOn({ entityType: 'venue_reviews' }, 'entityType').length).toBeGreaterThan(0);
    expect(errsOn({ entityType: 'DROP TABLE' }, 'entityType').length).toBeGreaterThan(0);
    expect(errsOn({ entityType: '' }, 'entityType').length).toBeGreaterThan(0);
  });

  it('rejects a malformed adminId (was silent no-match before)', () => {
    expect(errsOn({ adminId: 'not-an-id' }, 'adminId').length).toBeGreaterThan(0);
    expect(errsOn({ adminId: 'x'.repeat(37) }, 'adminId').length).toBeGreaterThan(0);
  });

  it('accepts every value in AUDIT_ENTITY_TYPES (console select parity)', () => {
    for (const et of AUDIT_ENTITY_TYPES) {
      expect(errsOn({ entityType: et }, 'entityType')).toHaveLength(0);
    }
  });
});
