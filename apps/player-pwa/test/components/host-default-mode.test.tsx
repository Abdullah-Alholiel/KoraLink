import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from '@/messages/en.json';
import ModeToggle from '@/components/host/ModeToggle';
import { hostMatchSchema } from '@/hooks/useMatches';

/**
 * Product default (2026-09-04): opening "Host a Match" from ANYWHERE must
 * land on "Book via Us" (koralink) — the host must actively switch to
 * "Book by Yourself". These specs pin the default at every PWA layer:
 *
 *  - ModeToggle renders `aria-pressed` so the active mode is semantic and
 *    testable (also an a11y win for the toggle).
 *  - The Zod payload schema fills an omitted booking_mode with 'koralink',
 *    matching the API DTO/Swagger default and the DB column default
 *    (migration 0032).
 */
describe('Host-a-match default mode — Book via Us (koralink)', () => {
    function renderToggle(mode: 'koralink' | 'self') {
        return render(
            <NextIntlClientProvider messages={enMessages} locale="en">
                <ModeToggle mode={mode} onModeChange={() => {}} />
            </NextIntlClientProvider>,
        );
    }

    it('opens with "Book via Us" active when the mode is koralink', () => {
        renderToggle('koralink');
        expect(screen.getByRole('button', { name: 'Book via Us' })).toHaveAttribute(
            'aria-pressed',
            'true',
        );
        expect(screen.getByRole('button', { name: 'Book by Yourself' })).toHaveAttribute(
            'aria-pressed',
            'false',
        );
    });

    it('activates "Book by Yourself" only after the host switches', () => {
        renderToggle('self');
        expect(screen.getByRole('button', { name: 'Book by Yourself' })).toHaveAttribute(
            'aria-pressed',
            'true',
        );
        expect(screen.getByRole('button', { name: 'Book via Us' })).toHaveAttribute(
            'aria-pressed',
            'false',
        );
    });

    it('Zod payload schema defaults an omitted booking_mode to koralink', () => {
        const parsed = hostMatchSchema.parse({
            pitch_id: 'pitch-1',
            title: 'Friday Night 7v7',
            match_type: 'Casual',
            gender_rule: 'Mixed',
            scheduled_at: '2026-09-05T19:00:00.000Z',
            duration_mins: 60,
            max_players: 14,
        });
        expect(parsed.booking_mode).toBe('koralink');
    });

    it('keeps an explicit self booking_mode untouched', () => {
        const parsed = hostMatchSchema.parse({
            pitch_id: 'pitch-1',
            title: 'Friday Night 7v7',
            match_type: 'Casual',
            gender_rule: 'Mixed',
            scheduled_at: '2026-09-05T19:00:00.000Z',
            booking_mode: 'self',
        });
        expect(parsed.booking_mode).toBe('self');
    });
});
