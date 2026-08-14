import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from '@/messages/en.json';
import TeamLineup from '@/components/matches/TeamLineup';
import type { RosterPlayer } from '@/types';

function renderLineup(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider messages={enMessages} locale="en">
      {ui}
    </NextIntlClientProvider>
  );
}

/** Builds a roster of n players split Home/Aware with the host on Home. */
function makeRoster(n: number): RosterPlayer[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    userId: `p${i}`,
    name: `Player ${i + 1}`,
    avatarUrl: '',
    team: i === 0 ? 'Home' : i % 2 === 0 ? 'Home' : 'Away',
    isHost: i === 0,
  }));
}

describe('TeamLineup — all formats show ALL players', () => {
  it('renders every player for a full 5v5 (10 players, 5 per side)', () => {
    const roster = makeRoster(10);
    renderLineup(<TeamLineup format="5v5" roster={roster} />);
    roster.forEach((p) => {
      expect(screen.getByText(p.name)).toBeInTheDocument();
    });
    expect(screen.getAllByText('5/5').length).toBe(2); // both team headers at 5/5
  });

  it('renders every player for a full 7v7 (14 players)', () => {
    const roster = makeRoster(14);
    renderLineup(<TeamLineup format="7v7" roster={roster} />);
    roster.forEach((p) => {
      expect(screen.getByText(p.name)).toBeInTheDocument();
    });
  });

  it('renders every player for a full 8v8 (16 players)', () => {
    const roster = makeRoster(16);
    renderLineup(<TeamLineup format="8v8" roster={roster} />);
    roster.forEach((p) => {
      expect(screen.getByText(p.name)).toBeInTheDocument();
    });
  });

  it('renders every player for a full 11v11 (22 players)', () => {
    const roster = makeRoster(22);
    const { container } = renderLineup(<TeamLineup format="11v11" roster={roster} />);
    roster.forEach((p) => {
      expect(screen.getByText(p.name)).toBeInTheDocument();
    });
    // Every format uses a single vertical column (no 2-column chip grid).
    expect(container.querySelectorAll('.grid-cols-2').length).toBe(0);
  });

  it('renders every player for an 11v11 with a partial roster (all open slots shown)', () => {
    const roster = makeRoster(5);
    renderLineup(<TeamLineup format="11v11" roster={roster} />);
    roster.forEach((p) => {
      expect(screen.getByText(p.name)).toBeInTheDocument();
    });
    // Full 11-per-side structure: 5 filled + 17 open slots = 22 rows total.
    const empties = screen.getAllByText('Open');
    expect(empties.length).toBe(17);
  });

  it('lists players in a single vertical column for every format (7v7 and 5v5)', () => {
    const { container: c7 } = renderLineup(<TeamLineup format="7v7" roster={makeRoster(6)} />);
    expect(c7.querySelectorAll('.grid-cols-2').length).toBe(0);

    const { container: c5 } = renderLineup(<TeamLineup format="5v5" roster={makeRoster(6)} />);
    expect(c5.querySelectorAll('.grid-cols-2').length).toBe(0);
  });

  it('distributes unassigned (legacy) players across both teams', () => {
    const roster: RosterPlayer[] = Array.from({ length: 4 }, (_, i) => ({
      id: `u${i}`, userId: `u${i}`, name: `Legacy ${i + 1}`, avatarUrl: '',
      team: null, isHost: false,
    }));
    renderLineup(<TeamLineup format="5v5" roster={roster} />);
    roster.forEach((p) => {
      expect(screen.getByText(p.name)).toBeInTheDocument();
    });
  });
});
