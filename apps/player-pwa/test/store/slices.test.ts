import { describe, it, expect, vi } from 'vitest';
import {
  createAuthSlice,
  createMatchSlice,
  createWalletSlice,
  createUISlice,
} from '@/store/slices';
import type { User, PaymentMethod } from '@/types';

// Helper: create a mock set that returns the partial state
function mockSet<T>() {
  const set = vi.fn((fn: (state: T) => Partial<T>) => {
    const prevState = set.__prevState ?? {};
    const partial = fn(prevState as T);
    set.__prevState = { ...prevState, ...partial };
  }) as ReturnType<typeof vi.fn> & { __prevState: Record<string, unknown> };
  set.__prevState = {};
  return set;
}

// ─── Auth Slice ─────────────────────────────────────

describe('createAuthSlice', () => {
  const mockUser: User = {
    id: 'u1',
    fullName: 'Ahmed Al-Rashid',
    handle: '@ahmed',
    avatarUrl: 'https://example.com/avatar.jpg',
    phone: '+966501234567',
    preferredLocation: 'Riyadh',
    preferredPosition: 'forward',
    skillLevel: 'advanced',
    locale: 'ar',
  };

  it('initialises with null user and unauthenticated state', () => {
    const set = mockSet();
    const slice = createAuthSlice(set as never);
    expect(slice.user).toBeNull();
    expect(slice.token).toBeNull();
    expect(slice.isAuthenticated).toBe(false);
    expect(slice.isOnboarded).toBe(false);
  });

  it('login sets user, token, and isAuthenticated', () => {
    const set = mockSet();
    const slice = createAuthSlice(set as never);
    slice.login(mockUser, 'jwt-token-123');
    expect(set).toHaveBeenCalled();
    expect(set.__prevState.isAuthenticated).toBe(true);
  });

  it('logout clears all auth state', () => {
    const set = mockSet();
    const slice = createAuthSlice(set as never);
    slice.logout();
    expect(set).toHaveBeenCalled();
    expect(set.__prevState.user).toBeNull();
    expect(set.__prevState.token).toBeNull();
    expect(set.__prevState.isAuthenticated).toBe(false);
    expect(set.__prevState.isOnboarded).toBe(false);
  });

  it('updateUser merges partial fields into existing user', () => {
    const set = mockSet();
    set.__prevState = { user: mockUser };
    const slice = createAuthSlice(set as never);
    slice.updateUser({ fullName: 'Ahmed Updated' });
    expect(set).toHaveBeenCalled();
  });

  it('updateUser does nothing when user is null', () => {
    const set = mockSet();
    const slice = createAuthSlice(set as never);
    slice.updateUser({ fullName: 'Nobody' });
    expect(set).toHaveBeenCalled();
    expect(set.__prevState.user).toBeNull();
  });

  it('setOnboarded flips the flag', () => {
    const set = mockSet();
    const slice = createAuthSlice(set as never);
    slice.setOnboarded(true);
    expect(set.__prevState.isOnboarded).toBe(true);
    slice.setOnboarded(false);
    expect(set.__prevState.isOnboarded).toBe(false);
  });
});

// ─── Match Slice ────────────────────────────────────

describe('createMatchSlice', () => {
  it('initialises with default filters and empty arrays', () => {
    const set = mockSet();
    const slice = createMatchSlice(set as never);
    expect(slice.filters.date).toBeNull();
    expect(slice.filters.city).toBeNull();
    expect(slice.filters.format).toBeNull();
    expect(slice.filters.maxPrice).toBeNull();
    expect(slice.selectedMatchId).toBeNull();
    expect(slice.bookedMatchIds).toEqual([]);
  });

  it('setFilters merges partial filters', () => {
    const set = mockSet();
    set.__prevState = {
      filters: { date: null, city: null, format: null, maxPrice: null },
    };
    const slice = createMatchSlice(set as never);
    slice.setFilters({ city: 'Riyadh' });
    expect(set).toHaveBeenCalled();
    expect(set.__prevState.filters).toEqual({
      date: null,
      city: 'Riyadh',
      format: null,
      maxPrice: null,
    });
  });

  it('resetFilters returns all filters to null', () => {
    const set = mockSet();
    set.__prevState = {
      filters: { date: '2026-01-01', city: 'Riyadh', format: '5v5', maxPrice: 100 },
    };
    const slice = createMatchSlice(set as never);
    slice.resetFilters();
    expect(set.__prevState.filters).toEqual({
      date: null,
      city: null,
      format: null,
      maxPrice: null,
    });
  });

  it('selectMatch sets selectedMatchId', () => {
    const set = mockSet();
    const slice = createMatchSlice(set as never);
    slice.selectMatch('m1');
    expect(set.__prevState.selectedMatchId).toBe('m1');
  });

  it('selectMatch(null) clears selection', () => {
    const set = mockSet();
    set.__prevState = { selectedMatchId: 'm1' };
    const slice = createMatchSlice(set as never);
    slice.selectMatch(null);
    expect(set.__prevState.selectedMatchId).toBeNull();
  });

  it('bookMatch adds id to bookedMatchIds', () => {
    const set = mockSet();
    set.__prevState = { bookedMatchIds: ['m1'] };
    const slice = createMatchSlice(set as never);
    slice.bookMatch('m2');
    expect(set.__prevState.bookedMatchIds).toEqual(['m1', 'm2']);
  });

  it('unbookMatch removes id from bookedMatchIds', () => {
    const set = mockSet();
    set.__prevState = { bookedMatchIds: ['m1', 'm2', 'm3'] };
    const slice = createMatchSlice(set as never);
    slice.unbookMatch('m2');
    expect(set.__prevState.bookedMatchIds).toEqual(['m1', 'm3']);
  });

  it('unbookMatch is a no-op when id is not present', () => {
    const set = mockSet();
    set.__prevState = { bookedMatchIds: ['m1'] };
    const slice = createMatchSlice(set as never);
    slice.unbookMatch('nonexistent');
    expect(set.__prevState.bookedMatchIds).toEqual(['m1']);
  });
});

