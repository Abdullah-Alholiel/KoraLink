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
]);

export const transactionStatusEnum = pgEnum('TransactionStatus', [
  'Pending',
  'Completed',
  'Failed',
  'Reversed',
]);

export const teamEnum = pgEnum('Team', ['Home', 'Away']);

export const bookingModeEnum = pgEnum('BookingMode', ['koralink', 'self']);

// ─────────────────────────────────────────────────────────────────────────────
// TypeScript string-literal types (replaces @prisma/client enum imports)
// ─────────────────────────────────────────────────────────────────────────────

export type TransactionType = 'CREDIT' | 'DEBIT';
export type ReferenceType = 'MATCH_FEE' | 'TOPUP' | 'REFUND' | 'PRIZE' | 'PITCH_BOOKING';

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

export const matches = pgTable(
  'matches',
  {
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
    max_players: integer('max_players').notNull(),
    location: geography('location'),
    completed_at: timestamp('completed_at', { withTimezone: true }),
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

export const match_reviews = pgTable(
  'match_reviews',
  {
    id: varchar('id', { length: 36 })
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    match_id: varchar('match_id', { length: 36 })
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    reviewer_id: varchar('reviewer_id', { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    reviewee_id: varchar('reviewee_id', { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    rating: integer('rating').notNull(), // 1–5 stars
    comment: text('comment'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('match_reviews_unique_idx').on(t.match_id, t.reviewer_id, t.reviewee_id),
    index('match_reviews_match_idx').on(t.match_id),
    index('match_reviews_reviewee_idx').on(t.reviewee_id),
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

export const matchReviewsRelations = relations(match_reviews, ({ one }) => ({
  match: one(matches, {
    fields: [match_reviews.match_id],
    references: [matches.id],
  }),
  reviewer: one(users, {
    fields: [match_reviews.reviewer_id],
    references: [users.id],
    relationName: 'GivenReviews',
  }),
  reviewee: one(users, {
    fields: [match_reviews.reviewee_id],
    references: [users.id],
    relationName: 'ReceivedReviews',
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
