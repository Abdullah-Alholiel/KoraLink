// ─────────────────────────────────────────────────────────────────────────────
// API Adapter — Snake case → camelCase transformations
// The NestJS API returns snake_case fields from Drizzle ORM. This module
// adapts those raw shapes into the camelCase domain types expected by the UI.
// ─────────────────────────────────────────────────────────────────────────────

import type { Match, Transaction, OrganizerInfo, RosterPlayer, Comment } from '@/types';

// ═════════════════════════════════════════════════════════════════════════════
// API Raw Types (snake_case, matches what the backend returns)
// ═════════════════════════════════════════════════════════════════════════════

/** Shape returned by GET /matches (nearby feed) — direct PostgreSQL row via sql`` */
export interface NearbyMatchApi {
  id: string;
  title: string;
  match_type: string;
  gender_rule: string;
  status: string;
  scheduled_at: string | Date;
  duration_mins: number;
  price_per_player: number;
  max_players: number;
  spots_filled: number;
  distance_m: number | null;
  host_id: string;
  host_name: string | null;
  host_avatar: string | null;
  pitch_id: string;
  pitch_name: string;
  pitch_size?: string;
  pitch_surface?: string;
  venue_name: string;
  venue_city: string;
  is_joined: boolean;
  /** Match visibility — 'private' matches are invite-link only. */
  visibility?: 'public' | 'private';
  /** True if the current user already voted POTM for this match. */
  has_voted?: boolean;
  last_message?: string | null;
  /** Authoritative POTM voting deadline from the API (effective completion + 24h). */
  voting_closes_at?: string | Date | null;
}

/** Shape returned by GET /matches/:id — Drizzle findFirst with relations */
export interface MatchDetailApi {
  id: string;
  title: string;
  host_id: string;
  match_type: string;
  gender_rule: string;
  status: string;
  scheduled_at: string | Date;
  duration_mins: number;
  completed_at?: string | null;
  price_per_player: string | number;
  max_players: number;
  location?: unknown; // PostGIS geography (may be absent in JSON)
  visibility?: 'public' | 'private';
  booking_mode?: 'koralink' | 'self';
  booking_slot_id?: string | null;
  created_at?: string;
  updated_at?: string;
  host: MatchHostApi;
  pitch: MatchPitchApi;
  players?: MatchPlayerApi[];
  messages?: MatchMessageApi[];
}

export interface MatchHostApi {
  id: string;
  full_name: string | null;
  handle: string | null;
  avatar_url: string | null;
  karma_score?: number;
}

export interface MatchPitchApi {
  name: string;
  surface_type?: string;
  size?: string; // e.g. '5v5', '7v7'
  venue?: {
    name: string;
    city: string;
    address: string;
    amenities?: unknown;
  };
}

export interface MatchPlayerApi {
  id: string;
  is_host: boolean;
  team: string | null;
  no_show?: boolean;
  user: {
    id: string;
    full_name: string | null;
    handle: string | null;
    avatar_url: string | null;
  };
}

export interface MatchMessageApi {
  id: string;
  content: string;
  created_at: string;
  user: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  };
}

/** Shape returned by GET /wallet/history — Drizzle select array */
export interface TransactionApi {
  id: string;
  user_id: string;
  type: 'CREDIT' | 'DEBIT';
  amount: string; // numeric comes as string from PostgreSQL
  reference_type: 'MATCH_FEE' | 'TOPUP' | 'REFUND' | 'PRIZE';
  reference_id: string | null;
  idempotency_key: string;
  status: 'Pending' | 'Completed' | 'Failed' | 'Reversed';
  created_at: string;
}

/** Shape returned by GET /wallet/balance */
export interface WalletBalanceApi {
  balance: string; // numeric
}

/** Shape returned by GET /wallet/history (wrapper) */
export interface WalletHistoryApi {
  transactions: TransactionApi[];
  total?: number;
  hasMore?: boolean;
}

// ═════════════════════════════════════════════════════════════════════════════
// Helpers
// ═════════════════════════════════════════════════════════════════════════════

