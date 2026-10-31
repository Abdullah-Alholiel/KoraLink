import { describe, it, expect, beforeEach, afterEach } from 'vitest';

/**
 * P2-281 M-3 — host draft recovery storage contract (lib unit).
 *
 * The lib is the storage seam: shape/age-validated load, best-effort save,
 * explicit clear. Owner-scoped (PR-Agent run-#196 r3): the draft replays
 * ONLY for the session that authored it — a shared device's next user gets
 * null, never another player's pre-filled match.
 */

const MOD = () => import('@/lib/host-draft');

function seed(draft: unknown): void {
  window.localStorage.setItem('koralink_host_draft_v1', JSON.stringify(draft));
}

const NOW = 1_800_000_000_000;

describe('host draft recovery (P2-281 M-3)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('round-trips a valid draft for its owner', async () => {
    const { loadHostDraft, saveHostDraft } = await MOD();
    saveHostDraft(
      { userId: 'user-1', title: 'Friday 7v7', matchType: 'Competitive', genderRule: 'Mixed', date: '2026-11-02', time: '19:30', duration: 90, visibility: 'private' },
      NOW,
    );
    expect(loadHostDraft('user-1', NOW)).toEqual({
      userId: 'user-1',
      title: 'Friday 7v7',
      matchType: 'Competitive',
      genderRule: 'Mixed',
      date: '2026-11-02',
      time: '19:30',
      duration: 90,
      visibility: 'private',
      savedAt: NOW,
    });
  });

  it('NEVER replays across users (foreign owner → null; empty userId → null)', async () => {
    const { saveHostDraft, loadHostDraft } = await MOD();
    saveHostDraft(
      { userId: 'user-1', title: 'not yours', matchType: 'Casual', genderRule: 'Men Only', date: '2026-11-02', time: '19:30', duration: 60, visibility: 'public' },
      NOW,
    );
    expect(loadHostDraft('user-2', NOW)).toBeNull();
    expect(loadHostDraft('', NOW)).toBeNull();
    expect(loadHostDraft('user-1', NOW)).not.toBeNull();
  });

  it('drops shape-invalid drafts (bad enum, bad date, bad duration, bad visibility, bad owner)', async () => {
    const { loadHostDraft } = await MOD();
    seed({ userId: 'u1', title: '', matchType: 'Ranked', genderRule: 'Mixed', date: '', time: '', duration: 60, visibility: 'public', savedAt: NOW });
    expect(loadHostDraft('u1', NOW)).toBeNull();
    seed({ userId: 'u1', title: 'x', matchType: 'Casual', genderRule: 'Mixed', date: '02-11-2026', time: '', duration: 60, visibility: 'public', savedAt: NOW });
    expect(loadHostDraft('u1', NOW)).toBeNull();
    seed({ userId: 'u1', title: 'x', matchType: 'Casual', genderRule: 'Mixed', date: '', time: '', duration: 33, visibility: 'public', savedAt: NOW });
    expect(loadHostDraft('u1', NOW)).toBeNull();
    seed({ userId: 'u1', title: 'x', matchType: 'Casual', genderRule: 'Mixed', date: '', time: '', duration: 60, visibility: 'secret', savedAt: NOW });
    expect(loadHostDraft('u1', NOW)).toBeNull();
    seed({ userId: '', title: 'x', matchType: 'Casual', genderRule: 'Mixed', date: '', time: '', duration: 60, visibility: 'public', savedAt: NOW });
    expect(loadHostDraft('u1', NOW)).toBeNull();
  });

  it('drops drafts older than the 6h staleness cap', async () => {
    const { loadHostDraft } = await MOD();
    seed({ userId: 'u1', title: 'Old draft', matchType: 'Casual', genderRule: 'Men Only', date: '2026-11-01', time: '18:00', duration: 60, visibility: 'public', savedAt: NOW - 6 * 60 * 60 * 1000 - 1 });
    expect(loadHostDraft('u1', NOW)).toBeNull();
    // Right at the cap: still valid.
    seed({ userId: 'u1', title: 'Edge draft', matchType: 'Casual', genderRule: 'Men Only', date: '2026-11-01', time: '18:00', duration: 60, visibility: 'public', savedAt: NOW - 6 * 60 * 60 * 1000 });
    expect(loadHostDraft('u1', NOW)).not.toBeNull();
  });

  it('treats an all-empty draft as no draft', async () => {
    const { loadHostDraft } = await MOD();
    seed({ userId: 'u1', title: '', matchType: 'Casual', genderRule: 'Men Only', date: '', time: '', duration: 60, visibility: 'public', savedAt: NOW });
    expect(loadHostDraft('u1', NOW)).toBeNull();
  });

  it('survives corrupt JSON (returns null, never throws)', async () => {
    const { loadHostDraft } = await MOD();
    window.localStorage.setItem('koralink_host_draft_v1', '{not json');
    expect(loadHostDraft('u1', NOW)).toBeNull();
  });

  it('clear removes the draft', async () => {
    const { saveHostDraft, loadHostDraft, clearHostDraft } = await MOD();
    saveHostDraft(
      { userId: 'u1', title: 'x', matchType: 'Casual', genderRule: 'Men Only', date: '', time: '', duration: 60, visibility: 'public' },
      NOW,
    );
    expect(loadHostDraft('u1', NOW)).not.toBeNull();
    clearHostDraft();
    expect(loadHostDraft('u1', NOW)).toBeNull();
  });
});
