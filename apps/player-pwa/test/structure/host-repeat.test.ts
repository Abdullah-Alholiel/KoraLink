/**
 * Structure regression guard — P1-64 RECURRING MATCHES FOR PLAYERS.
 *
 * A koralink host can book the same pitch + start time for N weeks
 * (repeat_weeks). The API debits the pitch cost once PER instance, so the
 * client deposit wall must multiply by the repeat count.
 *
 * RULES enforced here (structural, zero rendering — same discipline as
 * clubs-top-rated.test.ts):
 *   1. The chip row renders ONLY when mode === 'koralink' AND a slot is picked.
 *   2. Every chip carries aria-pressed and an i18n label (host.repeat.*).
 *   3. depositSar (and therefore the shortBy pre-check) is pitchCostSar × repeatWeeks.
 *   4. The payload carries repeat_weeks (undefined for a single match), and
 *      the client Zod schema keeps it (Zod strips unlisted keys).
 *   5. The sheet shows the per-week breakdown when repeatWeeks > 1.
 *   6. host.repeat.* exists in BOTH locales.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PWA_ROOT = join(__dirname, '../..');
const FORM = readFileSync(join(PWA_ROOT, 'src/components/host/HostMatchForm.tsx'), 'utf-8');
const SHEET = readFileSync(join(PWA_ROOT, 'src/components/host/PublishWarningSheet.tsx'), 'utf-8');
const HOOK = readFileSync(join(PWA_ROOT, 'src/hooks/useMatches.ts'), 'utf-8');
const EN = JSON.parse(readFileSync(join(PWA_ROOT, 'src/messages/en.json'), 'utf-8'));
const AR = JSON.parse(readFileSync(join(PWA_ROOT, 'src/messages/ar.json'), 'utf-8'));

describe('P1-64 recurring matches — host form', () => {
  it('renders the chip row only for koralink mode with a selected slot', () => {
    expect(FORM).toMatch(/\{mode === 'koralink' && selectedSlot && \(\s*<div role="group" data-testid="repeat-chips"/);
  });

  it('offers Once / x2 / x4 / x6 / x8 chips with aria-pressed and i18n labels', () => {
    for (const [weeks, key] of [
      [1, 'once'],
      [2, 'weekly2'],
      [4, 'weekly4'],
      [6, 'weekly6'],
      [8, 'weekly8'],
    ] as const) {
      expect(FORM).toContain(`{ weeks: ${weeks}, key: 'host.repeat.${key}' }`);
    }
    expect(FORM).toContain('aria-pressed={repeatWeeks === weeks}');
    expect(FORM).toContain('{t(key)}');
  });

  it('multiplies the deposit by the repeat count (shortfall uses the same value)', () => {
    expect(FORM).toContain(
      "const depositSar = mode === 'koralink' && pitchCostSar > 0 ? pitchCostSar * repeatWeeks : null;",
    );
    expect(FORM).toMatch(/computeShortfall\(depositSar, walletBalanceSar\)/);
    expect(FORM).toContain('repeatWeeks={repeatWeeks}');
  });

  it('sends repeat_weeks in the payload and keeps it in the Zod schema', () => {
    expect(FORM).toContain('repeat_weeks: repeatWeeks > 1 ? repeatWeeks : undefined,');
    expect(HOOK).toContain('repeat_weeks: z.number().int().min(1).max(8).optional(),');
  });

  it('shows the per-week breakdown in the warning sheet', () => {
    expect(SHEET).toMatch(/\{repeatWeeks > 1 && \(/);
    expect(SHEET).toContain('SAR {(depositSar / repeatWeeks).toFixed(2)} × {repeatWeeks}');
  });

  it('keeps host.repeat.* in BOTH locales with leaf-key parity', () => {
    expect(EN.host?.repeat).toEqual({
      once: 'Once',
      weekly2: 'Weekly ×2',
      weekly4: 'Weekly ×4',
      weekly6: 'Weekly ×6',
      weekly8: 'Weekly ×8',
    });
    expect(AR.host?.repeat).toEqual({
      once: 'مرة واحدة',
      weekly2: 'أسبوعياً ×2',
      weekly4: 'أسبوعياً ×4',
      weekly6: 'أسبوعياً ×6',
      weekly8: 'أسبوعياً ×8',
    });
  });
});
