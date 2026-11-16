/**
 * Structure regression guard — P2-177 HOST MATCH FORM OFFLINE STATE.
 *
 * A host filling the create-match form on stadium Wi-Fi must SEE why the
 * slot list is not loading (5-UX-states standard: offline state on every
 * interactive surface). The shared OfflineBanner is the single vehicle —
 * the amber-strip idiom must never fork into a copy-pasted local strip.
 *
 * RULES enforced here (structural, zero rendering — same discipline as
 * host-repeat.test.ts):
 *   1. HostMatchForm imports useOnlineStatus + OfflineBanner.
 *   2. The offline strip renders BEFORE <SlotPicker (order matters: cue
 *      above the thing that can't load).
 *   3. The strip uses the shared component with context copy (host.slotsOffline),
 *      NOT a bespoke amber div.
 *   4. host.slotsOffline exists in BOTH locales with non-empty values.
 *   5. OfflineBanner still defaults to common.offlineBanner when no message
 *      is passed (existing 7-page callers unchanged).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PWA_ROOT = join(__dirname, '../..');
const FORM = readFileSync(join(PWA_ROOT, 'src/components/host/HostMatchForm.tsx'), 'utf-8');
const BANNER = readFileSync(join(PWA_ROOT, 'src/components/layout/OfflineBanner.tsx'), 'utf-8');
const EN = JSON.parse(readFileSync(join(PWA_ROOT, 'src/messages/en.json'), 'utf-8'));
const AR = JSON.parse(readFileSync(join(PWA_ROOT, 'src/messages/ar.json'), 'utf-8'));

describe('P2-177 host form offline state', () => {
  it('wires useOnlineStatus + the shared OfflineBanner into HostMatchForm', () => {
    expect(FORM).toContain("import { useOnlineStatus } from '@/hooks/useOnlineStatus'");
    expect(FORM).toContain("import OfflineBanner from '@/components/layout/OfflineBanner'");
    expect(FORM).toContain('useOnlineStatus()');
  });

  it('renders the offline strip BEFORE SlotPicker with context copy (no bespoke amber div)', () => {
    const bannerIdx = FORM.indexOf('<OfflineBanner');
    const pickerIdx = FORM.indexOf('<SlotPicker');
    expect(bannerIdx).toBeGreaterThan(-1);
    expect(pickerIdx).toBeGreaterThan(-1);
    expect(bannerIdx).toBeLessThan(pickerIdx);
    // Context copy via prop — and NO locally hand-rolled amber strip.
    expect(FORM).toContain("message={t('host.slotsOffline')}");
    expect(FORM).not.toMatch(/bg-amber-(50|100)[^>]*rounded-xl(?!.*OfflineBanner)/);
  });

  it('keeps the shared banner the single amber idiom with an overridable message', () => {
    expect(BANNER).toContain('message?: string;');
    expect(BANNER).toContain("message ?? t('offlineBanner')");
    // role=status stays (screen-reader announce, a11y standard).
    expect(BANNER).toContain('role="status"');
  });

  it('defines host.slotsOffline in BOTH locales (parity)', () => {
    const en = (EN as Record<string, never>); // shape guard only
    void en;
    expect((EN.host as { slotsOffline?: string }).slotsOffline).toBeTruthy();
    expect((AR.host as { slotsOffline?: string }).slotsOffline).toBeTruthy();
    expect(Object.keys(EN.host).sort()).toEqual(Object.keys(AR.host).sort());
  });
});
