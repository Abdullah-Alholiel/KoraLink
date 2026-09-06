import { Injectable, OnModuleDestroy } from '@nestjs/common';

/**
 * Per-socket sliding-window rate limiter for WebSocket send handlers (P1-42, run #36).
 *
 * Why in-memory + per-socket (and not a per-user Redis budget):
 * - Flood control only needs to make a flood loop expensive, not to meter honest users.
 * - Every connection is fully re-authenticated at handshake (moderation guard), so a
 *   reconnecting flooder pays a handshake each time — slow and visible in logs.
 * - No new infra dependency; a restart merely resets buckets (acceptable for flood control).
 *
 * Buckets are keyed by the caller (e.g. `msg:<socketId>`, `dm:<socketId>`) so a busy match
 * lobby can never consume a user's DM budget or vice versa.
 */
const WINDOW_MS = 10_000;
const MAX_EVENTS = 10;

@Injectable()
export class WsRateLimitService implements OnModuleDestroy {
  /** key -> timestamps (ms) of accepted-or-attempted events inside the current window. */
  private readonly hits = new Map<string, number[]>();

  /**
   * Record one event for `key` and decide whether it is allowed.
   * Pure Map math — never throws.
   */
  consume(key: string): { allowed: boolean; retryAfterSec: number } {
    const now = Date.now();
    const windowStart = now - WINDOW_MS;

    let stamps = this.hits.get(key);
    if (!stamps) {
      stamps = [];
      this.hits.set(key, stamps);
    }

    // Slide the window: drop timestamps older than WINDOW_MS.
    while (stamps.length > 0 && stamps[0] <= windowStart) {
      stamps.shift();
    }

    if (stamps.length >= MAX_EVENTS) {
      // Oldest stamp falls out of the window after this many seconds.
      const retryAfterSec = Math.max(1, Math.ceil((stamps[0] + WINDOW_MS - now) / 1000));
      return { allowed: false, retryAfterSec };
    }

    stamps.push(now);
    return { allowed: true, retryAfterSec: 0 };
  }

  onModuleDestroy(): void {
    this.hits.clear();
  }
}
