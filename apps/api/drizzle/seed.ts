/**
 * KoraLink database seed script.
 *
 * Usage (from apps/api):
 *   DATABASE_URL=postgresql://... npx tsx drizzle/seed.ts
 *
 * Inserts foundational data: 5 users, 2 venues (KSU Stadium, Olaya Sports
 * Park), 3 pitches, and 3 matches.
 */

import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import * as schema from '../src/database/schema';

// ── Helpers ─────────────────────────────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL ?? '';
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL is required');
  process.exit(1);
}

const pool = postgres(DATABASE_URL, { max: 1 });
const db = drizzle(pool, { schema });

/** Builds a PostGIS geography literal: ST_SetSRID(ST_MakePoint(lng, lat), 4326) */
function point(lng: number, lat: number) {
  return sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)`;
}

// ── Seed data ───────────────────────────────────────────────────────────────

async function seed() {
  console.log('🌱 Seeding KoraLink database...\n');

  // ── Clear existing data (order respects FK constraints) ───────────────
  await db.delete(schema.match_messages);
  await db.delete(schema.transactions);
  await db.delete(schema.match_players);
  await db.delete(schema.matches);
  await db.delete(schema.pitches);
  await db.delete(schema.venues);
  await db.delete(schema.users);
  console.log('✔ Cleared existing data');

  // ── 1. Users (5) ───────────────────────────────────────────────────────
  const userRows = await db
    .insert(schema.users)
    .values([
      {
        phone: '+966512340001',
        full_name: 'Ahmed Al-Rashid',
        handle: 'ahmed_r',
        preferred_position: 'Forward',
        skill_level: 'Advanced',
        role: 'Player',
        wallet_balance: '500.00',
        karma_score: 10,
        rating: 4.5,
      },
      {
        phone: '+966512340002',
        full_name: 'Khalid Al-Otaibi',
        handle: 'khalid_o',
        preferred_position: 'Midfielder',
        skill_level: 'Intermediate',
        role: 'Player',
        wallet_balance: '250.00',
        karma_score: 8,
        rating: 4.0,
      },
      {
        phone: '+966512340003',
        full_name: 'Faisal Al-Harbi',
        handle: 'faisal_h',
        preferred_position: 'Defender',
        skill_level: 'Intermediate',
        role: 'VenueOwner',
        wallet_balance: '1000.00',
        karma_score: 15,
        rating: 4.8,
      },
      {
        phone: '+966512340004',
        full_name: 'Omar Al-Shahrani',
        handle: 'omar_s',
        preferred_position: 'Goalkeeper',
        skill_level: 'Beginner',
        role: 'Player',
        wallet_balance: '100.00',
        karma_score: 5,
        rating: 3.5,
      },
      {
        phone: '+966512340005',
        full_name: 'Yousef Al-Qahtani',
        handle: 'yousef_q',
        preferred_position: 'Midfielder',
        skill_level: 'Advanced',
        role: 'Player',
        wallet_balance: '750.00',
        karma_score: 20,
        rating: 4.9,
      },
    ])
    .returning({ id: schema.users.id, handle: schema.users.handle });

  console.log(`✔ Inserted ${userRows.length} users`);
  const users = Object.fromEntries(userRows.map((u) => [u.handle, u.id]));
  //   ahmed_r, khalid_o, faisal_h, omar_s, yousef_q

  // ── 2. Venues (2) ──────────────────────────────────────────────────────
  // faisal_h is the venue owner (UserRole = VenueOwner)
  const venueRows = await db
    .insert(schema.venues)
    .values([
      {
        owner_id: users.faisal_h!,
        name: 'KSU Stadium',
        city: 'Riyadh',
        address: 'King Saud University Campus, King Abdullah Rd, Riyadh 11451',
        amenities: ['parking', 'changing_rooms', 'floodlights', 'cafe'],
        rating: 4.6,
        is_approved: true,
        location: point(46.6227, 24.7231),
      },
      {
        owner_id: users.faisal_h!,
        name: 'Olaya Sports Park',
        city: 'Riyadh',
        address: 'Olaya District, Prince Mohammed Bin Abdulaziz Rd, Riyadh 12241',
        amenities: ['parking', 'changing_rooms', 'water_cooler'],
        rating: 4.2,
        is_approved: true,
        location: point(46.6753, 24.696),
      },
    ])
    .returning({
      id: schema.venues.id,
      name: schema.venues.name,
    });

  console.log(`✔ Inserted ${venueRows.length} venues`);
  const venues = Object.fromEntries(venueRows.map((v) => [v.name, v.id]));
  //   KSU Stadium, Olaya Sports Park

  // ── 3. Pitches (3) ─────────────────────────────────────────────────────
  const pitchRows = await db
    .insert(schema.pitches)
    .values([
      {
        venue_id: venues['KSU Stadium']!,
        name: 'Pitch A – Main Field',
        size: '11v11',
        surface_type: 'Grass',
        environment: 'Outdoor',
        hourly_rate: '350.00',
      },
      {
        venue_id: venues['KSU Stadium']!,
        name: 'Pitch B – Training Ground',
        size: '7v7',
        surface_type: 'Artificial',
        environment: 'Outdoor',
        hourly_rate: '200.00',
      },
      {
        venue_id: venues['Olaya Sports Park']!,
        name: 'Pitch C – Indoor Court',
        size: '5v5',
        surface_type: 'Artificial',
        environment: 'Indoor',
        hourly_rate: '150.00',
      },
    ])
    .returning({ id: schema.pitches.id, name: schema.pitches.name });

  console.log(`✔ Inserted ${pitchRows.length} pitches`);
  const pitches = Object.fromEntries(pitchRows.map((p) => [p.name, p.id]));
  //   Pitch A – Main Field, Pitch B – Training Ground, Pitch C – Indoor Court

  // ── 4. Matches (3) ─────────────────────────────────────────────────────
  const matchRows = await db
    .insert(schema.matches)
    .values([
      {
        host_id: users.ahmed_r!,
        pitch_id: pitches['Pitch A – Main Field']!,
        title: 'Friday Night 11v11',
        match_type: 'Competitive',
        gender_rule: 'Men Only',
        status: 'Open',
        scheduled_at: new Date('2026-08-14T20:00:00+03:00'),
        duration_mins: 90,
        price_per_player: '45.00',
        max_players: 22,
        location: point(46.6227, 24.7231),
      },
      {
        host_id: users.yousef_q!,
        pitch_id: pitches['Pitch B – Training Ground']!,
        title: 'Casual 7v7 Kickabout',
        match_type: 'Casual',
        gender_rule: 'Mixed',
        status: 'Open',
        scheduled_at: new Date('2026-08-15T18:00:00+03:00'),
        duration_mins: 60,
        price_per_player: '25.00',
        max_players: 14,
        location: point(46.6227, 24.7231),
      },
      {
        host_id: users.khalid_o!,
        pitch_id: pitches['Pitch C – Indoor Court']!,
        title: 'Indoor 5v5 Tournament',
        match_type: 'Competitive',
        gender_rule: 'Mixed',
        status: 'Open',
        scheduled_at: new Date('2026-08-16T21:00:00+03:00'),
        duration_mins: 50,
        price_per_player: '30.00',
        max_players: 10,
        location: point(46.6753, 24.696),
      },
    ])
    .returning({ id: schema.matches.id, title: schema.matches.title });

  console.log(`✔ Inserted ${matchRows.length} matches`);

  console.log('\n✅ Seed complete!\n');
  console.log('  Users:', userRows.map((u) => u.handle).join(', '));
  console.log('  Venues:', venueRows.map((v) => v.name).join(', '));
  console.log('  Pitches:', pitchRows.map((p) => p.name).join(', '));
  console.log('  Matches:', matchRows.map((m) => m.title).join(', '));
}

seed()
  .catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  })
  .finally(() => {
    pool.end();
  });
