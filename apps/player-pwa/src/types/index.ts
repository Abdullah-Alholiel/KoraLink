// ─── Domain Types ───────────────────────────────────
// Shared across store slices and UI components

export interface User {
    id: string;
    fullName: string;
    handle: string;
    avatarUrl: string;
    phone: string;
    preferredLocation: string;
    preferredPosition: string;
    skillLevel: 'beginner' | 'intermediate' | 'advanced';
    locale: 'ar' | 'en';
}

export interface OrganizerInfo {
    name: string;
    handle: string;
    avatarUrl: string;
    rating: number;
}

export interface Match {
    id: string;
    title: string;
    organizer: OrganizerInfo;
    date: string; // ISO date
    time: string; // e.g. "11:00 PM"
    endTime?: string;
    location: string;
    venueName: string;
    venueDetails?: string;
    lat?: number;
    lng?: number;
    format: string; // e.g. "7v7"
    surface: string; // e.g. "Grass", "Artificial Turf"
    gender: 'men' | 'women' | 'mixed';
    intensity: string; // e.g. "Mixed Skill", "High Intensity", "Competitive"
    price: number;
    currency: string;
    totalSpots: number;
    filledSpots: number;
    status: 'open' | 'closing_soon' | 'full' | 'cancelled';
    imageUrl?: string;
    rules?: string[];
    roster: RosterPlayer[];
    comments: Comment[];
}

export interface RosterPlayer {
    id: string;
    name: string;
    avatarUrl: string;
}

export interface Comment {
    id: string;
    userId: string;
    userName: string;
    userAvatar: string;
    text: string;
    createdAt: string;
}

export interface Transaction {
    id: string;
    type: 'debit' | 'credit';
    category: 'match_payment' | 'topup' | 'refund' | 'store_purchase' | 'withdrawal';
    title: string;
    description: string;
    amount: number;
    currency: string;
    createdAt: string; // ISO string
    icon: 'match' | 'wallet' | 'refund' | 'store' | 'withdrawal';
}

export interface Venue {
    id: string;
    name: string;
    address: string;
    city: string;
    lat: number;
    lng: number;
    imageUrl: string;
    surfaces: string[];
    rating: number;
}

export interface PaymentMethod {
    id: string;
    type: 'card' | 'apple_pay' | 'stc_pay';
    last4?: string;
    brand?: string;
    isDefault: boolean;
}

// ─── UI Types ───────────────────────────────────────

export interface DateOption {
    date: Date;
    label: string;
    dayNumber: number;
    isToday: boolean;
}

export interface NavItem {
    key: string;
    labelEn: string;
    labelAr: string;
    icon: string;
    href: string;
}

export type SkillLevel = 'beginner' | 'intermediate' | 'advanced';
export type MatchGender = 'men' | 'women' | 'mixed';
