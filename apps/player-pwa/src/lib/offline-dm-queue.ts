/**
 * P2-224 (run #148): persisted offline queue for PERSONAL-DM sends.
 *
 * Parallel of the P2-172 match-chat offline queue (module-private internals in
 * useMessages.ts). Deliberately a SEPARATE module with its own storage key so
 * the two queues can never collide; same hygiene contract (TTL, FIFO cap,
 * owner binding, orphan guard, single-flight flush, no head-of-line block).
 *
 * Flow: an offline send parks here → bubble stays `queued` → on reconnect
 * flushOfflineDmQueue() replays entries oldest-first through the idempotent
 * REST send path with the SAME clientMessageId (the server dedupes on
 * (sender_id, conversation_id, client_message_id) — conversations.service.ts
 * pre-read + partial unique index), notifies listeners so open threads
 * reconcile, and discards delivered entries.
 */

import { fetcher, FetchError } from '@/lib/fetcher';
import { useAppStore } from '@/store/useAppStore';
import { trackEvent } from '@/providers/ObservabilityProvider';

/** Marker error — never shown to users; the onError branch intercepts it. */
export class OfflineDmSendSignal extends Error {
  constructor() {
    super('offline: queued for replay');
    this.name = 'OfflineDmSendSignal';
  }
}

export interface QueuedDmMessage {
  conversationId: string;
  content: string;
  clientMessageId: string;
  queuedAt: string;
  /**
   * P2-226: set when the server PERMANENTLY rejected the send (4xx except
   * 401/408/429/5xx — 401 is recoverable via re-auth). A retired entry is
   * never re-POSTed by the flusher; it stays queued so the open thread can
   * render it as failed (tap-to-retry re-enqueues a fresh entry).
   */
  retiredAt?: string;
  /** Owner binding — entries replay ONLY under the session that authored them. */
  userId: string;
}

const OFFLINE_DM_QUEUE_KEY = 'kl.offlineDmQueue.v1';

function isNetworkOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine !== false;
}

let offlineDmQueue: QueuedDmMessage[] = [];

function readOfflineDmQueue(): QueuedDmMessage[] {
  if (typeof window === 'undefined') return offlineDmQueue;
  try {
    const raw = window.localStorage.getItem(OFFLINE_DM_QUEUE_KEY);
    if (!raw) return offlineDmQueue;
    const parsed = JSON.parse(raw) as QueuedDmMessage[];
    if (!Array.isArray(parsed)) return offlineDmQueue;
    // Module memory is authoritative within a session; storage seeds it.
    if (offlineDmQueue.length === 0 && parsed.length > 0) offlineDmQueue = parsed;
    // Hygiene runs on every read — stale entries age out even when the
    // storage copy is never re-seeded from (memory already held them).
    pruneOfflineDmQueue();
    return offlineDmQueue;
  } catch {
    return offlineDmQueue;
  }
}

function persistOfflineDmQueue(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(OFFLINE_DM_QUEUE_KEY, JSON.stringify(offlineDmQueue));
  } catch {
    // Private mode / quota — degrade to in-memory queue for this session.
  }
}

/**
 * Queue hygiene (mirrors the P2-172 rules, run #145):
 * - TTL 7 days — an entry parked for a conversation that can no longer accept
 *   it would otherwise replay-fail forever and grow storage unbounded.
 * - Cap 50, FIFO — drop the OLDEST past the cap (the newest are the ones the
 *   user still expects to deliver); localStorage is a bounded resource.
 */
const OFFLINE_DM_QUEUE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const OFFLINE_DM_QUEUE_MAX = 50;

