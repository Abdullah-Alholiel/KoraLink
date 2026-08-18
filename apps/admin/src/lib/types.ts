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

export interface AdminMatch {
  id: string;
  title: string;
  status: string;
  match_type: string;
  gender_rule: string;
  scheduled_at: string;
  duration_mins: number;
  price_per_player: number;
  max_players: number;
  booking_mode: string;
  created_at: string;
  pitch_name: string | null;
  venue_name: string | null;
  host_name: string | null;
  spots_filled: number;
}

export interface AdminVenueVerification {
  id: string;
  venue_id: string;
  legal_entity_name: string;
  commercial_reg: string | null;
  tax_id: string | null;
  iban: string | null;
  manager_name: string | null;
  manager_phone: string | null;
  status: string;
  submitted_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
}

export interface AdminVenueDetail {
  id: string;
  name: string;
  city: string;
  address: string;
  is_approved: boolean;
  is_koralink_partner: boolean;
  rating: number | string;
  owner: { id: string; full_name: string | null; handle: string | null; phone: string | null } | null;
  pitches: { id: string; name: string; size: string; surface_type: string; hourly_rate: string | number }[];
  verification: AdminVenueVerification | null;
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

export interface AdminReportListItem {
  id: string;
  subject_type: 'user' | 'match' | 'venue';
  subject_id: string;
  reason: string;
  status: 'open' | 'reviewing' | 'resolved' | 'dismissed';
  resolution: string | null;
  resolved_at: string | null;
  created_at: string;
  reporter_name: string | null;
  reporter_handle: string | null;
  subject_label: string | null;
}

export interface ReportSubject {
  type: 'user' | 'match' | 'venue';
  id: string;
  label: string;
  status: string;
}

export interface AdminReportDetail extends AdminReportListItem {
  reporter: {
    id: string;
    full_name: string | null;
    handle: string | null;
    avatar_url: string | null;
    phone: string | null;
  };
  resolvedBy: { id: string; full_name: string | null } | null;
  subject: ReportSubject;
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

export interface PartnerDashboard {
  venueNames: string[];
  todayUtilization: number;
  upcomingMatches: number;
  revenueToday: number;
  nextMatchInMinutes: number | null;
  scheduleToday: {
    pitchName: string | null;
    startTime: string;
    endTime: string;
    isBooked: boolean;
    matchTitle: string | null;
  }[];
  recentDeposits: {
    id: string;
    amount: string | number;
    status: string;
    created_at: string;
    venueName: string | null;
  }[];
}

export interface PartnerPitch {
  id: string;
  name: string;
  size: string;
  surface_type: string;
  environment: string;
  hourly_rate: string | number;
  is_active: boolean;
  images: unknown;
  venue_id: string;
  venue_name: string | null;
}

export interface PartnerVerificationRow {
  venue_id: string;
  venue_name: string | null;
  verification: {
    legal_entity_name: string;
    commercial_reg: string | null;
    tax_id: string | null;
    iban: string | null;
    manager_name: string | null;
    manager_phone: string | null;
    status: string;
  } | null;
}

export interface PartnerVenueRow {
  id: string;
  name: string;
  city: string;
  address: string;
  amenities: unknown;
  is_approved: boolean;
  is_koralink_partner: boolean;
  owner_id?: string;
  owner_name?: string | null;
  pitch_count?: number;
}

export interface PartnerSlot {
  id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  is_booked: boolean;
  match_title: string | null;
  match_id: string | null;
}

export interface PartnerEarnings {
  settlements: {
    id: string;
    amount: string | number;
    status: string;
    period_start: string;
    period_end: string;
    payout_ref: string | null;
    paid_at: string | null;
    created_at: string;
    venue_name: string | null;
  }[];
  totalPending: number;
  totalPaid: number;
}
