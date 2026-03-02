import type { User, PaymentMethod } from '@/types';

// ─── Auth Slice ─────────────────────────────────────

export interface AuthSlice {
    user: User | null;
    token: string | null;
    isAuthenticated: boolean;
    isOnboarded: boolean;

    login: (user: User, token: string) => void;
    logout: () => void;
    updateUser: (partial: Partial<User>) => void;
    setOnboarded: (val: boolean) => void;
}

export const createAuthSlice = (
    set: (fn: (state: AuthSlice) => Partial<AuthSlice>) => void
): AuthSlice => ({
    user: null,
    token: null,
    isAuthenticated: false,
    isOnboarded: false,

    login: (user, token) =>
        set(() => ({ user, token, isAuthenticated: true })),

    logout: () =>
        set(() => ({
            user: null,
            token: null,
            isAuthenticated: false,
            isOnboarded: false,
        })),

    updateUser: (partial) =>
        set((state) => ({
            user: state.user ? { ...state.user, ...partial } : null,
        })),

    setOnboarded: (isOnboarded) => set(() => ({ isOnboarded })),
});

// ─── Match Slice ────────────────────────────────────

export interface MatchFilters {
    date: string | null;
    city: string | null;
    format: string | null;
    maxPrice: number | null;
}

export interface MatchSlice {
    filters: MatchFilters;
    selectedMatchId: string | null;
    bookedMatchIds: string[];

    setFilters: (filters: Partial<MatchFilters>) => void;
    resetFilters: () => void;
    selectMatch: (id: string | null) => void;
    bookMatch: (id: string) => void;
    unbookMatch: (id: string) => void;
}

const defaultFilters: MatchFilters = {
    date: null,
    city: null,
    format: null,
    maxPrice: null,
};

export const createMatchSlice = (
    set: (fn: (state: MatchSlice) => Partial<MatchSlice>) => void
): MatchSlice => ({
    filters: defaultFilters,
    selectedMatchId: null,
    bookedMatchIds: [],

    setFilters: (partial) =>
        set((state) => ({
            filters: { ...state.filters, ...partial },
        })),

    resetFilters: () => set(() => ({ filters: defaultFilters })),

    selectMatch: (selectedMatchId) => set(() => ({ selectedMatchId })),

    bookMatch: (id) =>
        set((state) => ({
            bookedMatchIds: [...state.bookedMatchIds, id],
        })),

    unbookMatch: (id) =>
        set((state) => ({
            bookedMatchIds: state.bookedMatchIds.filter((mid) => mid !== id),
        })),
});

// ─── Wallet Slice ───────────────────────────────────

export interface WalletSlice {
    balance: number;
    paymentMethods: PaymentMethod[];

    setBalance: (balance: number) => void;
    addPaymentMethod: (method: PaymentMethod) => void;
    removePaymentMethod: (id: string) => void;
}

export const createWalletSlice = (
    set: (fn: (state: WalletSlice) => Partial<WalletSlice>) => void
): WalletSlice => ({
    balance: 0,
    paymentMethods: [],

    setBalance: (balance) => set(() => ({ balance })),

    addPaymentMethod: (method) =>
        set((state) => ({
            paymentMethods: [...state.paymentMethods, method],
        })),

    removePaymentMethod: (id) =>
        set((state) => ({
            paymentMethods: state.paymentMethods.filter((m) => m.id !== id),
        })),
});

// ─── UI Slice ───────────────────────────────────────

export type ToastType = 'success' | 'error' | 'info';

export interface Toast {
    id: string;
    message: string;
    type: ToastType;
}

export interface UISlice {
    isLoading: boolean;
    activeModal: string | null;
    toast: Toast | null;

    setLoading: (isLoading: boolean) => void;
    openModal: (id: string) => void;
    closeModal: () => void;
    showToast: (message: string, type: ToastType) => void;
    dismissToast: () => void;
}

export const createUISlice = (
    set: (fn: (state: UISlice) => Partial<UISlice>) => void
): UISlice => ({
    isLoading: false,
    activeModal: null,
    toast: null,

    setLoading: (isLoading) => set(() => ({ isLoading })),
    openModal: (activeModal) => set(() => ({ activeModal })),
    closeModal: () => set(() => ({ activeModal: null })),

    showToast: (message, type) =>
        set(() => ({
            toast: { id: Date.now().toString(), message, type },
        })),

    dismissToast: () => set(() => ({ toast: null })),
});
