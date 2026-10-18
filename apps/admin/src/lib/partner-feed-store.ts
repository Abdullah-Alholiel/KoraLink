'use client';

import { useSyncExternalStore } from 'react';

/**
 * Partner directed-feed store (P2-214, run #142) — the VenueOwner side of the
 * console bell.
 *
 * The ops feed (ops-activity-store) is intentionally EMPTY for VenueOwner
 * consoles: ops-room pings are platform-wide and payload-free
 * (app.gateway.ts:213 — owner call P1-60 gates the tenant-scoped fix), and
 * `isEntityInScope` filters VenueOwner out (run #99 stopgap) so a partner is
 * never shown aggregate counts of other tenants' activity. The price was
 * that partners heard NOTHING — including their own settlement payouts.
 *
 * This store gives partners a bell that carries ONLY directed, personal
 * items: it hydrates from `GET /users/me/notifications` (the same per-user
 * directed feed the PWA consumes — the caller's JWT scopes every row; no
 * cross-tenant data can reach the console) and appends realtime items from
 * the user-directed `notification` socket event when it arrives on the ops
 * socket connection. Item shape mirrors the API's FeedItem (verb + actor +
 * match) — payout items carry no match and render as a settlements row.
 *
 * Deliberately NOT persisted and deliberately a SEPARATE store (same
 * session-scoped call as ops-activity-store): admins keep the platform ops
 * feed; partners get only what is addressed to them.
 */

export interface PartnerFeedItem {
  /** feed_items.id — stable React key + mark-read identity. */
  id: string;
  verb: string;
  actorName: string | null;
  /** Match context when the activity carries one (payout items carry none). */
  matchTitle: string | null;
  venueName: string | null;
  isRead: boolean;
  createdAt: string;
}

/** Ops-entity class a verb maps to — reuses the ops feed's icon/chip/labels. */
export type FeedEntityClass =
  | 'users'
  | 'matches'
  | 'venues'
  | 'pitches'
  | 'disputes'
  | 'transactions'
  | 'settlements'
  | 'settings'
  | 'reports';

const VERB_ENTITY: Record<string, FeedEntityClass> = {
  payout_paid: 'settlements',
  wallet_refunded: 'transactions',
  account_suspended: 'users',
  account_banned: 'users',
  account_unbanned: 'users',
  created_match: 'matches',
  joined_match: 'matches',
  match_cancelled_admin: 'matches',
  match_rescheduled: 'matches',
  waitlist_promoted: 'matches',
  player_removed: 'matches',
  no_show_marked: 'matches',
  host_underfilled_nudge: 'matches',
  dispute_resolved: 'disputes',
  dispute_rejected: 'disputes',
  report_resolved: 'reports',
  venue_ownership_added: 'venues',
  venue_ownership_removed: 'venues',
  followed: 'venues',
};

export function feedEntityOf(verb: string): FeedEntityClass {
  return VERB_ENTITY[verb] ?? 'matches';
}

export interface PartnerFeedSnapshot {
  /** Newest first, capped at MAX_PARTNER_ENTRIES. */
  items: PartnerFeedItem[];
  unread: number;
  /** False until the first hydrate resolves (drives the loading state). */
  hydrated: boolean;
  /** Last hydrate failed (error state + retry; stale items still render). */
  error: boolean;
}

const MAX_PARTNER_ENTRIES = 30;

const SERVER_SNAPSHOT: PartnerFeedSnapshot = {
  items: [],
  unread: 0,
  hydrated: false,
  error: false,
};

let items: PartnerFeedItem[] = [];
let unread = 0;
let hydrated = false;
let error = false;
/** Bumped by markPartnerFeedRead so an in-flight hydrate can detect it. */
let readEpoch = 0;
let snapshot = SERVER_SNAPSHOT;

const subscribers = new Set<() => void>();

function emit(): void {
  snapshot = { items, unread, hydrated, error };
  subscribers.forEach((cb) => {
    try {
      cb();
    } catch {
      // A broken subscriber must not block the others.
    }
  });
}