/** Drop TTL-expired entries (and cap overflow) from the in-memory queue. */
function pruneOfflineDmQueue(nowMs: number = Date.now()): void {
  if (offlineDmQueue.length === 0) return;
  const cutoff = nowMs - OFFLINE_DM_QUEUE_TTL_MS;
  const kept = offlineDmQueue.filter((m) => {
    const ts = Date.parse(m.queuedAt);
    // Undateable entry (malformed queuedAt): keep — never destroy what we
    // cannot date; the owner-binding guard still blocks its replay.
    return Number.isNaN(ts) ? true : ts >= cutoff;
  });
  const capped =
    kept.length > OFFLINE_DM_QUEUE_MAX
      ? kept.slice(kept.length - OFFLINE_DM_QUEUE_MAX)
      : kept;
  if (capped.length !== offlineDmQueue.length) {
    offlineDmQueue = capped;
    persistOfflineDmQueue();
  }
}

/** Park a DM for replay. Returns false when the id is already queued. */
export function enqueueOfflineDm(entry: QueuedDmMessage): boolean {
  readOfflineDmQueue(); // also runs TTL/cap hygiene before the insert
  if (offlineDmQueue.some((m) => m.clientMessageId === entry.clientMessageId)) {
    return false;
  }
  offlineDmQueue.push(entry);
  if (offlineDmQueue.length > OFFLINE_DM_QUEUE_MAX) {
    offlineDmQueue = offlineDmQueue.slice(offlineDmQueue.length - OFFLINE_DM_QUEUE_MAX);
  }
  persistOfflineDmQueue();
  return true;
}

/**
 * P2-226 r2: mark an entry TERMINALLY failed (permanent 4xx rejection) —
 * the flusher never re-POSTs it, but it stays queued so the open thread
 * can render it as failed and the badge keeps counting it (visible trace).
 */
function markDmRetired(clientMessageId: string): void {
  readOfflineDmQueue();
  const entry = offlineDmQueue.find((m) => m.clientMessageId === clientMessageId);
  if (entry && !entry.retiredAt) {
    entry.retiredAt = new Date().toISOString();
    persistOfflineDmQueue();
  }
}

/** Remove a delivered entry (any delivery path: REST response, WS echo, flush). */
export function discardOfflineDm(clientMessageId: string): void {
  readOfflineDmQueue();
  const next = offlineDmQueue.filter((m) => m.clientMessageId !== clientMessageId);
  if (next.length !== offlineDmQueue.length) {
    offlineDmQueue = next;
    persistOfflineDmQueue();
  }
}

export function getQueuedDmsForConversation(
  conversationId: string,
  userId?: string,
): QueuedDmMessage[] {
  readOfflineDmQueue();
  return offlineDmQueue.filter(
    (m) => m.conversationId === conversationId && (!userId || m.userId === userId),
  );
}

export function getOfflineDmQueueCount(
  conversationId?: string,
  userId?: string,
): number {
  readOfflineDmQueue();
  return offlineDmQueue.filter(
    (m) =>
      (!conversationId || m.conversationId === conversationId) &&
      (!userId || m.userId === userId),
  ).length;
}

// ── Flush plumbing ────────────────────────────────────────────────────────
// Flusher lives at MODULE level (a queued DM must deliver even after the
// thread that wrote it unmounts). Open threads subscribe and reconcile
// deliveries into their view.

type DmFlushListener = (
  message: QueuedDmDelivery | null,
  failedEntry?: QueuedDmMessage,
  /** P2-226: true when the entry was RETIRED (permanent 4xx) — no replay. */
  terminal?: boolean,
) => void;

/** Minimum shape an open thread needs to reconcile a flushed delivery. */
export interface QueuedDmDelivery {
  conversationId: string;
  clientMessageId: string;
  /** Carried so a backfilled (previous-session) entry can render its bubble
   * without refetching — the queue entry is discarded on delivery. */
  content: string;
  queuedAt: string;
}

const dmFlushListeners = new Set<DmFlushListener>();

/** Subscribe to flushed DM deliveries (open threads reconcile their view). */
export function registerOfflineDmFlushListener(fn: DmFlushListener): () => void {
  dmFlushListeners.add(fn);
  return () => dmFlushListeners.delete(fn);
}

let flushing = false;

