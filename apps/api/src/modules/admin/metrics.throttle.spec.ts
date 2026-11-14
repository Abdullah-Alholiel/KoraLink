import { describe, it, expect } from '@jest/globals';
import 'reflect-metadata';
import { MetricsController } from './metrics.controller';

/**
 * P2-248 (run #180, Reviewer A run-#158 item 3) — admin/metrics route-level
 * throttle. Pins the decorator metadata directly (P2-241 template): the route
 * must carry its own 10-per-60s cap instead of riding the global 60/min.
 * Throttler v6 stores per-route metadata under `THROTTLER:<FIELD>default`;
 * importing the controller applies the decorators, so Reflect metadata here
 * observes the real production decorator.
 */
describe('MetricsController — P2-248 route-level throttle', () => {
    const LIMIT_KEY = 'THROTTLER:LIMITdefault';
    const TTL_KEY = 'THROTTLER:TTLdefault';

    function methodOf(name: string): (this: never, ...args: never[]) => unknown {
        const proto = MetricsController.prototype as unknown as Record<
            string,
            (this: never, ...args: never[]) => unknown
        >;
        const fn = proto[name];
        if (!fn) throw new Error(`MetricsController.${name} missing`);
        return fn;
    }

    it('GET admin/metrics carries a route-level 10/min throttle (P2-248)', () => {
        const fn = methodOf('getMetrics');
        const limit = Reflect.getMetadata(LIMIT_KEY, fn);
        const ttl = Reflect.getMetadata(TTL_KEY, fn);
        expect(limit).toBe(10);
        expect(ttl).toBe(60_000);
    });
});