function subscribe(cb: () => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

function getSnapshot(): PartnerFeedSnapshot {
  return snapshot;
}

function getServerSnapshot(): PartnerFeedSnapshot {
  return SERVER_SNAPSHOT;
}

/** Reactive partner-feed state — consumed by the bell and the feed drawer. */
export function usePartnerFeed(): PartnerFeedSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Raw API item (the API's FeedItem, JSON-serialised). */
export interface ApiFeedItem {
  id: string;
  verb: string;
  actor?: { name?: string | null } | null;
  match?: { title?: string | null; venueName?: string | null } | null;
  isRead: boolean;
  createdAt: string;
}

function mapApiItem(it: ApiFeedItem): PartnerFeedItem {
  return {
    id: it.id,
    verb: it.verb,
    actorName: it.actor?.name ?? null,
    matchTitle: it.match?.title ?? null,
    venueName: it.match?.venueName ?? null,
    isRead: it.isRead,
    createdAt: it.createdAt,
  };
}

/**
 * Hydrate once per console session. Called from NotificationCenter's mount
 * effect for VenueOwner sessions ONLY (admins keep the ops feed). Failures
 * leave hydrated=false: an unreachable API must not break the console
 * shell — the drawer simply keeps its empty state and a later bell toggle
 * retries.
 */
export async function hydratePartnerFeed(): Promise<void> {
  const { api } = await import('@/lib/api');
  const epochAtFetch = readEpoch;
  try {
    const page = await api.get<{ items?: ApiFeedItem[] }>('/users/me/notifications?perPage=30');
    // A mark-read that started while this fetch was in flight already told
    // the server everything is read — the (older) response must not
    // resurrect unread rows/badge while the drawer is open.
    const markedDuringFlight = readEpoch !== epochAtFetch;
    items = (page.items ?? [])
      .map(mapApiItem)
      .map((it) => (markedDuringFlight || it.isRead ? it : { ...it, isRead: true }))
      .slice(0, MAX_PARTNER_ENTRIES);
    unread = markedDuringFlight ? 0 : items.filter((it) => !it.isRead).length;
    hydrated = true;
    error = false;
    emit();
  } catch {
    // Hydrate done but failed: flip to the error state (retry button in the
    // drawer); any already-hydrated items keep rendering (stale over none).
    hydrated = true;
    error = true;
    emit();
  }
}

/**
 * Record one realtime directed item (user-directed `notification` socket
 * event). Unknown shape is dropped; dedupe by feed_items id (the hydrate
 * snapshot and a live event can overlap for the same row).
 */
export function recordPartnerFeedItem(raw: unknown): void {
  if (!raw || typeof raw !== 'object') return;
  const it = raw as Partial<ApiFeedItem>;
  if (!it.id || !it.verb) return;
  if (items.some((existing) => existing.id === it.id)) return;
  items = [
    mapApiItem({
      id: it.id,
      verb: it.verb,
      actor: it.actor ?? null,
      match: it.match ?? null,
      isRead: false,
      createdAt: it.createdAt ?? new Date().toISOString(),
    }),
    ...items,
  ].slice(0, MAX_PARTNER_ENTRIES);
  unread += 1;
  emit();
}

/**
 * There is deliberately no separate open-flag in this store — the drawer's
 * open state lives in ops-activity-store for both roles.
 */

/**
 * Opening the partner drawer marks hydrated items read: the badge clears
 * immediately (local), the API converges via the bulk read endpoint
 * (best-effort — next hydrate re-reads server truth). The readEpoch bump
 * lets an in-flight hydrate detect the mark and stay consistent.
 */
export function markPartnerFeedRead(): void {
  const hadUnread = unread > 0;
  readEpoch += 1;
  unread = 0;
  items = items.map((it) => (it.isRead ? it : { ...it, isRead: true }));
  if (hadUnread) emit();
  void (async () => {
    const { api } = await import('@/lib/api');
    try {
      await api.post('/users/me/notifications/read', {});
    } catch {
      // Best-effort convergence.
    }
  })();
}

/** Drop the whole partner feed (footer "Clear all" action, session-scoped). */
export function clearPartnerFeed(): void {
  if (items.length === 0 && unread === 0) return;
  items = [];
  unread = 0;
  emit();
}
