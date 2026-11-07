/**
 * Escape LIKE/ILIKE wildcards in user-supplied search terms (P2-158, run #107).
 *
 * Without this, a literal search for "100%" or "under_score" is treated as a
 * wildcard pattern — "100%" matches nearly every row and degrades the listing.
 * Values are always parameterized (no injection risk); this is purely results
 * correctness.
 *
 * The result MUST be used with an explicit `ESCAPE '\'` clause in the SQL
 * fragment. Reference pattern: admin/audit.controller.ts (action filter).
 */
export function escapeLikePattern(term: string): string {
  return term.replace(/[\\%_]/g, (m) => '\\' + m);
}
