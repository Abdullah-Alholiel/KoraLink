import { describe, it, expect } from 'vitest';
import { isPotmVotingOpen } from '@/lib/api-adapter';

/**
 * P2-52 run #40 — hydration-safe POTM voting window (Reviewer A CRITICAL).
 *
 * The old helpers read `Date.now()` inside the component render path, so the
 * server render and the device's first client render could disagree across
 * the voting boundary instant → hydration mismatch on the vote CTA.
 * The contract now: UI render paths pass `now` from useNow() (null pre-mount);
 * `null` MUST mean optimistic-open identically on both sides.
 */
describe('isPotmVotingOpen — hydration-safe clock contract (run #40)', () => {
  // Window: scheduled 2026-09-01T18:00Z + 90min duration → ends 19:30Z;
  // + 24h voting window → closes 2026-09-02T19:30Z.
  const scheduledAt = '2026-09-01T18:00:00Z';
  const durationMins = 90;
  const before = new Date('2026-09-02T19:29:59Z').getTime();
  const after = new Date('2026-09-02T19:30:01Z').getTime();

  it('P1: explicit now BEFORE close → open (unchanged legacy behavior)', () => {
    expect(isPotmVotingOpen(scheduledAt, durationMins, before)).toBe(true);
  });

  it('P2: explicit now AFTER close → closed (unchanged legacy behavior)', () => {
    expect(isPotmVotingOpen(scheduledAt, durationMins, after)).toBe(false);
  });

  it('P3: null now (pre-mount) → optimistic OPEN on server AND first client render', () => {
    expect(isPotmVotingOpen(scheduledAt, durationMins, null)).toBe(true);
  });

  it('P4: omitted now (tests/server contexts) falls back to the live clock', () => {
    // Long-expired window must be closed even with the live clock…
    expect(isPotmVotingOpen('2020-01-01T18:00:00Z', 60)).toBe(false);
    // …and a far-future match must be open.
    expect(isPotmVotingOpen('2126-01-01T18:00:00Z', 60)).toBe(true);
  });

  it('P5: missing scheduledAt → never open (unchanged)', () => {
    expect(isPotmVotingOpen(undefined, 60, before)).toBe(false);
    expect(isPotmVotingOpen(undefined, 60, null)).toBe(false);
  });

  it('P6: null now wins over a window that just closed — the boundary flip can never hydrate-mismatch', () => {
    // The exact skew scenario from the review: server renders at a time where
    // the window is closed; the device mounts an instant later. Pre-mount
    // both sides now render OPEN (null → true), then the effect flips to the
    // real answer in a client update — never a hydration error.
    expect(isPotmVotingOpen(scheduledAt, durationMins, null)).toBe(true);
    expect(isPotmVotingOpen(scheduledAt, durationMins, after)).toBe(false);
  });
});
