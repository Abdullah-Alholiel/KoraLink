import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Match } from '@/types';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: () => '/ar/play',
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
}));

// We import the component — since it's 'use client' and uses Link,
// we need to mock next/link to avoid routing errors in jsdom.
vi.mock('next/link', () => ({
  default: function MockLink({ href, children, ...props }: any) {
    return <a href={href} {...props}>{children}</a>;
  },
}));

// Import after mocks are set up
import MatchCard from '@/components/matches/MatchCard';

const baseMatch: Match = {
  id: 'match-1',
  title: 'Friday Night Kickoff',
  organizer: {
    name: 'Khalid FC',
    handle: '@khalidfc',
    avatarUrl: '',
    rating: 4.8,
  },
  date: '2026-08-15',
  time: '9:00 PM',
  endTime: '10:30 PM',
  location: 'Riyadh',
  venueName: 'Green Field Stadium',
  lat: 24.7136,
  lng: 46.6753,
  format: '7v7',
  surface: 'Grass',
  gender: 'men',
  intensity: 'High Intensity',
  price: 37,
  currency: 'SAR',
  totalSpots: 14,
  filledSpots: 8,
  status: 'open',
  imageUrl: '/images/stadium-bg.png',
  rules: ['No slide tackles'],
  roster: [
    { id: 'p1', name: 'Ahmed', avatarUrl: '' },
    { id: 'p2', name: 'Sara', avatarUrl: '' },
    { id: 'p3', name: 'Omar', avatarUrl: '' },
  ],
  comments: [
    { id: 'c1', userId: 'p1', userName: 'Ahmed', userAvatar: '', text: 'See you there!', createdAt: '2026-08-15T18:00:00Z' },
  ],
};

describe('MatchCard', () => {
  it('renders match title', () => {
    render(<MatchCard match={baseMatch} />);
    expect(screen.getByText('Friday Night Kickoff')).toBeInTheDocument();
  });

  it('renders organizer name and handle', () => {
    render(<MatchCard match={baseMatch} />);
    expect(screen.getByText('@khalidfc')).toBeInTheDocument();
  });

  it('renders price with SAR', () => {
    render(<MatchCard match={baseMatch} />);
    expect(screen.getByText('SAR 37')).toBeInTheDocument();
  });

  it('renders spot count', () => {
    render(<MatchCard match={baseMatch} />);
    expect(screen.getByText('8/14 spots')).toBeInTheDocument();
  });

  it('renders location', () => {
    render(<MatchCard match={baseMatch} />);
    expect(screen.getByText('Riyadh')).toBeInTheDocument();
  });

  it('renders format and surface', () => {
    render(<MatchCard match={baseMatch} />);
    expect(screen.getByText('7v7 (Grass)')).toBeInTheDocument();
  });

  it('renders Book Spot link with correct locale path', () => {
    render(<MatchCard match={baseMatch} />);
    const link = screen.getByRole('link', { name: /book spot/i });
    expect(link).toHaveAttribute('href', '/ar/match/match-1');
  });

  it('shows CLOSING SOON badge when status is closing_soon', () => {
    render(<MatchCard match={{ ...baseMatch, status: 'closing_soon' }} />);
    expect(screen.getByText('CLOSING SOON')).toBeInTheDocument();
  });

  it('shows 1 SPOT LEFT when only 1 spot remaining', () => {
    render(<MatchCard match={{ ...baseMatch, filledSpots: 13, totalSpots: 14 }} />);
    expect(screen.getByText('1 SPOT LEFT')).toBeInTheDocument();
  });

  it('renders organizer avatar initial', () => {
    render(<MatchCard match={baseMatch} />);
    expect(screen.getByText('K')).toBeInTheDocument();
  });
});
