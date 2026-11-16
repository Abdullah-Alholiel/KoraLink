/**
 * Low-frequency freshness poll for paged list screens (play feed, DM list,
 * discussions). The server only broadcasts list-relevant events into
 * per-match / per-conversation rooms, and joining conversation rooms from a
 * list would mark them read — so lists poll instead (mirrors the admin
 * portal's 30s use-live-data pattern).
 */
export const LIST_REFRESH_MS = 45_000;

/**
 * refetchInterval policy for list infinite queries.
 *
 * Page-1-only guard (F4 fan-out trap): react-query v5 refetches ALL loaded
 * pages of an infinite query on an interval refetch — the same trap the F4
 * comment in useMatches warns about (up to 10×50 rows per refetch). So the
 * poll runs only while the deepest loaded page is still the first page
 * (pageParam 0 for offset paging, 1 for page-number paging) and stops once
 * the user has paged deeper. It also pauses while a fetch is in flight and
 * while the tab is hidden.
 */
export function listRefetchInterval(ctx: {
  isFetching: boolean;
  pageParam: unknown;
}): number | false {
  if (ctx.isFetching) return false;
  if (ctx.pageParam !== 0 && ctx.pageParam !== 1) return false;
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
    return false;
  }
  return LIST_REFRESH_MS;
}

/**
 * The pageParam of the deepest loaded page of an infinite query's data
 * (0 before anything has loaded) — the input listRefetchInterval guards on.
 */
export function deepestPageParam(data: { pageParams: unknown[] } | undefined): unknown {
  const params = data?.pageParams;
  return params && params.length > 0 ? params[params.length - 1] : 0;
}
