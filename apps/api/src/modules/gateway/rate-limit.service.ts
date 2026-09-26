import { Injectable, OnModuleDestroy } from '@nestjs/common';

/**
 * Sliding-window rate limiter for WebSocket send handlers (P1-42 run #36,
 * cross-socket user budget run #78).
 *
 * Every event consumes from TWO buckets, and is allowed only if both allow:
 * - a per-socket bucket (e.g. `msg:<socketId>`, `dm:<socketId>`) — keeps channel
 *   budgets isolated, so a busy match lobby never consumes a user's DM budget;
 * - a per-user cross-socket bucket (`user:<userId>:<channel>`) — closes the
 *   reconnect loophole: before run #78 a flooder got a fresh 10/10s window on
 *   every reconnect, so cheap reconnects defeated the per-socket budget. The
 *   user bucket survives socket churn, so N sockets share ONE budget.
 *
 * Why in-memory (and not Redis):
 * - Flood control only needs to make a flood loop expensive, not to meter honest users.
 * - No new infra dependency; a restart merely resets buckets (acceptable for flood control).
 * - Honest bound: with multiple API instances each process keeps its own user
 *   bucket, so the cross-socket budget is per-instance, not global.
 */
const WINDOW_MS = 10_000;
const MAX_EVENTS = 10;

@Injectable()
export class WsRateLimitService implements OnModuleDestroy {
  /** key -> timestamps (ms) of accepted events inside the current window. */
  private readonly hits = new Map<string, number[]>();
  /** Last time (ms) sweepExpired() walked the whole Map. */
  private lastSweepAt = 0;

  /**
   * Record one event against `primaryKey` (per-socket, `<channel>:<socketId>`)
   * and — when `userKey` is given — against the cross-socket bucket
   * `user:<userKey>:<channel>`. Allowed only if BOTH buckets have room; a
   * rejected attempt stamps neither bucket (a denial must not extend the lockout).
   * Pure Map math — never throws.
   */
  consume(primaryKey: string, userKey?: string): { allowed: boolean; retryAfterSec: number } {
    const now = Date.now();
    this.sweepExpired(now);
    const keys = [primaryKey];
    if (userKey) {
      const sep = primaryKey.indexOf(':');
      const channel = sep >= 0 ? primaryKey.slice(0, sep) : primaryKey;
      keys.push(`user:${userKey}:${channel}`);
    }

    const buckets = keys.map((key) => this.slide(key, now));

    let retryAfterSec = 0;
    for (const stamps of buckets) {
      if (stamps.length >= MAX_EVENTS) {
        // Oldest stamp falls out of the window after this many seconds.
        retryAfterSec = Math.max(
          retryAfterSec,
          1,
          Math.ceil((stamps[0] + WINDOW_MS - now) / 1000),
        );
      }
    }
    if (retryAfterSec > 0) return { allowed: false, retryAfterSec };

    keys.forEach((key, i) => {
      const stamps = buckets[i];
      stamps.push(now);
      this.hits.set(key, stamps);
    });
    return { allowed: true, retryAfterSec: 0 };
  }

  /**
   * Drop timestamps older than WINDOW_MS for `key` and return the live stamps.
   * A bucket that slides empty is deleted from the Map right here: user
   * buckets are never release()d (they must outlive any one socket), so this
   * opportunistic sweep is what keeps the Map from growing unboundedly.
   */
  private slide(key: string, now: number): number[] {
    const stamps = this.hits.get(key);
    if (!stamps) return [];
    const windowStart = now - WINDOW_MS;
    while (stamps.length > 0 && stamps[0] <= windowStart) {
      stamps.shift();
    }
    if (stamps.length === 0) this.hits.delete(key);
    return stamps;
  }

  /**
   * At most once per window, evict every bucket whose newest stamp has aged
   * out. slide() only reclaims keys that are touched again; a user who floods
   * once and never returns would otherwise leave a stale bucket behind forever.
   * Amortised O(buckets) per WINDOW_MS — cheap at gateway scale.
   */
  private sweepExpired(now: number): void {
    if (now - this.lastSweepAt < WINDOW_MS) return;
    this.lastSweepAt = now;
    const windowStart = now - WINDOW_MS;
    for (const [key, stamps] of this.hits) {
      if (stamps.length === 0 || stamps[stamps.length - 1] <= windowStart) {
        this.hits.delete(key);
      }
    }
  }

  /**
   * Release every per-socket bucket owned by a socket — called on disconnect
   * so the `hits` Map never grows unboundedly across socket churn (run #37).
   * Pure Map deletes — never throws.
   *
   * Deliberately does NOT touch `user:*` buckets: those are the cross-socket
   * budget and must survive a reconnect (otherwise disconnect would refill it).
   * They expire by the sliding window and are swept inside consume().
   */
  release(socketId: string): void {
    this.hits.delete(`msg:${socketId}`);
    this.hits.delete(`dm:${socketId}`);
    // P2-99 (run #74): typing indicator bucket — same lifecycle as msg/dm.
    this.hits.delete(`typing:${socketId}`);
  }

  /** Current number of tracked buckets — exposed for memory-bound tests. */
  get size(): number {
    return this.hits.size;
  }

  onModuleDestroy(): void {
    this.hits.clear();
  }
}
