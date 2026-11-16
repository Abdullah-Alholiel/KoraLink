import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * P2-292 (run #186): the audit list lives in AdminAuditListService — the
 * controller delegates like every other admin controller — and the users join
 * is LEFT, so audit rows whose admin was hard-purged (PDPL erase) stay in the
 * immutable trail (admin_name null → admin console renders "—").
 */
const SRC = join(__dirname);
const CONTROLLER = readFileSync(join(SRC, 'audit.controller.ts'), 'utf8');
const SERVICE = readFileSync(join(SRC, 'audit-list.service.ts'), 'utf8');

describe('AdminAuditController lift (P2-292)', () => {
  it('controller holds NO persistence — it delegates to AdminAuditListService', () => {
    expect(CONTROLLER).toContain('AdminAuditListService');
    expect(CONTROLLER).toContain('this.auditList.list(dto)');
    expect(CONTROLLER.includes('db.execute')).toBe(false);
    expect(CONTROLLER.includes("'DB_CONNECTION'")).toBe(false);
    expect(CONTROLLER.includes('INNER JOIN')).toBe(false);
    // (no LEFT-JOIN check here — the doc comment names the rider; the SQL-level
    // LEFT JOIN assertion lives in the service test below)
  });

  it('service owns the queries AND the users join is LEFT (PDPL purge keeps the row)', () => {
    expect(SERVICE).toContain('LEFT JOIN users u ON u.id = a.admin_id');
    expect(SERVICE.includes('INNER JOIN')).toBe(false);
    expect(SERVICE).toContain('escapeLikePattern');
    expect(SERVICE).toContain("'DB_CONNECTION'");
  });
});
