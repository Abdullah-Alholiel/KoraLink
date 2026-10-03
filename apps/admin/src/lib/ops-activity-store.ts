import { useSyncExternalStore } from 'react';

/**
 * Ops activity store — the data behind the console notification bell.
 *
 * Records `ops-data-changed` realtime pings into a bounded, newest-first
 * feed. There is NO backend notifications table here by design: the API's
 * ops pings are intentionally payload-free (`{ entity }` only — no row data
 * crosses the socket, so partners never receive admin rows), so the feed
 * records "something changed in <entity>" events with arrival timestamps.
 * Clicking a feed row navigates to the section whose table already refetches
 * live (useLiveAdminData) — the row links to truth, it doesn't copy it.
 *
 * Shape decisions:
 * - Burst coalescing: services emit several pings per user action
 *   (e.g. dispute resolution fires `disputes` + `users`), and a busy moment
 *   fires many. Same-entity events inside BURST_WINDOW_MS merge into one
 *   entry with a ×count badge instead of flooding the feed.
 * - Unread = events that arrived while the feed was closed; opening the feed
 *   clears it (including events arriving WHILE it is open).
 * - Session-scoped (in-memory): ops consoles are work tools — a reload
 *   starting clean is the desired behaviour, not lost state.
 *
 * Same module-store pattern as i18n/locale-store.ts: useSyncExternalStore
 * with a referentially-stable snapshot (no tearing during concurrent
 * render), and a stable server snapshot so SSR and first client paint agree.
 */

export type OpsEntity =
  | 'users'
  | 'matches'
  | 'venues'
  | 'pitches'
  | 'disputes'
  | 'transactions'
  | 'settlements'
  | 'settings'
  | 'reports';

const OPS_ENTITIES = new Set<string>([
  'users',
  'matches',
  'venues',
  'pitches',
  'disputes',
  'transactions',
  'settlements',
  'settings',
  'reports',
]);

/** Entities a VenueOwner console is itself a party to (partner surfaces only). */
const PARTNER_SCOPED_ENTITIES = new Set<string>(['venues', 'pitches', 'matches']);

export interface OpsActivityEntry {
  /** Stable React key: entity + first-seen timestamp of the burst. */
  key: string;
  entity: OpsEntity;
  /** Latest occurrence (drives the relative timestamp shown). */
  at: number;
  /** Coalesced occurrences within the burst window. */
  count: number;
}

export interface OpsActivitySnapshot {
  /** Newest first, capped at MAX_ENTRIES. */
  entries: OpsActivityEntry[];
  unread: number;
  feedOpen: boolean;
}

const MAX_ENTRIES = 30;
const BURST_WINDOW_MS = 1500;

const SERVER_SNAPSHOT: OpsActivitySnapshot = { entries: [], unread: 0, feedOpen: false };

let entries: OpsActivityEntry[] = [];
let unread = 0;
let feedOpen = false;
let snapshot = SERVER_SNAPSHOT;

const subscribers = new Set<() => void>();

function emit(): void {
  snapshot = { entries, unread, feedOpen };
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

function getSnapshot(): OpsActivitySnapshot {
  return snapshot;
}

function getServerSnapshot(): OpsActivitySnapshot {
  return SERVER_SNAPSHOT;
}

/** Reactive feed state — consumed by the bell and the feed drawer. */
export function useOpsActivity(): OpsActivitySnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Record one ops-data-changed ping. Unknown entity names are dropped (the
 * API may add entities before this console learns to label/link them).
 */
export function recordOpsEvent(entity: string): void {
  if (!OPS_ENTITIES.has(entity)) return;
  const now = Date.now();
  const newest = entries[0];
  if (newest && newest.entity === entity && now - newest.at <= BURST_WINDOW_MS) {
    // Coalesce the burst: refresh the timestamp, keep one entry.
    entries = [
      { ...newest, at: now, count: newest.count + 1 },
      ...entries.slice(1),
    ];
  } else {
    entries = [
      { key: `${entity}:${now}`, entity: entity as OpsEntity, at: now, count: 1 },
      ...entries,
    ].slice(0, MAX_ENTRIES);
  }
  if (!feedOpen) unread += 1;
  emit();
}

/** Open/close the feed. Opening marks everything read. */
export function setFeedOpen(open: boolean): void {
  if (feedOpen === open) return;
  feedOpen = open;
  if (open) unread = 0;
  emit();
}

/** Drop the whole feed (footer "Clear all" action). */
export function clearOpsActivity(): void {
  if (entries.length === 0 && unread === 0) return;
  entries = [];
  unread = 0;
  emit();
}

/**
 * Partner scope filter (PR-Agent finding, run #99): VenueOwner consoles are
 * not parties to platform-wide dispute/report/user/transaction activity —
 * recording those pings would disclose org-wide moderation volume through
 * entry counts. Mirror of the API's ops-room contract (app.gateway.ts:213
 * joins the ops room for Admin/VenueOwner alike, so the client filters).
 */
export function isEntityInScope(role: string | null, entity: string): boolean {
  if (role === 'VenueOwner') return PARTNER_SCOPED_ENTITIES.has(entity);
  return true;
}
