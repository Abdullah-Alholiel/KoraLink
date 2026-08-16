export interface AdminMetrics {
  totals: {
    users: number;
    matches: number;
    venues: number;
    pitches: number;
    disputesOpen: number;
    floatHeld: number;
    pendingPayouts: number;
  };
  completionRate: number;
  disputeRate: number;
  avgResolutionHours: number;
  revenueSeries: { month: string; revenue: number }[];
  matchesPlayedVsCancelled: { month: string; played: number; cancelled: number }[];
  disputeRateSeries: { month: string; rate: number }[];
}

export interface AdminUser {
  id: string;
  phone: string;
  full_name: string | null;
  handle: string | null;
  avatar_url: string | null;
  role: 'Player' | 'VenueOwner' | 'Admin';
  wallet_balance: string | number;
  karma_score: number;
  rating: number;
  no_show_count: number;
  banned_at: string | null;
  suspended_until: string | null;
  verification_status: string;
  last_seen_at: string | null;
  created_at: string;
  matchesPlayed?: number;
  totalSpent?: number;
}

export interface AdminVenue {
  id: string;
  name: string;
  city: string;
  address: string;
  is_approved: boolean;
  is_koralink_partner: boolean;
  rating: number | string;
  created_at?: string;
  owner_id?: string;
  owner_name?: string | null;
  pitch_count?: number;
  verification_status?: string;
}

export interface DisputeListItem {
  id: string;
  type: string;
  status: string;
  decision: string | null;
  policy_ref: string | null;
  created_at: string;
  updated_at: string;
  reporter_name: string | null;
  respondent_name: string | null;
  match_id: string | null;
  match_title: string | null;
}

export interface AdminTransaction {
  id: string;
  user_id: string;
  type: 'CREDIT' | 'DEBIT';
  amount: number;
  reference_type: string;
  reference_id: string | null;
  status: string;
  created_at: string;
  user_name: string | null;
  user_phone: string | null;
}

export interface Settlement {
  id: string;
  venue_id: string;
  amount: number;
  period_start: string;
  period_end: string;
  status: 'pending' | 'paid' | 'failed';
  payout_ref: string | null;
  paid_at: string | null;
  created_at: string;
  venue_name: string | null;
}

export interface AuditLog {
  id: string;
  admin_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  created_at: string;
  admin_name: string | null;
}

export interface ListResponse<T> {
  total: number;
  page: number;
  perPage: number;
}
