import { describe, it, expect } from 'vitest';
import {
  pricePerPlayer,
  pitchCostForDuration,
  round2,
  PLATFORM_MARGIN_SAR,
} from '@/lib/api-adapter';

describe('pitchCostForDuration', () => {
  it('prices a full hour at the hourly rate', () => {
    expect(pitchCostForDuration(200, 60)).toBe(200);
  });

  it('prorates 90 minutes to 1.5x the hourly rate', () => {
    expect(pitchCostForDuration(200, 90)).toBe(300);
  });

  it('prorates 30 minutes to half the hourly rate', () => {
    expect(pitchCostForDuration(200, 30)).toBe(100);
  });

  it('prorates a fractional result without rounding error', () => {
    expect(pitchCostForDuration(150, 45)).toBe(112.5);
  });
});

describe('pricePerPlayer', () => {
  it('mirrors MatchesService.calculatePricePerPlayer (200, 14) => 20.39', () => {
    // (200 / 13) + 5 = 15.3846… + 5 = 20.3846… → ceil to 2dp = 20.39
    expect(pricePerPlayer(200, 14)).toBe(20.39);
  });

  it('returns the raw cost when fewer than 2 players (host-only)', () => {
    expect(pricePerPlayer(200, 1)).toBe(200);
  });

  it('always includes the platform margin on top of the share', () => {
    const share = 200 / 13;
    // 20.39 > share + margin (20.3846…) — the margin is present.
    expect(pricePerPlayer(200, 14)).toBeGreaterThan(share + PLATFORM_MARGIN_SAR - 0.01);
  });
});

describe('round2', () => {
  it('rounds up to 2 decimal places', () => {
    expect(round2(15.384615)).toBe(15.39);
    expect(round2(20.384615)).toBe(20.39);
  });

  it('leaves whole amounts unchanged', () => {
    expect(round2(100)).toBe(100);
  });
});
