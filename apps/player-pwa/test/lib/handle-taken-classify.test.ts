import { describe, it, expect } from 'vitest';
import { FetchError } from '@/lib/fetcher';
import { classifyError, errorKey } from '@/lib/error-classify';

describe('HANDLE_TAKEN → handleTaken (cutover Card 2, 2026-11-16)', () => {
    it('maps the 409 body code to the handleTaken kind', () => {
        const err = new FetchError(
            'Handle already taken.',
            409,
            '/auth/complete-profile',
            'HANDLE_TAKEN',
        );
        expect(classifyError(err)).toBe('handleTaken');
        expect(errorKey('handleTaken')).toBe('errors.handleTaken');
    });

    it('the old 400-without-code shape still classifies as validation (no-code contract unchanged)', () => {
        const err = new FetchError('Handle already taken.', 400, '/auth/complete-profile');
        expect(classifyError(err)).toBe('validation');
    });

    it('a 409 WITHOUT the code falls back to conflict (status mapping intact)', () => {
        const err = new FetchError('That change was just made.', 409, '/x');
        expect(classifyError(err)).toBe('conflict');
    });
});
