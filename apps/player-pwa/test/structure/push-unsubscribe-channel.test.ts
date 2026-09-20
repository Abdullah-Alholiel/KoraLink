import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * P2-76 (run #65): structural pins for the push-unsubscribe channel.
 *
 * Contract (docs/plans/run65-api-push-unsubscribe/01-program-design.md):
 * - PWA unsubscribes via POST /notifications/unsubscribe (DELETE bodies are
 *   dropped by some proxies/clients → silent unsubscribe failure).
 * - The API serves POST (canonical) AND keeps the deprecated DELETE
 *   dual-route for already-deployed bundles, both validated by
 *   UnsubscribeDto.
 *
 * These are read-the-source pins (house style, cf. structure/ tests): they
 * keep a future refactor from silently reintroducing the DELETE-body
 * unsubscribe or dropping either server route.
 */
const REPO = join(__dirname, '..', '..', '..', '..');
const HOOK = join(
  REPO,
  'apps',
  'player-pwa',
  'src',
  'hooks',
  'usePushNotifications.ts',
);
const CONTROLLER = join(
  REPO,
  'apps',
  'api',
  'src',
  'modules',
  'notifications',
  'notifications.controller.ts',
);

describe('P2-76 push unsubscribe channel (run #65)', () => {
  it('PWA hook sends POST (not DELETE) to /notifications/unsubscribe', () => {
    expect(existsSync(HOOK)).toBe(true);
    const src = readFileSync(HOOK, 'utf8');
    expect(src).toContain("'/notifications/unsubscribe'");
    expect(src).toMatch(/method:\s*'POST'/);
    expect(src).not.toMatch(/method:\s*'DELETE'/);
    expect(src).toContain('subscription.endpoint');
  });

  it('API serves POST /unsubscribe AND the deprecated DELETE dual-route', () => {
    expect(existsSync(CONTROLLER)).toBe(true);
    const src = readFileSync(CONTROLLER, 'utf8');
    expect(src).toContain("@Post('unsubscribe')");
    expect(src).toContain("@Delete('unsubscribe')");
  });

  it('both routes run through the validated UnsubscribeDto', () => {
    expect(existsSync(CONTROLLER)).toBe(true);
    const src = readFileSync(CONTROLLER, 'utf8');
    // Two handler signatures take the class DTO (canonical + legacy).
    const hits = src.match(/body:\s*UnsubscribeDto/g) ?? [];
    expect(hits.length).toBe(2);
  });
});
