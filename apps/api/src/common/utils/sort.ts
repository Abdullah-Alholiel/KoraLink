import { SQL, sql } from 'drizzle-orm';

export type SortDirection = 'asc' | 'desc';

/**
 * Whitelisted ORDER BY builder (admin-table-restructure, 2026-09-07).
 *
 * Sorting moved from fixed ORDER BYs to an optional `?sortBy=&dir=` control.
 * SECURITY: `sortBy` is NEVER interpolated — it is only used as a KEY lookup
 * into the caller-supplied whitelist map. An unknown or missing key silently
 * falls back to the endpoint default (never a 400/500), so existing clients
 * are unaffected. `dir` accepts only 'asc' | 'desc'.
 */
export function whitelistedOrderBy(
  sortBy: string | undefined,
  dir: string | undefined,
  columns: Record<string, unknown>,
  defaultColumn: unknown,
  defaultDir: SortDirection = 'desc',
): SQL {
  const direction: SortDirection =
    dir === 'asc' ? 'asc' : dir === 'desc' ? 'desc' : defaultDir;
  const col = (sortBy && columns[sortBy]) || defaultColumn;
  return direction === 'asc' ? sql`${col} ASC` : sql`${col} DESC`;
}