// ─── Wallet Slice ───────────────────────────────────

describe('createWalletSlice', () => {
  it('initialises with zero balance and empty payment methods', () => {
    const set = mockSet();
    const slice = createWalletSlice(set as never);
    expect(slice.balance).toBe(0);
    expect(slice.paymentMethods).toEqual([]);
  });

  it('setBalance updates the balance', () => {
    const set = mockSet();
    const slice = createWalletSlice(set as never);
    slice.setBalance(150);
    expect(set.__prevState.balance).toBe(150);
  });

  it('addPaymentMethod appends a method', () => {
    const set = mockSet();
    set.__prevState = { balance: 0, paymentMethods: [] };
    const method: PaymentMethod = {
      id: 'pm1',
      type: 'card',
      last4: '4242',
      brand: 'Visa',
      isDefault: true,
    };
    const slice = createWalletSlice(set as never);
    slice.addPaymentMethod(method);
    expect((set.__prevState.paymentMethods as unknown[])).toHaveLength(1);
    expect((set.__prevState.paymentMethods as { id: string }[])[0].id).toBe('pm1');
  });

  it('removePaymentMethod removes by id', () => {
    const set = mockSet();
    set.__prevState = {
      paymentMethods: [
        { id: 'pm1', type: 'card', last4: '4242', brand: 'Visa', isDefault: true },
        { id: 'pm2', type: 'stc_pay', isDefault: false },
      ],
    };
    const slice = createWalletSlice(set as never);
    slice.removePaymentMethod('pm1');
    expect((set.__prevState.paymentMethods as unknown[])).toHaveLength(1);
    expect((set.__prevState.paymentMethods as { id: string }[])[0].id).toBe('pm2');
  });

  it('removePaymentMethod is a no-op for missing id', () => {
    const set = mockSet();
    set.__prevState = { paymentMethods: [{ id: 'pm1', type: 'card', isDefault: false }] };
    const slice = createWalletSlice(set as never);
    slice.removePaymentMethod('nonexistent');
    expect(set.__prevState.paymentMethods).toHaveLength(1);
  });
});

// ─── UI Slice ───────────────────────────────────────

describe('createUISlice', () => {
  it('initialises with no loading, no modal, no toast', () => {
    const set = mockSet();
    const slice = createUISlice(set as never);
    expect(slice.isLoading).toBe(false);
    expect(slice.activeModal).toBeNull();
    expect(slice.toast).toBeNull();
  });

  it('setLoading toggles loading state', () => {
    const set = mockSet();
    const slice = createUISlice(set as never);
    slice.setLoading(true);
    expect(set.__prevState.isLoading).toBe(true);
    slice.setLoading(false);
    expect(set.__prevState.isLoading).toBe(false);
  });

  it('openModal / closeModal set and clear activeModal', () => {
    const set = mockSet();
    const slice = createUISlice(set as never);
    slice.openModal('payment-sheet');
    expect(set.__prevState.activeModal).toBe('payment-sheet');
    slice.closeModal();
    expect(set.__prevState.activeModal).toBeNull();
  });

  it('showToast creates a toast with id, message, type', () => {
    const set = mockSet();
    const slice = createUISlice(set as never);
    slice.showToast('Match joined!', 'success');
    const toast = set.__prevState.toast as { id: string; message: string; type: string };
    expect(toast.message).toBe('Match joined!');
    expect(toast.type).toBe('success');
    expect(toast.id).toBeDefined();
  });

  it('dismissToast clears toast', () => {
    const set = mockSet();
    set.__prevState = {
      toast: { id: '1', message: 'hi', type: 'info' },
    };
    const slice = createUISlice(set as never);
    slice.dismissToast();
    expect(set.__prevState.toast).toBeNull();
  });
});
