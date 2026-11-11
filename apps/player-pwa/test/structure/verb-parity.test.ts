import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * P2-348 (run #201): verb-parity tripwire — the bell surface is a 3-layer
 * contract and every layer has gone stale independently:
 *
 *   1. API DIRECTED_VERBS (bell gate — rows written but invisible when a verb
 *      is missing here: the P2-347 eviction bell leg landed nowhere);
 *   2. PWA ActivityVerb union (useFeed.ts — the API can return verbs the PWA
 *      type doesn't know: `t(undefined)` renders a BLANK row, live since
 *      P1-17 for waitlist_promoted);
 *   3. label maps (ActivityCard + NotificationSheet VERB_LABEL/VERB_ICON) and
 *      the i18n catalogs (feed.* + notifications.*, en + ar).
 *
 * This file fails when the next verb is added to any ONE layer and forgotten
 * in the others — the run-#24 bug class, caught at CI instead of by users.
 */

const REPO = join(__dirname, '../../../..');

const ACTIVITIES_SRC = readFileSync(
  join(REPO, 'apps/api/src/modules/activities/activities.service.ts'),
  'utf-8',
);
const USE_FEED_SRC = readFileSync(
  join(__dirname, '../../src/hooks/useFeed.ts'),
  'utf-8',
);
const ACTIVITY_CARD_SRC = readFileSync(
  join(__dirname, '../../src/components/feed/ActivityCard.tsx'),
  'utf-8',
);
const NOTIF_SHEET_SRC = readFileSync(
  join(__dirname, '../../src/components/layout/NotificationSheet.tsx'),
  'utf-8',
);
const EN = JSON.parse(
  readFileSync(join(__dirname, '../../src/messages/en.json'), 'utf-8'),
);
const AR = JSON.parse(
  readFileSync(join(__dirname, '../../src/messages/ar.json'), 'utf-8'),
);

/** Extract the string-literal members of a `const X = [ 'a', 'b' ] as const` block. */
function membersOf(src: string, constName: string): string[] {
  const start = src.indexOf(`const ${constName} = [`);
  expect(start, `const ${constName} found`).toBeGreaterThanOrEqual(0);
  const end = src.indexOf('] as const', start);
  const block = src.slice(start, end);
  return [...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

/** Feed-directed verbs = DIRECTED_VERBS minus the two social-feed-only verbs. */
const DIRECTED = membersOf(ACTIVITIES_SRC, 'DIRECTED_VERBS');

const SOCIAL_ONLY = new Set(['followed', 'messaged']);
const BELL_VERBS = DIRECTED.filter((v) => !SOCIAL_ONLY.has(v));

describe('verb parity: API bell gate ↔ PWA union ↔ labels ↔ i18n (P2-348)', () => {
  it('every bell verb is in the PWA ActivityVerb union', () => {
    for (const verb of BELL_VERBS) {
      expect(
        USE_FEED_SRC.includes(`'${verb}'`),
        `useFeed.ts ActivityVerb is missing '${verb}' — bell rows for it render BLANK`,
      ).toBe(true);
    }
  });

  it('every bell verb has VERB_LABEL + VERB_ICON entries in both surfaces', () => {
    // Named surfaces so a failure says WHICH map is missing the entry
    // (PR-Agent r1 on PR #240: an empty-string context helps nobody).
    for (const [surface, src] of [
      ['ActivityCard', ACTIVITY_CARD_SRC],
      ['NotificationSheet', NOTIF_SHEET_SRC],
    ] as const) {
      for (const verb of BELL_VERBS) {
        expect(
          src.includes(`${verb}:`),
          `${surface} verb map is missing '${verb}' — bell rows for it render blank`,
        ).toBe(true);
      }
    }
  });

  it('every bell verb label key exists in feed + notifications, en + ar', () => {
    const camel = (v: string) =>
      v.split('_').map((p, i) => i === 0 ? p : p[0].toUpperCase() + p.slice(1)).join('');
    for (const verb of BELL_VERBS) {
      const key = camel(verb);
      for (const [locale, catalog] of [['en', EN], ['ar', AR]] as const) {
        for (const ns of ['feed', 'notifications']) {
          // payout_paid + match_rescheduled existed before the tripwire; the
          // assertion still applies — every bell verb must be labeled.
          expect(
            catalog[ns]?.[key],
            `${locale}/${ns}.${key} missing (verb ${verb})`,
          ).toBeTruthy();
        }
      }
    }
  });

  it('en and ar catalogs have identical leaf-key counts (i18n parity floor)', () => {
    const leaves = (o: unknown): number =>
      typeof o === 'object' && o !== null
        ? Object.values(o as Record<string, unknown>).reduce<number>(
            (s, v) => s + leaves(v),
            0,
          )
        : 1;
    expect(leaves(EN)).toBe(leaves(AR));
  });

  it('the eviction verb waitlist_removed is bell-directed (P2-347 closure)', () => {
    expect(DIRECTED).toContain('waitlist_removed');
    expect(USE_FEED_SRC).toContain("'waitlist_removed'");
    expect(EN.feed.waitlistRemoved).toBeTruthy();
    expect(AR.notifications.waitlistRemoved).toBeTruthy();
  });
});