/**
 * P2-226: a PERMANENT server rejection (conversation deleted → 404, blocked →
 * 403, …) can never succeed on replay. 408 (timeout) and 429 (rate limit) are
 * retry-later; 5xx and non-HTTP errors (network TypeError) are transient.
 */
function isTerminalDmSendError(err: unknown): boolean {
  if (!(err instanceof FetchError)) return false;
  const { status } = err;
  // P2-226 r2 (PR-Agent #155): 401 is RECOVERABLE — the fetcher treats a 401
  // on authed surfaces as an expired token and bounces to re-auth; retiring
  // the message would permanently lose recoverable content.
  if (status === 401) return false;
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

/** Replay the queue oldest-first through the idempotent REST send path. */
export async function flushOfflineDmQueue(): Promise<void> {
  if (flushing || !isNetworkOnline()) return;
  // Owner binding: an entry replays ONLY under the session that authored it —
  // a queued DM must never be sent (or shown) under another account on a
  // shared device. No logged-in user → no replay.
  const currentUserId = useAppStore.getState().user?.id;
  if (!currentUserId) return;
  flushing = true;
  try {
    // Re-read each iteration: deliveries remove entries while we iterate.
    for (const entry of [...readOfflineDmQueue()]) {
      if (!isNetworkOnline()) break; // signal dropped mid-flush — stop, stay queued
      if (entry.userId !== currentUserId) continue; // another account's message
      if (entry.retiredAt) continue; // P2-226 r2: terminally failed — never replayed
      try {
        await fetcher<{ id: string }>(`/conversations/${entry.conversationId}/messages`, {
          method: 'POST',
          body: JSON.stringify({
            content: entry.content,
            clientMessageId: entry.clientMessageId,
          }),
        });
        discardOfflineDm(entry.clientMessageId);
        for (const fn of dmFlushListeners) {
          fn({
            conversationId: entry.conversationId,
            clientMessageId: entry.clientMessageId,
            content: entry.content,
            queuedAt: entry.queuedAt,
          });
        }
        trackEvent('dm_offline_queue_flushed');
      } catch (err) {
        if (isTerminalDmSendError(err)) {
          // P2-226 r2 (PR-Agent #155): RETAIN the entry with a retiredAt
          // marker instead of discarding — the poll stops re-POSTing it, the
          // badge keeps counting it (visible trace), and the open thread
          // renders it failed (tap-to-retry re-enqueues a fresh entry).
          markDmRetired(entry.clientMessageId);
          for (const fn of dmFlushListeners) fn(null, entry, true);
          continue;
        }
        // Still failing transiently (server unreachable / 401 / 408 / 429 /
        // 5xx) — leave queued, tell open threads (bubble flips to FAILED +
        // tap-to-retry), and CONTINUE: one failing entry must never
        // head-of-line-block healthy entries behind it. Each flush cycle
        // attempts each entry once.
        for (const fn of dmFlushListeners) fn(null, entry);
      }
    }
  } finally {
    flushing = false;
  }
}

let watcherStarted = false;

/**
 * Idempotently arm the reconnect flusher: `online` event + a short
 * rising-edge poll (some browsers/page-restores restore without firing the
 * event). Re-armed by every offline send; safe to call repeatedly.
 */
export function startOfflineDmQueueWatcher(): void {
  if (watcherStarted || typeof window === 'undefined') return;
  watcherStarted = true;
  window.addEventListener('online', () => {
    void flushOfflineDmQueue();
  });
  window.setInterval(() => {
    if (isNetworkOnline() && getOfflineDmQueueCount() > 0) {
      void flushOfflineDmQueue();
    }
  }, 5_000);
}

/** Test-only: reset queue + flush state between spec cases. */
export function __resetOfflineDmQueueForTests(): void {
  offlineDmQueue = [];
  flushing = false;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(OFFLINE_DM_QUEUE_KEY);
    } catch {
      /* ignore */
    }
  }
}
