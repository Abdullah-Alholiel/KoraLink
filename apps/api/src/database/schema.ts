import {
  pgTable,
  text,
  varchar,
  boolean,
  integer,
  numeric,
  doublePrecision,
  timestamp,
  date,
  time,
  json,
  pgEnum,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { customType } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';

// ─────────────────────────────────────────────────────────────────────────────
// PostGIS custom type — geography(Point, 4326)
// ─────────────────────────────────────────────────────────────────────────────

export const geography = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'geography(Point, 4326)';
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Enums (mirror Prisma enum names so existing DB enums are reused)
// ─────────────────────────────────────────────────────────────────────────────

export const skillLevelEnum = pgEnum('SkillLevel', [
  'Beginner',
  'Intermediate',
  'Advanced',
]);

export const userRoleEnum = pgEnum('UserRole', [
  'Player',
  'VenueOwner',
  'Admin',
]);

export const pitchSizeEnum = pgEnum('PitchSize', [
  '5v5',
  '7v7',
  '8v8',
  '11v11',
]);

export const surfaceTypeEnum = pgEnum('SurfaceType', ['Grass', 'Artificial']);

export const environmentEnum = pgEnum('Environment', ['Indoor', 'Outdoor']);

export const matchTypeEnum = pgEnum('MatchType', ['Casual', 'Competitive']);

export const genderRuleEnum = pgEnum('GenderRule', [
  'Men Only',
  'Women Only',
  'Mixed',
]);

export const matchStatusEnum = pgEnum('MatchStatus', [
  'Open',
  'Full',
  'InProgress',
  'Completed',
  'Cancelled',
]);

export const transactionTypeEnum = pgEnum('TransactionType', [
  'CREDIT',
  'DEBIT',
]);

export const referenceTypeEnum = pgEnum('ReferenceType', [
  'MATCH_FEE',
  'TOPUP',
  'REFUND',
  'PRIZE',
  'PITCH_BOOKING',
  'SETTLEMENT',
  'PAYOUT',
  'ADJUSTMENT',
]);

export const transactionStatusEnum = pgEnum('TransactionStatus', [
  'Pending',
  'Completed',
  'Failed',
  'Reversed',
]);

export const teamEnum = pgEnum('Team', ['Home', 'Away']);

export const activityVerbEnum = pgEnum('ActivityVerb', [
  'created_match',
  'joined_match',
  'followed',
  'messaged',
  'pom_decided',
  // ── Admin→player notifications (ops console actions) ──
  'dispute_resolved',
  'dispute_rejected',
  'wallet_refunded',
  'match_cancelled_admin',
  'account_suspended',
  'account_banned',
  'no_show_marked',
]);

export const bookingModeEnum = pgEnum('BookingMode', ['koralink', 'self']);

export const disputeTypeEnum = pgEnum('DisputeType', [
  'no_show',
  'double_booking',
  'pitch_condition',
  'unrecognized_charge',
  'other',
]);

export const disputeStatusEnum = pgEnum('DisputeStatus', [
  'opened',
  'under_review',
  'resolved',
  'rejected',
]);

export const settlementStatusEnum = pgEnum('SettlementStatus', [
  'pending',
  'paid',
  'failed',
]);

export const verificationStatusEnum = pgEnum('VerificationStatus', [
  'pending',
  'approved',
  'rejected',
]);

export const reportStatusEnum = pgEnum('ReportStatus', [
  'open',
  'reviewing',
  'resolved',
  'dismissed',
]);

// ─────────────────────────────────────────────────────────────────────────────
// TypeScript string-literal types (replaces @prisma/client enum imports)
// ─────────────────────────────────────────────────────────────────────────────

export type TransactionType = 'CREDIT' | 'DEBIT';
export type ReferenceType =
  | 'MATCH_FEE'
  | 'TOPUP'
  | 'REFUND'
  | 'PRIZE'
  | 'PITCH_BOOKING'
  | 'SETTLEMENT'
  | 'PAYOUT'
  | 'ADJUSTMENT';

// ─────────────────────────────────────────────────────────────────────────────
// Tables
// ─────────────────────────────────────────────────────────────────────────────

export const users = pgTable('users', {
  id: varchar('id', { length: 36 })
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  phone: varchar('phone', { length: 20 }).notNull().unique(),
  full_name: varchar('full_name', { length: 255 }),
  handle: varchar('handle', { length: 50 }).unique(),
  avatar_url: text('avatar_url'),
  preferred_location: varchar('preferred_location', { length: 255 }),
  preferred_position: varchar('preferred_position', { length: 100 }),
  skill_level: skillLevelEnum('skill_level'),
  role: userRoleEnum('role').notNull().default('Player'),
  wallet_balance: numeric('wallet_balance', { precision: 12, scale: 2 })
    .notNull()
    .default('0'),
  karma_score: integer('karma_score').notNull().default(0),
  rating: doublePrecision('rating').notNull().default(0),
  no_show_count: integer('no_show_count').notNull().default(0),
  home_lat: doublePrecision('home_lat'),
  home_lng: doublePrecision('home_lng'),
  banned_at: timestamp('banned_at', { withTimezone: true }),
  suspended_until: timestamp('suspended_until', { withTimezone: true }),
  verification_status: verificationStatusEnum('verification_status')
    .notNull()
    .default('pending'),
  last_seen_at: timestamp('last_seen_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  // $onUpdateFn sets updated_at when Drizzle's .update() is called from
  // application code. Service methods must explicitly pass updated_at: new Date()
  // in their .set() calls to ensure the timestamp is refreshed.
  updated_at: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdateFn(() => new Date()),
});

export const venues = pgTable(
  'venues',
  {
    id: varchar('id', { length: 36 })
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    owner_id: varchar('owner_id', { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    city: varchar('city', { length: 100 }).notNull(),
    address: text('address').notNull(),
    amenities: json('amenities').notNull().default(sql`'[]'::json`),
    rating: doublePrecision('rating').notNull().default(0),
    is_approved: boolean('is_approved').notNull().default(false),
    is_koralink_partner: boolean('is_koralink_partner').notNull().default(false),
    location: geography('location'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (t) => [index('venues_city_idx').on(t.city)],
);

export const pitches = pgTable('pitches', {
  id: varchar('id', { length: 36 })
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  venue_id: varchar('venue_id', { length: 36 })
    .notNull()
    .references(() => venues.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  size: pitchSizeEnum('size').notNull(),
  surface_type: surfaceTypeEnum('surface_type').notNull(),
  environment: environmentEnum('environment').notNull(),
  hourly_rate: numeric('hourly_rate', { precision: 10, scale: 2 }).notNull(),
  is_active: boolean('is_active').notNull().default(true),
  images: json('images').notNull().default(sql`'[]'::json`),
  created_at: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdateFn(() => new Date()),
}, (t) => [index('pitches_venue_id_idx').on(t.venue_id)]);

export const pitch_slots = pgTable('pitch_slots', {
  id: varchar('id', { length: 36 })
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  pitch_id: varchar('pitch_id', { length: 36 })
    .notNull()
    .references(() => pitches.id, { onDelete: 'cascade' }),
  slot_date: date('slot_date').notNull(),
  start_time: time('start_time').notNull(),
  end_time: time('end_time').notNull(),
  is_booked: boolean('is_booked').notNull().default(false),
  booked_match_id: varchar('booked_match_id', { length: 36 })
    .references(() => matches.id, { onDelete: 'set null' }),
  created_at: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdateFn(() => new Date()),
}, (table) => [
  uniqueIndex('uq_pitch_slot').on(table.pitch_id, table.slot_date, table.start_time),
  index('idx_slots_pitch_date').on(table.pitch_id, table.slot_date),
  index('idx_slots_available').on(table.is_booked).where(sql`${table.is_booked} = false`),
]);

export const matchVisibilityEnum = pgEnum('match_visibility', [
  'public',
  'private',
] as const);

export const matches = pgTable(
  'matches',
  {
    visibility: matchVisibilityEnum('visibility')
      .notNull()
      .default('public'),
    id: varchar('id', { length: 36 })
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    host_id: varchar('host_id', { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    pitch_id: varchar('pitch_id', { length: 36 })
      .notNull()
      .references(() => pitches.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 255 }).notNull(),
    match_type: matchTypeEnum('match_type').notNull(),
    gender_rule: genderRuleEnum('gender_rule').notNull(),
    status: matchStatusEnum('status').notNull().default('Open'),
    scheduled_at: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    duration_mins: integer('duration_mins').notNull(),
    price_per_player: numeric('price_per_player', {
      precision: 10,
      scale: 2,
    }).notNull(),
    pitch_cost_sar: numeric('pitch_cost_sar', {
      precision: 10,
      scale: 2,
    }),
    max_players: integer('max_players').notNull(),
    location: geography('location'),
    completed_at: timestamp('completed_at', { withTimezone: true }),
    pom_winner_id: varchar('pom_winner_id', { length: 36 })
      .references(() => users.id, { onDelete: 'set null' }),
    pom_announced_at: timestamp('pom_announced_at', { withTimezone: true }),
    booking_mode: bookingModeEnum('booking_mode').notNull().default('self'),
    booking_slot_id: varchar('booking_slot_id', { length: 36 })
      .references(() => pitch_slots.id, { onDelete: 'set null' }),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (t) => [
    index('matches_status_idx').on(t.status),
    index('matches_scheduled_at_idx').on(t.scheduled_at),
  ],
);

export const match_players = pgTable(
  'match_players',
  {
    id: varchar('id', { length: 36 })
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    match_id: varchar('match_id', { length: 36 })
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    user_id: varchar('user_id', { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    team: teamEnum('team'),
    is_host: boolean('is_host').notNull().default(false),
    no_show: boolean('no_show').notNull().default(false),
  },
  (t) => [
    uniqueIndex('match_players_match_user_idx').on(t.match_id, t.user_id),
    index('match_players_user_id_idx').on(t.user_id),
  ],
);

export const transactions = pgTable(
  'transactions',
  {
    id: varchar('id', { length: 36 })
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    user_id: varchar('user_id', { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: transactionTypeEnum('type').notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    reference_type: referenceTypeEnum('reference_type').notNull(),
    reference_id: varchar('reference_id', { length: 36 }),
    idempotency_key: varchar('idempotency_key', { length: 255 })
      .notNull()
      .unique(),
    status: transactionStatusEnum('status').notNull().default('Pending'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('transactions_user_created_idx').on(t.user_id, t.created_at),
  ],
);

export const match_messages = pgTable(
  'match_messages',
  {
    id: varchar('id', { length: 36 })
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    match_id: varchar('match_id', { length: 36 })
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    user_id: varchar('user_id', { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    client_message_id: varchar('client_message_id', { length: 36 }),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('match_messages_match_idx').on(t.match_id)],
);

export const match_votes = pgTable(
  'match_votes',
  {
    id: varchar('id', { length: 36 })
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    match_id: varchar('match_id', { length: 36 })
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    voter_id: varchar('voter_id', { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    candidate_id: varchar('candidate_id', { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('match_votes_voter_match_idx').on(t.match_id, t.voter_id),
    index('match_votes_match_idx').on(t.match_id),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// Relations (replicate Prisma nested reading capabilities)
// ─────────────────────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  venues: many(venues),
  hosted: many(matches, { relationName: 'HostedMatches' }),
  matchPlayers: many(match_players),
  transactions: many(transactions),
  messages: many(match_messages),
  conversationParticipants: many(conversation_participants),
  sentPersonalMessages: many(personal_messages, { relationName: 'SentPersonalMessages' }),
}));

export const venuesRelations = relations(venues, ({ one, many }) => ({
  owner: one(users, { fields: [venues.owner_id], references: [users.id] }),
  pitches: many(pitches),
}));

export const pitchesRelations = relations(pitches, ({ one, many }) => ({
  venue: one(venues, { fields: [pitches.venue_id], references: [venues.id] }),
  matches: many(matches),
  slots: many(pitch_slots),
}));

export const pitchSlotsRelations = relations(pitch_slots, ({ one }) => ({
  pitch: one(pitches, { fields: [pitch_slots.pitch_id], references: [pitches.id] }),
  match: one(matches, { fields: [pitch_slots.booked_match_id], references: [matches.id] }),
}));

export const matchesRelations = relations(matches, ({ one, many }) => ({
  host: one(users, {
    fields: [matches.host_id],
    references: [users.id],
    relationName: 'HostedMatches',
  }),
  pitch: one(pitches, {
    fields: [matches.pitch_id],
    references: [pitches.id],
  }),
  players: many(match_players),
  messages: many(match_messages),
}));

export const matchPlayersRelations = relations(match_players, ({ one }) => ({
  match: one(matches, {
    fields: [match_players.match_id],
    references: [matches.id],
  }),
  user: one(users, {
    fields: [match_players.user_id],
    references: [users.id],
  }),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  user: one(users, {
    fields: [transactions.user_id],
    references: [users.id],
  }),
}));

export const matchMessagesRelations = relations(match_messages, ({ one }) => ({
  match: one(matches, {
    fields: [match_messages.match_id],
    references: [matches.id],
  }),
  user: one(users, {
    fields: [match_messages.user_id],
    references: [users.id],
  }),
}));

export const matchVotesRelations = relations(match_votes, ({ one }) => ({
  match: one(matches, {
    fields: [match_votes.match_id],
    references: [matches.id],
  }),
  voter: one(users, {
    fields: [match_votes.voter_id],
    references: [users.id],
    relationName: 'CastVotes',
  }),
  candidate: one(users, {
    fields: [match_votes.candidate_id],
    references: [users.id],
    relationName: 'ReceivedVotes',
  }),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Push notification subscriptions (Web Push API)
// ─────────────────────────────────────────────────────────────────────────────

export const push_subscriptions = pgTable(
  'push_subscriptions',
  {
    id: varchar('id', { length: 36 })
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    user_id: varchar('user_id', { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    user_agent: text('user_agent'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (t) => [
    uniqueIndex('push_subscriptions_endpoint_idx').on(t.endpoint),
    index('push_subscriptions_user_idx').on(t.user_id),
  ],
);

export const pushSubscriptionsRelations = relations(push_subscriptions, ({ one }) => ({
  user: one(users, {
    fields: [push_subscriptions.user_id],
    references: [users.id],
  }),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Personal Messages (foundation for future direct-message feature)
// ─────────────────────────────────────────────────────────────────────────────

export const conversations = pgTable(
  'conversations',
  {
    id: varchar('id', { length: 36 })
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
);

export const conversation_participants = pgTable(
  'conversation_participants',
  {
    id: varchar('id', { length: 36 })
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    conversation_id: varchar('conversation_id', { length: 36 })
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    user_id: varchar('user_id', { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    joined_at: timestamp('joined_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    last_read_at: timestamp('last_read_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('conv_participants_unique_idx').on(t.conversation_id, t.user_id),
    index('conv_participants_user_idx').on(t.user_id),
  ],
);

export const personal_messages = pgTable(
  'personal_messages',
  {
    id: varchar('id', { length: 36 })
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    conversation_id: varchar('conversation_id', { length: 36 })
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    sender_id: varchar('sender_id', { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    client_message_id: varchar('client_message_id', { length: 36 }),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('personal_messages_conv_idx').on(t.conversation_id),
    index('personal_messages_conv_created_idx').on(t.conversation_id, t.created_at),
  ],
);

export const follows = pgTable(
  'follows',
  {
    id: varchar('id', { length: 36 })
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    follower_id: varchar('follower_id', { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    following_id: varchar('following_id', { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('follows_follower_following_idx').on(t.follower_id, t.following_id),
    index('follows_following_idx').on(t.following_id),
  ],
);

export const activities = pgTable(
  'activities',
  {
    id: varchar('id', { length: 36 })
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    actor_id: varchar('actor_id', { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    verb: activityVerbEnum('verb').notNull(),
    match_id: varchar('match_id', { length: 36 })
      .references(() => matches.id, { onDelete: 'cascade' }),
    subject_id: varchar('subject_id', { length: 36 }),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('activities_created_idx').on(t.created_at)],
);

export const feed_items = pgTable(
  'feed_items',
  {
    id: varchar('id', { length: 36 })
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    recipient_id: varchar('recipient_id', { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    activity_id: varchar('activity_id', { length: 36 })
      .notNull()
      .references(() => activities.id, { onDelete: 'cascade' }),
    is_read: boolean('is_read').notNull().default(false),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('feed_items_recipient_created_idx').on(t.recipient_id, t.created_at)],
);

// ─────────────────────────────────────────────────────────────────────────────
// Admin / operations tables
// ─────────────────────────────────────────────────────────────────────────────

export const disputes = pgTable(
  'disputes',
  {
    id: varchar('id', { length: 36 })
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    match_id: varchar('match_id', { length: 36 }).references(() => matches.id, {
      onDelete: 'set null',
    }),
    reporter_id: varchar('reporter_id', { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    respondent_id: varchar('respondent_id', { length: 36 }).references(
      () => users.id,
      { onDelete: 'set null' },
    ),
    type: disputeTypeEnum('type').notNull(),
    status: disputeStatusEnum('status').notNull().default('opened'),
    evidence: json('evidence').notNull().default(sql`'[]'::json`),
    decision: text('decision'),
    decided_by: varchar('decided_by', { length: 36 }).references(() => users.id, {
      onDelete: 'set null',
    }),
    internal_note: text('internal_note'),
    policy_ref: text('policy_ref'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (t) => [
    index('disputes_status_idx').on(t.status),
    index('disputes_match_idx').on(t.match_id),
  ],
);

export const dispute_messages = pgTable(
  'dispute_messages',
  {
    id: varchar('id', { length: 36 })
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    dispute_id: varchar('dispute_id', { length: 36 })
      .notNull()
      .references(() => disputes.id, { onDelete: 'cascade' }),
    author_id: varchar('author_id', { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('dispute_messages_dispute_idx').on(t.dispute_id)],
);

export const venue_verifications = pgTable(
  'venue_verifications',
  {
    id: varchar('id', { length: 36 })
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    venue_id: varchar('venue_id', { length: 36 })
      .notNull()
      .references(() => venues.id, { onDelete: 'cascade' }),
    legal_entity_name: varchar('legal_entity_name', { length: 255 }).notNull(),
    commercial_reg: varchar('commercial_reg', { length: 50 }),
    tax_id: varchar('tax_id', { length: 50 }),
    iban: varchar('iban', { length: 34 }),
    manager_name: varchar('manager_name', { length: 255 }),
    manager_phone: varchar('manager_phone', { length: 20 }),
    status: verificationStatusEnum('status').notNull().default('pending'),
    submitted_at: timestamp('submitted_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    reviewed_by: varchar('reviewed_by', { length: 36 }).references(() => users.id, {
      onDelete: 'set null',
    }),
    reviewed_at: timestamp('reviewed_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('venue_verifications_venue_idx').on(t.venue_id)],
);

export const settlements = pgTable(
  'settlements',
  {
    id: varchar('id', { length: 36 })
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    venue_id: varchar('venue_id', { length: 36 })
      .notNull()
      .references(() => venues.id, { onDelete: 'cascade' }),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    period_start: date('period_start').notNull(),
    period_end: date('period_end').notNull(),
    status: settlementStatusEnum('status').notNull().default('pending'),
    payout_ref: varchar('payout_ref', { length: 255 }),
    paid_at: timestamp('paid_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('settlements_venue_idx').on(t.venue_id)],
);

export const audit_logs = pgTable(
  'audit_logs',
  {
    id: varchar('id', { length: 36 })
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    admin_id: varchar('admin_id', { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    action: varchar('action', { length: 100 }).notNull(),
    entity_type: varchar('entity_type', { length: 100 }).notNull(),
    entity_id: varchar('entity_id', { length: 36 }),
    before: json('before'),
    after: json('after'),
    ip: varchar('ip', { length: 45 }),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('audit_logs_admin_idx').on(t.admin_id),
    index('audit_logs_entity_idx').on(t.entity_type, t.entity_id),
    index('audit_logs_created_idx').on(t.created_at),
  ],
);

export const reports = pgTable(
  'reports',
  {
    id: varchar('id', { length: 36 })
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    reporter_id: varchar('reporter_id', { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    subject_type: varchar('subject_type', { length: 50 }).notNull(),
    subject_id: varchar('subject_id', { length: 36 }).notNull(),
    reason: text('reason').notNull(),
    status: reportStatusEnum('status').notNull().default('open'),
    resolution: text('resolution'),
    resolved_by: varchar('resolved_by', { length: 36 }).references(() => users.id, {
      onDelete: 'set null',
    }),
    resolved_at: timestamp('resolved_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (t) => [
    index('reports_status_idx').on(t.status),
    index('reports_subject_type_idx').on(t.subject_type),
  ],
);

export const app_settings = pgTable('app_settings', {
  key: varchar('key', { length: 100 }).primaryKey(),
  value: json('value').notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdateFn(() => new Date()),
});

// ── Personal Messages Relations ─────────────────────────────────────────────

export const conversationsRelations = relations(conversations, ({ many }) => ({
  participants: many(conversation_participants),
  messages: many(personal_messages),
}));

export const conversationParticipantsRelations = relations(conversation_participants, ({ one }) => ({
  conversation: one(conversations, {
    fields: [conversation_participants.conversation_id],
    references: [conversations.id],
  }),
  user: one(users, {
    fields: [conversation_participants.user_id],
    references: [users.id],
  }),
}));

export const personalMessagesRelations = relations(personal_messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [personal_messages.conversation_id],
    references: [conversations.id],
  }),
  sender: one(users, {
    fields: [personal_messages.sender_id],
    references: [users.id],
  }),
}));

export const followsRelations = relations(follows, ({ one }) => ({
  follower: one(users, {
    fields: [follows.follower_id],
    references: [users.id],
    relationName: 'Followers',
  }),
  following: one(users, {
    fields: [follows.following_id],
    references: [users.id],
    relationName: 'Following',
  }),
}));

export const activitiesRelations = relations(activities, ({ one }) => ({
  actor: one(users, {
    fields: [activities.actor_id],
    references: [users.id],
    relationName: 'ActivityActor',
  }),
  match: one(matches, {
    fields: [activities.match_id],
    references: [matches.id],
  }),
}));

export const feedItemsRelations = relations(feed_items, ({ one }) => ({
  recipient: one(users, {
    fields: [feed_items.recipient_id],
    references: [users.id],
    relationName: 'FeedRecipient',
  }),
  activity: one(activities, {
    fields: [feed_items.activity_id],
    references: [activities.id],
  }),
}));

// ── Admin / operations relations ────────────────────────────────────────────

export const disputesRelations = relations(disputes, ({ one, many }) => ({
  match: one(matches, {
    fields: [disputes.match_id],
    references: [matches.id],
  }),
  reporter: one(users, {
    fields: [disputes.reporter_id],
    references: [users.id],
    relationName: 'DisputeReporter',
  }),
  respondent: one(users, {
    fields: [disputes.respondent_id],
    references: [users.id],
    relationName: 'DisputeRespondent',
  }),
  decidedBy: one(users, {
    fields: [disputes.decided_by],
    references: [users.id],
    relationName: 'DisputeDecider',
  }),
  messages: many(dispute_messages),
}));

export const disputeMessagesRelations = relations(dispute_messages, ({ one }) => ({
  dispute: one(disputes, {
    fields: [dispute_messages.dispute_id],
    references: [disputes.id],
  }),
  author: one(users, {
    fields: [dispute_messages.author_id],
    references: [users.id],
    relationName: 'DisputeMessageAuthor',
  }),
}));

export const venueVerificationsRelations = relations(venue_verifications, ({ one }) => ({
  venue: one(venues, {
    fields: [venue_verifications.venue_id],
    references: [venues.id],
  }),
  reviewer: one(users, {
    fields: [venue_verifications.reviewed_by],
    references: [users.id],
    relationName: 'VerificationReviewer',
  }),
}));

export const settlementsRelations = relations(settlements, ({ one }) => ({
  venue: one(venues, {
    fields: [settlements.venue_id],
    references: [venues.id],
  }),
}));

export const auditLogsRelations = relations(audit_logs, ({ one }) => ({
  admin: one(users, {
    fields: [audit_logs.admin_id],
    references: [users.id],
    relationName: 'AuditAdmin',
  }),
}));

export const reportsRelations = relations(reports, ({ one }) => ({
  reporter: one(users, {
    fields: [reports.reporter_id],
    references: [users.id],
    relationName: 'ReportReporter',
  }),
  resolvedBy: one(users, {
    fields: [reports.resolved_by],
    references: [users.id],
    relationName: 'ReportResolvedBy',
  }),
}));
