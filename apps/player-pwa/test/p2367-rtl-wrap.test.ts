import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * P2-367 (run #216): RTL wrap tripwire.
 *
 * whitespace-nowrap spans inside unconstrained (non-scroll) flex rows overflow
 * at 360px with long Arabic labels unless their SIBLINGS can shrink. The fix
 * pattern is `min-w-0` on the flexible sibling (so the nowrap element keeps
 * its label while the row stays inside the viewport). This tripwire pins the
 * specific repaired rows so a refactor can't silently drop the guard:
 *
 * 1. MatchChat missed-marker divider spans (flex-1 dividers beside a nowrap
 *    AR marker inside a w-full button row) must carry min-w-0.
 * 2. clubs favorites error strip: the error <p> beside the nowrap retry
 *    button must carry min-w-0, and the button must be flex-shrink-0.
 *
 * NOT flagged (deliberate): whitespace-nowrap chips inside overflow-x-auto
 * scroll rows (clubs filter chips, FilterBar chips) — the row scrolls by
 * design; nowrap is the correct affordance there. This test also asserts
 * those chip rows still live inside an overflow-x-auto container, so a
 * refactor that removes the scroll container would fail here.
 */

const appRoot = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(appRoot, p), 'utf8');

describe('P2-367 RTL wrap guards', () => {
  it('MatchChat missed-marker dividers keep min-w-0 beside the nowrap marker', () => {
    const src = read('src/components/matches/MatchChat.tsx');
    // The marker button row must exist and both its divider spans must
    // carry min-w-0 (order-insensitive: count occurrences inside the row).
    const rowStart = src.indexOf('w-full flex items-center gap-2 px-4 py-2');
    expect(rowStart).toBeGreaterThan(-1);
    const rowEnd = src.indexOf('</button>', rowStart);
    const row = src.slice(rowStart, rowEnd);
    expect(row).toContain('whitespace-nowrap');
    const dividers = row.match(/flex-1 min-w-0 h-px/g) ?? [];
    expect(dividers.length).toBe(2);
  });

  it('clubs favorites error strip: <p> shrinks (min-w-0), retry stays visible (flex-shrink-0)', () => {
    const src = read('src/app/[locale]/(main)/clubs/page.tsx');
    const stripStart = src.indexOf("t('clubs.favoritesError')");
    expect(stripStart).toBeGreaterThan(-1);
    // Walk back to the opening <p ...> and forward to the closing </button>.
    const pOpen = src.lastIndexOf('<p', stripStart);
    const pTag = src.slice(pOpen, src.indexOf('>', pOpen) + 1);
    expect(pTag).toContain('min-w-0');
    // The retry button's opening tag spans multiple lines AND contains an
    // arrow function ('=>' — a bare indexOf('>') would cut mid-tag), so
    // assert within a window that certainly covers the whole opening tag.
    const btnOpen = src.indexOf('<button', stripStart);
    const btnWindow = src.slice(btnOpen, btnOpen + 500);
    expect(btnWindow).toContain('flex-shrink-0');
  });

  it('nowrap chip rows remain inside overflow-x-auto containers (correct-scroll pattern)', () => {
    const clubs = read('src/app/[locale]/(main)/clubs/page.tsx');
    // The chip row container (px-5 pb-4) must keep its scroll affordance.
    expect(clubs).toMatch(/overflow-x-auto[^"]*scroll-container/);
    const filterBar = read('src/components/matches/FilterBar.tsx');
    expect(filterBar).toMatch(/overflow-x-auto[^"]*scroll-container/);
  });
});
