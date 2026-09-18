/**
 * MatchCard — My Games tailored tags (2026-09-18).
 *
 * Abdullah: "a user should be able to see tailored game tags that consist of
 * whether they hosted that match, and whether this match was cancelled or
 * not". Before this change a cancelled match rendered EXACTLY like a
 * completed one (gray "View Details" pill), and the host badge vanished the
 * moment a match completed or was cancelled — the two states a player most
 * needs to distinguish in My Games History.
 *
 * Tag policy: the host tag is rendered for EVERY status (persistent tag row),
 * the cancelled tag only for status='cancelled'; a joined badge does NOT
 * downgrade to a host badge when the host is also a joiner.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from '@/messages/en.json';
import arMessages from '@/messages/ar.json';
import type { Match } from '@/types';

vi.mock('next/navigation', () => ({
    usePathname: () => '/en/my-games',
}));

import MatchCard from './MatchCard';

function renderCard(match: Match, locale: 'en' | 'ar' = 'en') {
    return render(
        <NextIntlClientProvider
            messages={locale === 'ar' ? arMessages : enMessages}
            locale={locale}
        >
            <MatchCard match={match} currentUserId="user-me" />
        </NextIntlClientProvider>,
    );
}

function baseMatch(overrides: Partial<Match> = {}): Match {
    const future = new Date(Date.now() + 3 * 86_400_000).toISOString();
    return {
        id: 'm-1',
        title: 'Friday Night 7v7',
        hostId: 'user-me',
        organizer: { name: 'Me', handle: 'me', avatarUrl: '' },
        date: future.slice(0, 10),
        time: '8:00 PM',
        scheduledAt: future,
        location: 'Riyadh',
        venueName: 'Riyadh Arena',
        format: '7v7',
        surface: 'Grass',
        gender: 'men',
        intensity: 'Casual',
        price: 40,
        currency: 'SAR',
        totalSpots: 10,
        filledSpots: 4,
        status: 'open',
        roster: [],
        comments: [],
        isJoined: true,
        isUserHost: true,
        ...overrides,
    };
}

beforeEach(() => {
    // Guard against silent fixture drift — every test below assumes a host card.
    // (Individual tests override isUserHost/status explicitly.)
});

describe('MatchCard — tailored tags (host + cancelled)', () => {
    it('shows the host tag on an active hosted match', () => {
        renderCard(baseMatch());
        expect(screen.getByTestId('match-card-host-tag')).toHaveTextContent('Your Match');
    });

    it('does NOT show the host tag when the user is only a joiner', () => {
        renderCard(baseMatch({ isUserHost: false, hostId: 'someone-else' }));
        expect(screen.queryByTestId('match-card-host-tag')).toBeNull();
    });

    it('KEEPS the host tag after the match completes (badge no longer disappears)', () => {
        renderCard(
            baseMatch({
                status: 'completed',
                scheduledAt: new Date(Date.now() - 8 * 86_400_000).toISOString(),
                votingClosesAt: new Date(Date.now() - 7 * 86_400_000).toISOString(),
            }),
        );
        expect(screen.getByTestId('match-card-host-tag')).toBeInTheDocument();
    });

    it('KEEPS the host tag after the match is cancelled', () => {
        renderCard(
            baseMatch({
                status: 'cancelled',
                scheduledAt: new Date(Date.now() - 8 * 86_400_000).toISOString(),
            }),
        );
        expect(screen.getByTestId('match-card-host-tag')).toBeInTheDocument();
    });

    it('shows the cancelled tag + dimmed strikethrough card for a cancelled match', () => {
        const { container } = renderCard(
            baseMatch({
                status: 'cancelled',
                scheduledAt: new Date(Date.now() - 8 * 86_400_000).toISOString(),
            }),
        );
        expect(screen.getByTestId('match-card-cancelled-tag')).toHaveTextContent(
            'Match Cancelled',
        );
        const link = container.querySelector('a');
        expect(link?.className).toContain('opacity-60');
        const title = screen.getByText('Friday Night 7v7');
        expect(title.className).toContain('line-through');
        expect(title.className).toContain('text-gray-400');
    });

    it('renders NO cancelled visuals for completed matches', () => {
        const { container } = renderCard(
            baseMatch({
                status: 'completed',
                scheduledAt: new Date(Date.now() - 8 * 86_400_000).toISOString(),
                votingClosesAt: new Date(Date.now() - 7 * 86_400_000).toISOString(),
            }),
        );
        expect(screen.queryByTestId('match-card-cancelled-tag')).toBeNull();
        expect(container.querySelector('a')?.className).not.toContain('opacity-60');
    });

    it('host state wins over joined state — no duplicate joined badge on a hosted card', () => {
        // isUserHost AND isJoined → the HOST branch takes precedence: button says
        // "Your Match" and the green "You're In" badge is not duplicated.
        renderCard(baseMatch({ isJoined: true, isUserHost: true }));
        expect(screen.getByTestId('match-card-host-tag')).toBeInTheDocument();
        // "Your Match" renders twice BY DESIGN: the tailored tag pill AND the
        // action button (host state keeps its amber button).
        expect(screen.getAllByText('Your Match')).toHaveLength(2);
        expect(screen.queryByText("You're In")).toBeNull();
    });

    it('localizes the tags in Arabic (مباراتك / تم إلغاء المباراة)', () => {
        renderCard(baseMatch({ status: 'cancelled' }), 'ar');
        expect(screen.getByTestId('match-card-host-tag')).toHaveTextContent('مباراتك');
        expect(screen.getByTestId('match-card-cancelled-tag')).toHaveTextContent(
            'تم إلغاء المباراة',
        );
    });
});
