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
}

export interface Match {
    id: string;
    title: string;
    hostId: string;
    organizer: OrganizerInfo;
    date: string; // ISO date
    time: string; // e.g. "11:00 PM"
    endTime?: string;
    /** Raw scheduled_at ISO string from the API — timezone-safe source for time math. */
    scheduledAt?: string;
    /**
     * ISO timestamp after which POTM voting closes (match end + 24h).
     * Mirrors MatchesService.VOTING_WINDOW_HOURS on the API. A completed match
     * the user played in stays actionable on cards/lists until this moment —
     * calendar-date checks wrongly hide it after midnight.
     */
    votingClosesAt?: string;
    location: string;
    venueName: string;
    venueDetails?: string;
    lat?: number;
    lng?: number;
    /** Distance from the requesting user in metres (null when location unknown). */
    distanceM?: number | null;
    format: string; // e.g. "7v7"
    surface: string; // e.g. "Grass", "Artificial Turf"
    gender: 'men' | 'women' | 'mixed';
    intensity: string; // e.g. "Mixed Skill", "High Intensity", "Competitive"
    price: number;
    currency: string;
    totalSpots: number;
    filledSpots: number;
    status: 'open' | 'closing_soon' | 'full' | 'cancelled' | 'in_progress' | 'completed';
    imageUrl?: string;
    rules?: string[];
    roster: RosterPlayer[];
    comments: Comment[];
    /** True if current user is in the match roster (from feed API is_joined). */
    isJoined?: boolean;
    /** True if current user is the match host. */
    isUserHost?: boolean;
    /** True if the current user has already cast a POTM vote for this match. */
    hasVotedPotm?: boolean;
}

export interface RosterPlayer {
    id: string;
    userId: string;
    name: string;
    avatarUrl: string;
    team: 'Home' | 'Away' | null;
    isHost: boolean;
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

export type SkillLevel = 'Beginner' | 'Intermediate' | 'Advanced';
export type MatchGender = 'men' | 'women' | 'mixed';

// ─── Discussion (Messages screen) ────────────────────

export interface Discussion {
    id: string;
    type: 'match' | 'personal';
    title: string;
    avatarUrl: string | null;
    avatarInitials: string;
    lastMessage: string | null;
    lastMessageAt: string | null;
    lastMessageSenderName: string | null;
    unreadCount: number;
    matchStatus?: Match['status'];
    participantCount?: number;
    isOnline?: boolean;
}