function toNum(v: string | number): number {
  if (typeof v === 'number') return v;
  const n = parseFloat(v);
  return Number.isNaN(n) ? 0 : n;
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/** Formats a date as YYYY-MM-DD in Asia/Riyadh — the app's display timezone
 *  (set in i18n/request.ts). Using the UTC ISO date instead would mislabel
 *  matches that start before 03:00 Riyadh time. */
export function dateInRiyadh(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** Today's date (YYYY-MM-DD) in Asia/Riyadh — pair with dateInRiyadh(). */
export function todayInRiyadh(): string {
  return dateInRiyadh(new Date());
}

/** Build an ISO timestamp from a Riyadh-local "YYYY-MM-DD" date and "HH:MM"
 *  time. Riyadh is UTC+3 with no DST, so the offset is constant. The host form
 *  must use this (not `new Date(`${date}T${time}`)`) so kick-off is stored
 *  correctly regardless of the device's local timezone. */
export function riyadhISO(date: string, time: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const asUTC = Date.UTC(y, m - 1, d, hh - 3, mm);
  return new Date(asUTC).toISOString();
}

/** Validate a `?date=` query param for the host form (e.g. passed from the
 *  club calendar). Accepts only YYYY-MM-DD strings that are today-or-later in
 *  Asia/Riyadh; anything else (garbage, past dates) is ignored → null, so a
 *  bad param never blocks or corrupts the form. */
export function parseHostDateParam(
  raw: string | null | undefined,
  today: string = todayInRiyadh(),
): string | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  // ISO dates compare chronologically as strings.
  return raw >= today ? raw : null;
}

/** POTM voting window length — must mirror MatchesService.VOTING_WINDOW_HOURS. */
export const POTM_VOTING_WINDOW_HOURS = 24;

/** Platform margin (SAR) added per player on top of the raw pitch-cost share.
 *  MUST mirror MatchesService.PLATFORM_MARGIN_SAR — pinned by test/lib/pricing.test.ts. */
export const PLATFORM_MARGIN_SAR = 5;

/** Round a SAR amount up to 2 decimal places (money-safe, never rounds down). */
export const round2 = (n: number): number => Math.ceil(n * 100) / 100;

/** Pitch cost prorated from the pitch hourly rate (mirrors the server). */
export function pitchCostForDuration(hourlyRate: number, durationMins: number): number {
  return round2(hourlyRate * durationMins / 60);
}

/** Per-player price mirroring MatchesService.calculatePricePerPlayer. */
export function pricePerPlayer(pitchCostSar: number, maxPlayers: number): number {
  if (maxPlayers < 2) return pitchCostSar;
  return round2(pitchCostSar / (maxPlayers - 1) + PLATFORM_MARGIN_SAR);
}

/** True while the POTM voting window (match end + 24h) is open. */
export function isPotmVotingOpen(scheduledAt?: string, durationMins = 60): boolean {
  if (!scheduledAt) return false;
  const endMs = new Date(scheduledAt).getTime() + durationMins * 60_000;
  const closesAtMs = endMs + POTM_VOTING_WINDOW_HOURS * 60 * 60_000;
  return Date.now() < closesAtMs;
}

function fmtEnd(scheduled: Date, durationMins: number): string {
  return fmtTime(new Date(scheduled.getTime() + durationMins * 60_000));
}

function mapGender(rule: string): 'men' | 'women' | 'mixed' {
  const l = rule.toLowerCase();
  // Check 'women' FIRST — 'women only'.includes('men') is true (substring at index 2)
  if (l.includes('women')) return 'women';
  if (l.includes('men')) return 'men';
  return 'mixed';
}

function mapMatchStatus(status: string): Match['status'] {
  const s = status.toLowerCase();
  if (s === 'open') return 'open';
  if (s === 'full') return 'full';
  if (s === 'inprogress') return 'in_progress';
  if (s === 'cancelled') return 'cancelled';
  if (s === 'completed') return 'completed';
  return 'open';
}

function mapTransactionType(t: 'CREDIT' | 'DEBIT'): 'credit' | 'debit' {
  return t === 'CREDIT' ? 'credit' : 'debit';
}

function mapTransactionCategory(ref: 'MATCH_FEE' | 'TOPUP' | 'REFUND' | 'PRIZE'): Transaction['category'] {
  switch (ref) {
    case 'MATCH_FEE': return 'match_payment';
    case 'TOPUP': return 'topup';
    case 'REFUND': return 'refund';
    case 'PRIZE': return 'store_purchase';
  }
}

function mapTransactionIcon(ref: 'MATCH_FEE' | 'TOPUP' | 'REFUND' | 'PRIZE'): Transaction['icon'] {
  switch (ref) {
    case 'MATCH_FEE': return 'match';
    case 'TOPUP': return 'wallet';
    case 'REFUND': return 'refund';
    case 'PRIZE': return 'store';
  }
}

function mapTransactionStatus(status: 'Pending' | 'Completed' | 'Failed' | 'Reversed'): 'pending' | 'completed' | 'failed' {
  switch (status) {
    case 'Pending': return 'pending';
    case 'Failed': return 'failed';
    case 'Reversed': return 'failed';
    case 'Completed': return 'completed';
  }
}

function buildOrganizer(host: MatchHostApi): OrganizerInfo {
  return {
    name: host.full_name ?? 'Unknown',
    handle: host.handle ?? '@unknown',
    avatarUrl: host.avatar_url ?? '',
  };
}

function buildRoster(players: MatchPlayerApi[]): RosterPlayer[] {
  return players.map((p) => ({
    id: p.user.id,
    userId: p.user.id,
    name: p.user.full_name ?? 'Player',
    avatarUrl: p.user.avatar_url ?? '',
    team: p.team as 'Home' | 'Away' | null,
    isHost: p.is_host,
    noShow: p.no_show ?? false,
  }));
}

export function buildComments(messages: MatchMessageApi[]): Comment[] {
  return messages.map((m) => ({
    id: m.id,
    userId: m.user.id,
    userName: m.user.full_name ?? 'Player',
    userAvatar: m.user.avatar_url ?? '',
    text: m.content,
    createdAt: m.created_at,
  }));
}

// ═════════════════════════════════════════════════════════════════════════════
// Primary Adapters
// ═════════════════════════════════════════════════════════════════════════════

/** Adapts a NearbyMatchApi row → frontend Match (sparse fields from feed query) */
export function adaptNearbyMatch(row: NearbyMatchApi, currentUserId?: string): Match {
  const scheduled = new Date(row.scheduled_at);
  const durationMins = row.duration_mins ?? 60;
  const startMs = scheduled.getTime();
  const endMs = startMs + durationMins * 60_000;
  const nowMs = Date.now();

  let status = mapMatchStatus(row.status);
  if ((status === 'open' || status === 'full') && nowMs >= startMs && nowMs < endMs) {
    status = 'in_progress';
  }

  return {
    id: row.id,
    title: row.title,
    hostId: row.host_id,
    organizer: {
      name: row.host_name ?? 'Unknown',
      handle: '',
      avatarUrl: row.host_avatar ?? '',
    },
    date: dateInRiyadh(scheduled),
    time: fmtTime(scheduled),
    endTime: fmtEnd(scheduled, durationMins),
    scheduledAt: scheduled.toISOString(),
    endsAt: new Date(endMs).toISOString(),
    votingClosesAt: row.voting_closes_at
      ? new Date(row.voting_closes_at).toISOString()
      : new Date(endMs + POTM_VOTING_WINDOW_HOURS * 60 * 60_000).toISOString(),
    location: row.venue_city,
    venueName: row.venue_name,
    venueDetails: row.pitch_name,
    format: row.pitch_size ?? '7v7',
    surface: row.pitch_surface ?? '',
    gender: mapGender(row.gender_rule),
    intensity: row.match_type,
    price: toNum(row.price_per_player),
    currency: 'SAR',
    totalSpots: row.max_players,
    filledSpots: row.spots_filled,
    status,
    imageUrl: '',
    roster: [],
    comments: [],
    isJoined: row.is_joined,
    isUserHost: currentUserId ? row.host_id === currentUserId : false,
    hasVotedPotm: row.has_voted ?? false,
    distanceM: row.distance_m ?? null,
    isPrivate: row.visibility === 'private',
  };
}

/** Adapts a MatchDetailApi response → frontend Match (full detail). */
export function adaptMatchDetail(
  detail: MatchDetailApi,
  currentUserId?: string,
): Match {
  const scheduled = new Date(detail.scheduled_at);
  const duration = detail.duration_mins ?? 60;
  const startMs = scheduled.getTime();
  const endMs = startMs + duration * 60_000;
  const nowMs = Date.now();
  const venue = detail.pitch?.venue;
  const players = detail.players ?? [];
  const messages = detail.messages ?? [];

  let status = mapMatchStatus(detail.status);
  if ((status === 'open' || status === 'full') && nowMs >= startMs && nowMs < endMs) {
    status = 'in_progress';
  }

  return {
    id: detail.id,
    title: detail.title,
    hostId: detail.host_id,
    organizer: buildOrganizer(detail.host),
    date: dateInRiyadh(scheduled),
    time: fmtTime(scheduled),
    endTime: fmtEnd(scheduled, duration),
    scheduledAt: scheduled.toISOString(),
    endsAt: new Date(endMs).toISOString(),
    votingClosesAt: new Date(
      (detail.completed_at ? new Date(detail.completed_at).getTime() : endMs) +
        POTM_VOTING_WINDOW_HOURS * 60 * 60_000,
    ).toISOString(),
    location: venue?.city ?? '',
    venueName: venue?.name ?? detail.pitch?.name ?? '',
    venueDetails: venue?.address ?? '',
    format: detail.pitch?.size ?? '7v7',
    surface: detail.pitch?.surface_type ?? '',
    gender: mapGender(detail.gender_rule),
    intensity: detail.match_type,
    price: toNum(detail.price_per_player),
    currency: 'SAR',
    totalSpots: detail.max_players,
    filledSpots: players.length,
    status,
    imageUrl: '',
    rules: [],
    roster: buildRoster(players),
    comments: buildComments(messages),
    isJoined: currentUserId
      ? players.some((p) => p.user.id === currentUserId)
      : false,
    isUserHost: currentUserId
      ? detail.host_id === currentUserId
      : false,
    isPrivate: detail.visibility === 'private',
  };
}

/** Adapts many NearbyMatchApi rows → Match[] */
export function adaptMatchList(rows: NearbyMatchApi[], currentUserId?: string): Match[] {
  return rows.map(row => adaptNearbyMatch(row, currentUserId));
}

// ── Wallet Adapters ──────────────────────────────────────────────────────────

/** Adapts a raw transaction row → frontend Transaction */
export function adaptTransaction(row: TransactionApi): Transaction {
  const amount = toNum(row.amount);
  const category = mapTransactionCategory(row.reference_type);
  const type = mapTransactionType(row.type);
  const icon = mapTransactionIcon(row.reference_type);
  const status = mapTransactionStatus(row.status);

  // Build human-readable title and description
  const title = buildTransactionTitle(row.reference_type, row.reference_id);
  const description = buildTransactionDescription(status, row.created_at);

  return {
    id: row.id,
    type,
    category,
    title,
    description,
    amount,
    currency: 'SAR',
    createdAt: row.created_at,
    icon,
  };
}

/** Adapts many TransactionApi rows → Transaction[] */
export function adaptTransactionList(rows: TransactionApi[]): Transaction[] {
  return rows.map(adaptTransaction);
}

/** Parses wallet balance from string to number */
export function adaptWalletBalance(raw: WalletBalanceApi): number {
  return toNum(raw.balance);
}

// ─── Transaction Title / Description builders ─────────────────────────────

function buildTransactionTitle(ref: string, refId: string | null): string {
  switch (ref) {
    case 'MATCH_FEE': return refId ? `Match Payment #${refId.slice(0, 8)}` : 'Match Payment';
    case 'TOPUP': return 'Wallet Top Up';
    case 'REFUND': return 'Refund';
    case 'PRIZE': return 'Prize / Store Credit';
    default: return 'Transaction';
  }
}

function buildTransactionDescription(
  status: 'pending' | 'completed' | 'failed',
  createdAt: string,
): string {
  const date = new Date(createdAt);
  const timeStr = date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  const capStatus = status.charAt(0).toUpperCase() + status.slice(1);
  return `${timeStr} • ${capStatus}`;
}
