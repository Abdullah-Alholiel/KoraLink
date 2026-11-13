import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider, useTranslations } from 'next-intl';
import arMessages from '@/messages/ar.json';
import enMessages from '@/messages/en.json';

/**
 * P2-354 follow-up (run #204, probe-derived pin): next-intl renders plain
 * {arg} interpolation with LATIN digits in `ar` — only ICU plural `#`
 * markers get locale digits (empirically proven this run: `#3 من 8`).
 * The queued pill therefore pre-formats position/count via formatCount;
 * this pin bans a regression to raw numeric args.
 */
function Probe({ messages }: { messages: Record<string, unknown> }) {
  const t = useTranslations();
  return (
    <span data-testid="probe">
      {t('waitlist.queuedOf', {
        position: 3,
        count: 8,
      })}
    </span>
  );
}

describe('queued-pill digit convention (run #204 pin)', () => {
  it('documents the pipeline fact: raw args render Latin digits in ar', () => {
    render(
      <NextIntlClientProvider messages={arMessages} locale="ar">
        <Probe messages={arMessages} />
      </NextIntlClientProvider>,
    );
    // The pipeline fact this pin guards: Latin digits when args are raw.
    expect(screen.getByTestId('probe').textContent).toBe('بالانتظار · #3 من 8 بالانتظار');
  });

  it('structure: the match page pre-formats queuedOf/queuedPrefix args', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { readFileSync } = require('fs');
    const { join } = require('path');
    const page = readFileSync(
      join(__dirname, '../../src/app/[locale]/match/[id]/page.tsx'),
      'utf8',
    );
    expect(page).toContain('position: formatCount(match.yourWaitlistPosition ?? 0, numeralLocale)');
    expect(page).toContain('count: formatCount(match.waitlistCount ?? 0, numeralLocale)');
    expect(page).not.toMatch(/position: match\.yourWaitlistPosition\b(?!\s*\?\?)/);
  });

  it('en key shape unchanged (plain {position}/{count} markers)', () => {
    expect(enMessages.waitlist.queuedOf).toBe('Queued · #{position} of {count} waiting');
    expect(enMessages.waitlist.queuedPrefix).toBe('Queued · #{position}');
  });
});
