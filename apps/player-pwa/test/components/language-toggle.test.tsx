import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

/**
 * P2-75 (run #59): LanguageToggle's ariaLabel is REQUIRED. The old
 * `ariaLabel = 'Language'` default shipped untranslated English copy into
 * Arabic UI whenever a call site omitted the prop. TS now rejects omission
 * at compile time; these tests pin the runtime contract (localized label
 * reaches the group; unlabeled renders fail loud in dev instead of
 * silently rendering English).
 */

vi.mock('next/navigation', () => ({
  usePathname: () => '/ar/play',
}));

vi.mock('@/lib/locale-routing', () => ({
  navigatePreservingLocale: vi.fn(),
}));

// P2-264 (run #168): the toggle now fire-and-forgets the email-locale sync.
// Mocked so tests never hit the network layer.
vi.mock('@/lib/sync-user-locale', () => ({
  syncUserLocale: vi.fn().mockResolvedValue(undefined),
}));

import LanguageToggle from '@/components/common/LanguageToggle';

describe('LanguageToggle required ariaLabel (P2-75, run #59)', () => {
  it('renders the localized label on the group role', () => {
    render(<LanguageToggle ariaLabel="تحكم اللغة" />);
    const group = screen.getByRole('group');
    expect(group.getAttribute('aria-label')).toBe('تحكم اللغة');
    expect(group.getAttribute('aria-label')).not.toBe('Language');
  });

  it('keeps the pressed-state contract (ar active at /ar/…)', () => {
    render(<LanguageToggle ariaLabel="تحكم اللغة" />);
    const arBtn = screen.getByRole('button', { name: 'العربية' });
    const enBtn = screen.getByRole('button', { name: 'English' });
    expect(arBtn.getAttribute('aria-pressed')).toBe('true');
    expect(enBtn.getAttribute('aria-pressed')).toBe('false');
  });

  it('fails loud in non-production when rendered without a label (untyped renders)', () => {
    // Type-level: callers without the prop no longer compile. Runtime: an
    // untyped render (test wrapper / dynamic composition) must not silently
    // fall back to English copy.
    const untyped = LanguageToggle as unknown as React.FC<Record<string, unknown>>;
    expect(() => render(React.createElement(untyped))).toThrow(/ariaLabel is required/);
  });
});
