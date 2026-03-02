/**
 * Merges an `updated_at` timestamp into any Drizzle `.set()` payload.
 *
 * Unlike Prisma, Drizzle does NOT automatically set `updated_at` on every
 * update. Always wrap update payloads with this helper to avoid stale
 * timestamps in the database.
 *
 * The shallow spread is intentional and safe: Drizzle SQL template-tag values
 * (e.g. `sql\`${col} + ${delta}\``) are plain object references — spreading
 * them into a new object preserves those references correctly.  `updated_at`
 * is placed after the spread so it always overrides any caller-supplied value.
 *
 * @example
 * await db.update(users)
 *   .set(withTimestamp({ full_name: dto.full_name }))
 *   .where(eq(users.id, userId));
 *
 * @example — with SQL expression
 * await tx.update(users)
 *   .set(withTimestamp({ wallet_balance: sql`${users.wallet_balance} + ${delta}` }))
 *   .where(eq(users.id, userId));
 */
export const withTimestamp = <T extends object>(
  data: T,
): T & { updated_at: Date } => ({
  ...data,
  updated_at: new Date(),
});
