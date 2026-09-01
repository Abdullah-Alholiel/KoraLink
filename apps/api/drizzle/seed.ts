/**
 * KoraLink database seed script — DEMO EDITION.
 *
 * Usage (from apps/api):
 *   npx tsx --env-file=.env drizzle/seed.ts
 *
 * Wipes and rebuilds a rich, demo-ready dataset (dates are ALWAYS relative to
 * "now", so the feed never looks stale):
 *   26 users (18 men's squad + 7 women + 1 admin), 4 venues, 6 pitches,
 *   pitch slots, 13 matches (today → +5 days, incl. Women-Only, a FULL match,
 *   a LIVE match, 2 POTM-announced + 1 voting-open completed, 1 cancelled),
 *   fuller lineups (132 roster rows), POM votes, 18 transactions,
 *   ~28 chat messages (AR + EN), follows, activities, disputes, reports,
 *   settlements.
 *
 * Anchor titles kept for runbook probes: 'Friday Night 11v11',
 * 'Sunset 7v7 Rooftop' (the FULL match), 'Last Week 11v11 Classic' &
 * 'Last Week Indoor 5v5' (POTM-announced completed matches).
 */

import * as pg from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import * as schema from '../src/database/schema';

const postgres = (pg as any).default ?? pg;

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
  console.log('🌱 Seeding KoraLink database (demo edition)...\n');

  // ── Clear existing data (order respects FK constraints) ───────────────
  await db.delete(schema.match_messages);
  await db.delete(schema.match_votes);
  await db.delete(schema.transactions);
  await db.delete(schema.settlements);
  await db.delete(schema.match_players);
  await db.delete(schema.disputes);
  await db.delete(schema.reports);
  await db.delete(schema.activities);
  await db.delete(schema.follows);
  await db.delete(schema.matches);
  await db.delete(schema.pitch_slots);
  await db.delete(schema.pitches);
  await db.delete(schema.venues);
  await db.delete(schema.users);
  console.log('✔ Cleared existing data');

  // ── 1. Users (26) ──────────────────────────────────────────────────────
  // Phones +0000..+0014 keep their canonical roles/semantics (runbooks,
  // dev-login docs). +0015..+0025 are demo squad fillers (8 men, 6 women).
  const userRows = await db
    .insert(schema.users)
    .values([
      {
        phone: '+966500000001',
        full_name: 'Ahmed Al-Rashid',
        handle: 'ahmed_r',
        preferred_position: 'Forward',
        skill_level: 'Advanced',
        role: 'Player',
        preferred_location: 'Riyadh',
        wallet_balance: '700.00',
        karma_score: 10,
        rating: 4.5,
      },
      {
        phone: '+966500000002',
        full_name: 'Khalid Al-Otaibi',
        handle: 'khalid_o',
        preferred_position: 'Midfielder',
        skill_level: 'Intermediate',
        role: 'Player',
        preferred_location: 'Riyadh',
        wallet_balance: '350.00',
        karma_score: 8,
        rating: 4.0,
      },
      {
        phone: '+966500000003',
        full_name: 'Faisal Al-Harbi',
        handle: 'faisal_h',
        preferred_position: 'Defender',
        skill_level: 'Intermediate',
        role: 'VenueOwner',
        preferred_location: 'Riyadh',
        wallet_balance: '1000.00',
        karma_score: 15,
        rating: 4.8,
      },
      {
        phone: '+966500000004',
        full_name: 'Omar Al-Shahrani',
        handle: 'omar_s',
        preferred_position: 'Goalkeeper',
        skill_level: 'Beginner',
        role: 'Player',
        preferred_location: 'Riyadh',
        wallet_balance: '200.00',
        karma_score: 5,
        rating: 3.5,
      },
      {
        phone: '+966500000005',
        full_name: 'Yousef Al-Qahtani',
        handle: 'yousef_q',
        preferred_position: 'Midfielder',
        skill_level: 'Advanced',
        role: 'Player',
        preferred_location: 'Riyadh',
        wallet_balance: '850.00',
        karma_score: 20,
        rating: 4.9,
      },
      {
        phone: '+966500000006',
        full_name: 'Sultan Al-Dossari',
        handle: 'sultan_d',
        preferred_position: 'Defender',
        skill_level: 'Advanced',
        role: 'Player',
        preferred_location: 'Riyadh',
        wallet_balance: '400.00',
        karma_score: 12,
        rating: 4.3,
      },
      {
        phone: '+966500000007',
        full_name: 'Mansour Al-Ghamdi',
        handle: 'mansour_g',
        preferred_position: 'Forward',
        skill_level: 'Intermediate',
        role: 'Player',
        preferred_location: 'Riyadh',
        wallet_balance: '300.00',
        karma_score: 7,
        rating: 4.1,
      },
      {
        phone: '+966500000008',
        full_name: 'Nawaf Al-Subaie',
        handle: 'nawaf_s',
        preferred_position: 'Midfielder',
        skill_level: 'Beginner',
        role: 'Player',
        preferred_location: 'Riyadh',
        wallet_balance: '150.00',
        karma_score: 3,
        rating: 3.8,
      },
      {
        phone: '+966500000009',
        full_name: 'Bandar Al-Mutairi',
        handle: 'bandar_m',
        preferred_position: 'Forward',
        skill_level: 'Intermediate',
        role: 'Player',
        preferred_location: 'Riyadh',
        wallet_balance: '250.00',
        karma_score: 6,
        rating: 4.0,
      },
      {
        phone: '+966500000010',
        full_name: 'Turki Al-Shehri',
        handle: 'turki_s',
        preferred_position: 'Midfielder',
        skill_level: 'Advanced',
        role: 'Player',
        preferred_location: 'Riyadh',
        wallet_balance: '500.00',
        karma_score: 11,
        rating: 4.4,
      },
      {
        phone: '+966500000011',
        full_name: 'Saleh Al-Qarni',
        handle: 'saleh_q',
        preferred_position: 'Defender',
        skill_level: 'Intermediate',
        role: 'Player',
        preferred_location: 'Riyadh',
        wallet_balance: '180.00',
        karma_score: 4,
        rating: 3.9,
      },
      {
        phone: '+966500000012',
        full_name: 'Majed Al-Amri',
        handle: 'majed_a',
        preferred_position: 'Goalkeeper',
        skill_level: 'Advanced',
        role: 'Player',
        preferred_location: 'Riyadh',
        wallet_balance: '320.00',
        karma_score: 9,
        rating: 4.2,
      },
      {
        phone: '+966500000013',
        full_name: 'Hassan Al-Zahrani',
        handle: 'hassan_z',
        preferred_position: 'Defender',
        skill_level: 'Beginner',
        role: 'Player',
        preferred_location: 'Riyadh',
        wallet_balance: '140.00',
        karma_score: 2,
        rating: 3.7,
      },
      {
        phone: '+966500000014',
        full_name: 'Waleed Al-Oufi',
        handle: 'waleed_o',
        preferred_position: 'Forward',
        skill_level: 'Intermediate',
        role: 'Player',
        preferred_location: 'Riyadh',
        wallet_balance: '260.00',
        karma_score: 7,
        rating: 4.1,
      },
      // ── Men's squad fillers (+0015..+0018) ──
      {
        phone: '+966500000015',
        full_name: 'Salman Al-Tuwaijri',
        handle: 'salman_t',
        preferred_position: 'Midfielder',
        skill_level: 'Advanced',
        role: 'Player',
        preferred_location: 'Riyadh',
        wallet_balance: '420.00',
        karma_score: 9,
        rating: 4.3,
      },
      {
        phone: '+966500000016',
        full_name: 'Ziyad Al-Khalidi',
        handle: 'ziyad_k',
        preferred_position: 'Defender',
        skill_level: 'Intermediate',
        role: 'Player',
        preferred_location: 'Riyadh',
        wallet_balance: '210.00',
        karma_score: 5,
        rating: 3.9,
      },
      {
        phone: '+966500000017',
        full_name: 'Rakan Al-Faris',
        handle: 'rakan_f',
        preferred_position: 'Forward',
        skill_level: 'Beginner',
        role: 'Player',
        preferred_location: 'Riyadh',
        wallet_balance: '120.00',
        karma_score: 2,
        rating: 3.6,
      },
      {
        phone: '+966500000018',
        full_name: 'Abdulmohsen Al-Balawi',
        handle: 'abm_b',
        preferred_position: 'Goalkeeper',
        skill_level: 'Intermediate',
        role: 'Player',
        preferred_location: 'Riyadh',
        wallet_balance: '280.00',
        karma_score: 6,
        rating: 4.0,
      },
      // ── Women's squad (+0019..+0025) ──
      {
        phone: '+966500000019',
        full_name: 'Noura Al-Asiri',
        handle: 'noura_a',
        preferred_position: 'Forward',
        skill_level: 'Intermediate',
        role: 'Player',
        preferred_location: 'Riyadh',
        wallet_balance: '310.00',
        karma_score: 8,
        rating: 4.4,
      },
      {
        phone: '+966500000020',
        full_name: 'Sara Al-Mutlaq',
        handle: 'sara_m',
        preferred_position: 'Midfielder',
        skill_level: 'Advanced',
        role: 'Player',
        preferred_location: 'Riyadh',
        wallet_balance: '380.00',
        karma_score: 11,
        rating: 4.6,
      },
      {
        phone: '+966500000021',
        full_name: 'Reem Al-Qurashi',
        handle: 'reem_q',
        preferred_position: 'Defender',
        skill_level: 'Intermediate',
        role: 'Player',
        preferred_location: 'Riyadh',
        wallet_balance: '190.00',
        karma_score: 5,
        rating: 4.0,
      },
      {
        phone: '+966500000022',
        full_name: 'Lina Al-Hoshan',
        handle: 'lina_h',
        preferred_position: 'Forward',
        skill_level: 'Beginner',
        role: 'Player',
        preferred_location: 'Riyadh',
        wallet_balance: '110.00',
        karma_score: 3,
        rating: 3.8,
      },
      {
        phone: '+966500000023',
        full_name: 'Dana Al-Shammari',
        handle: 'dana_s',
        preferred_position: 'Goalkeeper',
        skill_level: 'Beginner',
        role: 'Player',
        preferred_location: 'Riyadh',
        wallet_balance: '140.00',
        karma_score: 2,
        rating: 3.7,
      },
      {
        phone: '+966500000024',
        full_name: 'Hessa Al-Balawi',
        handle: 'hessa_b',
        preferred_position: 'Midfielder',
        skill_level: 'Intermediate',
        role: 'Player',
        preferred_location: 'Riyadh',
        wallet_balance: '230.00',
        karma_score: 6,
        rating: 4.1,
      },
      {
        phone: '+966500000025',
        full_name: 'Amal Al-Zahrani',
        handle: 'amal_z',
        preferred_position: 'Forward',
        skill_level: 'Advanced',
        role: 'Player',
        preferred_location: 'Riyadh',
        wallet_balance: '340.00',
        karma_score: 9,
        rating: 4.5,
      },
      {
        phone: '+966500000000',
        full_name: 'KoraLink Admin',
        handle: 'koralink_admin',
        preferred_position: 'Admin',
        skill_level: 'Advanced',
        role: 'Admin',
        wallet_balance: '0.00',
        karma_score: 0,
        rating: 5.0,
      },
    ])
    .returning({ id: schema.users.id, handle: schema.users.handle });

  console.log(`✔ Inserted ${userRows.length} users`);
  const users = Object.fromEntries(userRows.map((u) => [u.handle, u.id])) as Record<string, string>;

  const menHandles = [
    'ahmed_r', 'khalid_o', 'faisal_h', 'omar_s', 'yousef_q', 'sultan_d',
    'mansour_g', 'nawaf_s', 'bandar_m', 'turki_s', 'saleh_q', 'majed_a',
    'hassan_z', 'waleed_o', 'salman_t', 'ziyad_k', 'rakan_f', 'abm_b',
  ];
  const womenHandles = [
    'noura_a', 'sara_m', 'reem_q', 'lina_h', 'dana_s', 'hessa_b', 'amal_z',
  ];
  const menIds = menHandles.map((h) => users[h]!);
  const womenIds = womenHandles.map((h) => users[h]!);

  // ── 2. Venues (4) ──────────────────────────────────────────────────────
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
        is_koralink_partner: true,
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
      {
        owner_id: users.faisal_h!,
        name: 'Al-Nakheel Sports Complex',
        city: 'Jeddah',
        address: 'Al-Nakheel District, King Abdulaziz Rd, Jeddah 23441',
        amenities: ['parking', 'changing_rooms', 'floodlights', 'cafe', 'gym'],
        rating: 4.8,
        is_approved: true,
        location: point(39.1925, 21.4858),
      },
      {
        owner_id: users.faisal_h!,
        name: 'Malqa Ladies Arena',
        city: 'Riyadh',
        address: 'Al-Malqa District, Anas Bin Malik Rd, Riyadh 13521',
        amenities: ['parking', 'changing_rooms', 'floodlights', 'cafe', 'prayer_room'],
        rating: 4.7,
        is_approved: true,
        is_koralink_partner: true,
        location: point(46.6298, 24.8228),
      },
    ])
    .returning({ id: schema.venues.id, name: schema.venues.name });

  console.log(`✔ Inserted ${venueRows.length} venues`);
  const venues = Object.fromEntries(venueRows.map((v) => [v.name, v.id]));

  // ── 3. Pitches (6) ─────────────────────────────────────────────────────
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
      {
        venue_id: venues['Olaya Sports Park']!,
        name: 'Pitch D – Rooftop 7v7',
        size: '7v7',
        surface_type: 'Artificial',
        environment: 'Outdoor',
        hourly_rate: '250.00',
      },
      {
        venue_id: venues['Al-Nakheel Sports Complex']!,
        name: 'Pitch E – Championship Field',
        size: '11v11',
        surface_type: 'Grass',
        environment: 'Outdoor',
        hourly_rate: '400.00',
      },
      {
        venue_id: venues['Malqa Ladies Arena']!,
        name: 'Pitch F – Ladies Court',
        size: '7v7',
        surface_type: 'Artificial',
        environment: 'Indoor',
        hourly_rate: '180.00',
      },
    ])
    .returning({ id: schema.pitches.id, name: schema.pitches.name });

  console.log(`✔ Inserted ${pitchRows.length} pitches`);
  const pitches = Object.fromEntries(pitchRows.map((p) => [p.name, p.id]));

  // ── 3b. Pitch Slots (partner venues: KSU Stadium + Malqa Ladies Arena) ─
  const slotNow = new Date();
  const slotDates: string[] = [];
  for (let d = 0; d < 10; d++) {
    const date = new Date(slotNow.getTime() + d * 24 * 60 * 60 * 1000);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    slotDates.push(`${yyyy}-${mm}-${dd}`);
  }

  const slotHours = [16, 17, 18, 19, 20, 21, 22, 23];

  const partnerPitchIds = [
    pitches['Pitch A – Main Field']!,
    pitches['Pitch B – Training Ground']!,
    pitches['Pitch F – Ladies Court']!,
  ];

  const slotValues: Array<{
    pitch_id: string;
    slot_date: string;
    start_time: string;
    end_time: string;
    is_booked: boolean;
  }> = [];

  for (const pitchId of partnerPitchIds) {
    for (const dateStr of slotDates) {
      for (const hour of slotHours) {
        const startTime = `${String(hour).padStart(2, '0')}:00:00`;
        const endTime = `${String(hour + 1).padStart(2, '0')}:00:00`;
        slotValues.push({
          pitch_id: pitchId,
          slot_date: dateStr,
          start_time: startTime,
          end_time: endTime,
          is_booked: false,
        });
      }
    }
  }

  await db.insert(schema.pitch_slots).values(slotValues);
  console.log(`✔ Inserted ${slotValues.length} pitch slots`);

  // ── 4. Matches (14) with dynamic dates ─────────────────────────────────
  const now = new Date();
  const days = (n: number) =>
    new Date(now.getTime() + n * 24 * 60 * 60 * 1000);
  const fmtDate = (d: Date, time: string) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return new Date(`${yyyy}-${mm}-${dd}T${time}:00+03:00`);
  };

  const ksuLoc = point(46.6227, 24.7231);
  const olayaLoc = point(46.6753, 24.696);
  const malqaLoc = point(46.6298, 24.8228);

  // 'Voting Live' match: finished ~2h15m ago → POTM window deterministically
  // OPEN (24h window), with a few votes already cast.
  const votingLiveSched = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const votingLiveCompleted = new Date(now.getTime() - 2.25 * 60 * 60 * 1000);
  // 'Live now' match: kicked off ~20 minutes ago.
  const liveNowSched = new Date(now.getTime() - 20 * 60 * 1000);

  const matchRows = await db
    .insert(schema.matches)
    .values([
      // ── Today's matches (Play screen has data immediately) ──
      {
        host_id: users.ahmed_r!,
        pitch_id: pitches['Pitch A – Main Field']!,
        title: 'Friday Night 11v11',
        match_type: 'Competitive',
        gender_rule: 'Men Only',
        status: 'Open',
        scheduled_at: fmtDate(days(0), '20:00'),
        duration_mins: 90,
        price_per_player: '45.00',
        pitch_cost_sar: '525.00',
        max_players: 22,
        min_players: 12,
        location: ksuLoc,
      },
      {
        host_id: users.noura_a!,
        pitch_id: pitches['Pitch F – Ladies Court']!,
        title: 'Ladies Night 7v7',
        match_type: 'Casual',
        gender_rule: 'Women Only',
        status: 'Open',
        scheduled_at: fmtDate(days(0), '19:00'),
        duration_mins: 60,
        price_per_player: '30.00',
        max_players: 14,
        min_players: 6,
        location: malqaLoc,
      },
      {
        host_id: users.yousef_q!,
        pitch_id: pitches['Pitch D – Rooftop 7v7']!,
        title: 'Rooftop 7v7 — LIVE NOW',
        match_type: 'Casual',
        gender_rule: 'Mixed',
        status: 'InProgress',
        scheduled_at: liveNowSched,
        duration_mins: 60,
        price_per_player: '30.00',
        max_players: 14,
        min_players: 6,
        location: olayaLoc,
      },
      // ── Tomorrow ──
      {
        host_id: users.khalid_o!,
        pitch_id: pitches['Pitch C – Indoor Court']!,
        title: 'Indoor 5v5 Tournament',
        match_type: 'Competitive',
        gender_rule: 'Mixed',
        status: 'Open',
        scheduled_at: fmtDate(days(1), '21:00'),
        duration_mins: 50,
        price_per_player: '30.00',
        max_players: 10,
        min_players: 4,
        location: olayaLoc,
      },
      {
        host_id: users.nawaf_s!,
        pitch_id: pitches['Pitch B – Training Ground']!,
        title: 'Rained-Out 8v8',
        match_type: 'Casual',
        gender_rule: 'Mixed',
        status: 'Cancelled',
        scheduled_at: fmtDate(days(1), '18:00'),
        duration_mins: 60,
        price_per_player: '28.00',
        max_players: 16,
        location: ksuLoc,
      },
      // ── Later this week ──
      {
        host_id: users.omar_s!,
        pitch_id: pitches['Pitch D – Rooftop 7v7']!,
        title: 'Sunset 7v7 Rooftop',
        match_type: 'Casual',
        gender_rule: 'Men Only',
        status: 'Full',
        scheduled_at: fmtDate(days(3), '17:30'),
        duration_mins: 60,
        price_per_player: '35.00',
        pitch_cost_sar: '250.00',
        max_players: 14,
        min_players: 6,
        location: olayaLoc,
      },
      {
        host_id: users.reem_q!,
        pitch_id: pitches['Pitch F – Ladies Court']!,
        title: 'Women Wednesday 5v5',
        match_type: 'Casual',
        gender_rule: 'Women Only',
        status: 'Open',
        scheduled_at: fmtDate(days(2), '20:30'),
        duration_mins: 50,
        price_per_player: '25.00',
        max_players: 10,
        min_players: 4,
        location: malqaLoc,
      },
      {
        host_id: users.sara_m!,
        pitch_id: pitches['Pitch F – Ladies Court']!,
        title: 'Ladies Sunrise 6v6',
        match_type: 'Casual',
        gender_rule: 'Women Only',
        status: 'Open',
        scheduled_at: fmtDate(days(2), '09:00'),
        duration_mins: 60,
        price_per_player: '20.00',
        max_players: 12,
        min_players: 4,
        location: malqaLoc,
      },
      {
        host_id: users.sultan_d!,
        pitch_id: pitches['Pitch A – Main Field']!,
        title: 'Weekend Warriors 11v11',
        match_type: 'Competitive',
        gender_rule: 'Men Only',
        status: 'Open',
        scheduled_at: fmtDate(days(5), '19:00'),
        duration_mins: 90,
        price_per_player: '40.00',
        max_players: 22,
        min_players: 12,
        location: ksuLoc,
      },
      {
        host_id: users.mansour_g!,
        pitch_id: pitches['Pitch B – Training Ground']!,
        title: 'Mixed 7v7 Friday',
        match_type: 'Casual',
        gender_rule: 'Mixed',
        status: 'Open',
        scheduled_at: fmtDate(days(4), '20:00'),
        duration_mins: 60,
        price_per_player: '20.00',
        max_players: 14,
        min_players: 6,
        location: ksuLoc,
      },
      // ── Completed matches (POTM history + live voting window) ──
      {
        host_id: users.ahmed_r!,
        pitch_id: pitches['Pitch A – Main Field']!,
        title: 'Last Week 11v11 Classic',
        match_type: 'Competitive',
        gender_rule: 'Men Only',
        status: 'Completed',
        scheduled_at: fmtDate(days(-3), '20:00'),
        duration_mins: 90,
        price_per_player: '45.00',
        pitch_cost_sar: '525.00',
        max_players: 22,
        min_players: 12,
        location: ksuLoc,
        completed_at: new Date(fmtDate(days(-3), '20:00').getTime() + 90 * 60 * 1000),
        pom_winner_id: users.yousef_q!,
        pom_announced_at: days(-2),
      },
      {
        host_id: users.yousef_q!,
        pitch_id: pitches['Pitch C – Indoor Court']!,
        title: 'Last Week Indoor 5v5',
        match_type: 'Casual',
        gender_rule: 'Mixed',
        status: 'Completed',
        scheduled_at: fmtDate(days(-2), '19:00'),
        duration_mins: 50,
        price_per_player: '30.00',
        pitch_cost_sar: '125.00',
        max_players: 10,
        min_players: 4,
        location: olayaLoc,
        completed_at: new Date(fmtDate(days(-2), '19:00').getTime() + 50 * 60 * 1000),
        pom_winner_id: users.majed_a!,
        pom_announced_at: days(-1),
      },
      {
        host_id: users.turki_s!,
        pitch_id: pitches['Pitch D – Rooftop 7v7']!,
        title: 'Voting Live: Rooftop 7v7',
        match_type: 'Casual',
        gender_rule: 'Men Only',
        status: 'Completed',
        scheduled_at: votingLiveSched,
        duration_mins: 60,
        price_per_player: '35.00',
        max_players: 14,
        min_players: 6,
        location: olayaLoc,
        completed_at: votingLiveCompleted,
      },
    ])
    .returning({
      id: schema.matches.id,
      title: schema.matches.title,
      host_id: schema.matches.host_id,
    });

  console.log(`✔ Inserted ${matchRows.length} matches`);
  const matchMap = Object.fromEntries(matchRows.map((m) => [m.title, m.id]));

  // ── 5. Match Players (fuller lineups) ──────────────────────────────────
  type RosterRow = {
    match_id: string;
    user_id: string;
    team: 'Home' | 'Away';
    is_host: boolean;
    no_show?: boolean;
  };
  const matchPlayersData: RosterRow[] = [];
  const rosterSeen = new Set<string>(); // `${matchId}:${userId}` dedupe guard

  function addPlayer(
    matchId: string,
    userId: string,
    team: 'Home' | 'Away',
    isHost = false,
    noShow = false,
  ) {
    const key = `${matchId}:${userId}`;
    if (rosterSeen.has(key)) return;
    rosterSeen.add(key);
    matchPlayersData.push({ match_id: matchId, user_id: userId, team, is_host: isHost, no_show: noShow });
  }

  /**
   * Fills a match roster to `target` players: host first (Home), then rotated
   * picks from the pool, alternating Home/Away. The roster's is_host player is
   * ALWAYS the match's real host (matches.host_id) — TeamLineup crown, host
   * auth and findOne().host all agree.
   */
  function fillRoster(
    matchTitle: string,
    hostHandle: string,
    poolHandles: string[],
    target: number,
  ) {
    const matchId = matchMap[matchTitle]!;
    const hostId = users[hostHandle]!;
    addPlayer(matchId, hostId, 'Home', true);
    const pool = poolHandles.map((h) => users[h]!).filter((id) => id !== hostId);
    let i = 0;
    for (const pid of pool) {
      if (matchPlayersData.filter((mp) => mp.match_id === matchId).length >= target) break;
      addPlayer(matchId, pid, i % 2 === 0 ? 'Away' : 'Home');
      i++;
    }
  }

  const men = menHandles;
  const women = womenHandles;
  const mixed = [...menHandles, ...womenHandles];

  // Today — derby nearly full, ladies night well attended, live match buzzing
  fillRoster('Friday Night 11v11', 'ahmed_r', men, 17);           // 17/22
  fillRoster('Ladies Night 7v7', 'noura_a', women, 7);            // 7/14 (women pool = 7)
  fillRoster('Rooftop 7v7 — LIVE NOW', 'yousef_q', mixed, 12);    // 12/14 live
  // Tomorrow
  fillRoster('Indoor 5v5 Tournament', 'khalid_o', mixed, 6);      // 6/10
  fillRoster('Rained-Out 8v8', 'nawaf_s', mixed, 5);              // 5/16 cancelled
  // This week
  fillRoster('Sunset 7v7 Rooftop', 'omar_s', men, 14);            // 14/14 FULL
  fillRoster('Women Wednesday 5v5', 'reem_q', women, 5);          // 5/10
  fillRoster('Ladies Sunrise 6v6', 'sara_m', women, 7);           // 7/12
  fillRoster('Weekend Warriors 11v11', 'sultan_d', men, 12);      // 12/22
  fillRoster('Mixed 7v7 Friday', 'mansour_g', mixed, 8);          // 8/14
  // Completed
  fillRoster('Last Week 11v11 Classic', 'ahmed_r', men, 14);      // 14/22
  fillRoster('Last Week Indoor 5v5', 'yousef_q', mixed, 8);       // 8/10
  fillRoster('Voting Live: Rooftop 7v7', 'turki_s', men, 10);     // 10/14

  // Membership guarantees: every POTM candidate, fee payer, refund recipient
  // and chat author below must be on the referenced match's roster.
  addPlayer(matchMap['Voting Live: Rooftop 7v7']!, users['waleed_o']!, 'Away');
  addPlayer(matchMap['Last Week Indoor 5v5']!, users['majed_a']!, 'Home');
  addPlayer(matchMap['Last Week Indoor 5v5']!, users['sara_m']!, 'Away');
  addPlayer(matchMap['Rained-Out 8v8']!, users['rakan_f']!, 'Away');
  addPlayer(matchMap['Rooftop 7v7 — LIVE NOW']!, users['dana_s']!, 'Away');
  addPlayer(matchMap['Indoor 5v5 Tournament']!, users['noura_a']!, 'Away');
  addPlayer(matchMap['Mixed 7v7 Friday']!, users['lina_h']!, 'Away');

  // Bandar is the no-show the open dispute references (attendance evidence).
  {
    const classicId = matchMap['Last Week 11v11 Classic']!;
    const row = matchPlayersData.find(
      (mp) => mp.match_id === classicId && mp.user_id === users['bandar_m'],
    );
    if (row) row.no_show = true;
  }

  await db.insert(schema.match_players).values(matchPlayersData);
  console.log(`✔ Inserted ${matchPlayersData.length} match players`);

  // ── 6. POM Votes ────────────────────────────────────────────────────────
  // POTM invariant: a candidate MUST be on the match roster and never vote for
  // themselves. 'Voting Live: Rooftop 7v7' has votes cast but NO winner yet —
  // its completed_at is ~2h old so the 24h window is open.
  const voteData: Array<{
    match_id: string;
    voter_id: string;
    candidate_id: string;
  }> = [];

  function castVotes(matchTitle: string, tally: Array<[string, number]>) {
    const matchId = matchMap[matchTitle]!;
    const roster = matchPlayersData.filter((mp) => mp.match_id === matchId);
    const voterPool = roster.filter((mp) => !mp.is_host).map((mp) => mp.user_id);
    let vi = 0;
    for (const [candidateHandle, count] of tally) {
      const candidateId = users[candidateHandle]!;
      for (let k = 0; k < count && vi < voterPool.length; k++) {
        const voterId = voterPool[vi++];
        if (voterId !== candidateId) {
          voteData.push({ match_id: matchId, voter_id: voterId, candidate_id: candidateId });
        }
      }
    }
  }

  // Announced matches — historical votes that produced the winners.
  castVotes('Last Week 11v11 Classic', [['yousef_q', 5], ['sultan_d', 3]]);
  castVotes('Last Week Indoor 5v5', [['majed_a', 3], ['omar_s', 1]]);
  // Voting-open match — 3 votes in, Waleed leading, window still open.
  castVotes('Voting Live: Rooftop 7v7', [['waleed_o', 3]]);

  if (voteData.length > 0) {
    await db.insert(schema.match_votes).values(voteData);
  }
  console.log(`✔ Inserted ${voteData.length} POM votes`);

  // ── 7. Follows (social graph) ───────────────────────────────────────────
  const followPairs: Array<[string, string]> = [
    ['ahmed_r', 'yousef_q'], ['yousef_q', 'ahmed_r'], ['khalid_o', 'yousef_q'],
    ['sultan_d', 'ahmed_r'], ['omar_s', 'yousef_q'], ['majed_a', 'yousef_q'],
    ['bandar_m', 'turki_s'], ['noura_a', 'sara_m'], ['sara_m', 'noura_a'],
    ['reem_q', 'sara_m'], ['lina_h', 'amal_z'], ['amal_z', 'sara_m'],
  ];
  await db.insert(schema.follows).values(
    followPairs.map(([follower, following]) => ({
      follower_id: users[follower]!,
      following_id: users[following]!,
    })),
  );
  console.log(`✔ Inserted ${followPairs.length} follows`);

  // ── 8. Activities (home feed) ───────────────────────────────────────────
  const activityRows: Array<{
    actor_id: string;
    verb: 'created_match' | 'joined_match' | 'followed' | 'pom_decided' | 'wallet_refunded';
    match_id?: string;
    subject_id?: string;
    created_at: Date;
  }> = [];

  // created_match for every match, timestamped at creation.
  for (const m of matchRows) {
    activityRows.push({
      actor_id: m.host_id,
      verb: 'created_match',
      match_id: m.id,
      created_at: days(-1),
    });
  }
  // A sample of joins.
  const joinSamples: Array<[string, string]> = [
    ['Friday Night 11v11', 'khalid_o'], ['Friday Night 11v11', 'salman_t'],
    ['Ladies Night 7v7', 'sara_m'], ['Indoor 5v5 Tournament', 'noura_a'],
    ['Sunset 7v7 Rooftop', 'sultan_d'], ['Weekend Warriors 11v11', 'turki_s'],
    ['Mixed 7v7 Friday', 'lina_h'], ['Voting Live: Rooftop 7v7', 'waleed_o'],
  ];
  for (const [title, handle] of joinSamples) {
    activityRows.push({
      actor_id: users[handle]!,
      verb: 'joined_match',
      match_id: matchMap[title]!,
      created_at: days(-1),
    });
  }
  // Follows surfaced as activity.
  for (const [follower, following] of followPairs.slice(0, 5)) {
    activityRows.push({
      actor_id: users[follower]!,
      verb: 'followed',
      subject_id: users[following]!,
      created_at: days(-1),
    });
  }
  // POTM decisions (announced matches only).
  activityRows.push({
    actor_id: users['koralink_admin']!,
    verb: 'pom_decided',
    match_id: matchMap['Last Week 11v11 Classic']!,
    subject_id: users['yousef_q']!,
    created_at: days(-2),
  });
  activityRows.push({
    actor_id: users['koralink_admin']!,
    verb: 'pom_decided',
    match_id: matchMap['Last Week Indoor 5v5']!,
    subject_id: users['majed_a']!,
    created_at: days(-1),
  });
  // Cancelled match refund surfaced.
  activityRows.push({
    actor_id: users['koralink_admin']!,
    verb: 'wallet_refunded',
    match_id: matchMap['Rained-Out 8v8']!,
    subject_id: users['nawaf_s']!,
    created_at: days(-1),
  });

  // Spread timestamps across the past week (chronological variety).
  activityRows.forEach((a, i) => {
    a.created_at = days(-7 + (i % 7));
  });

  await db.insert(schema.activities).values(activityRows);
  console.log(`✔ Inserted ${activityRows.length} activities`);

  // ── 9. Transactions ─────────────────────────────────────────────────────
  await db.insert(schema.transactions).values([
    // Top-ups
    { user_id: users.ahmed_r!, type: 'CREDIT' as const, amount: '500.00', reference_type: 'TOPUP' as const, idempotency_key: 'seed-topup-ahmed-001', status: 'Completed' as const, created_at: days(-6) },
    { user_id: users.yousef_q!, type: 'CREDIT' as const, amount: '750.00', reference_type: 'TOPUP' as const, idempotency_key: 'seed-topup-yousef-001', status: 'Completed' as const, created_at: days(-6) },
    { user_id: users.sultan_d!, type: 'CREDIT' as const, amount: '400.00', reference_type: 'TOPUP' as const, idempotency_key: 'seed-topup-sultan-001', status: 'Completed' as const, created_at: days(-5) },
    { user_id: users.khalid_o!, type: 'CREDIT' as const, amount: '300.00', reference_type: 'TOPUP' as const, idempotency_key: 'seed-topup-khalid-001', status: 'Completed' as const, created_at: days(-4) },
    { user_id: users.turki_s!, type: 'CREDIT' as const, amount: '1000.00', reference_type: 'TOPUP' as const, idempotency_key: 'seed-topup-turki-001', status: 'Completed' as const, created_at: days(-3) },
    { user_id: users.noura_a!, type: 'CREDIT' as const, amount: '250.00', reference_type: 'TOPUP' as const, idempotency_key: 'seed-topup-noura-001', status: 'Completed' as const, created_at: days(-2) },
    // Match fees — Last Week 11v11 Classic
    { user_id: users.khalid_o!, type: 'DEBIT' as const, amount: '45.00', reference_type: 'MATCH_FEE' as const, reference_id: matchMap['Last Week 11v11 Classic'], idempotency_key: 'seed-matchfee-khalid-m11', status: 'Completed' as const, created_at: days(-3) },
    { user_id: users.omar_s!, type: 'DEBIT' as const, amount: '45.00', reference_type: 'MATCH_FEE' as const, reference_id: matchMap['Last Week 11v11 Classic'], idempotency_key: 'seed-matchfee-omar-m11', status: 'Completed' as const, created_at: days(-3) },
    { user_id: users.mansour_g!, type: 'DEBIT' as const, amount: '45.00', reference_type: 'MATCH_FEE' as const, reference_id: matchMap['Last Week 11v11 Classic'], idempotency_key: 'seed-matchfee-mansour-m11', status: 'Completed' as const, created_at: days(-3) },
    // Match fees — Last Week Indoor 5v5
    { user_id: users.majed_a!, type: 'DEBIT' as const, amount: '30.00', reference_type: 'MATCH_FEE' as const, reference_id: matchMap['Last Week Indoor 5v5'], idempotency_key: 'seed-matchfee-majed-m12', status: 'Completed' as const, created_at: days(-2) },
    { user_id: users.sara_m!, type: 'DEBIT' as const, amount: '30.00', reference_type: 'MATCH_FEE' as const, reference_id: matchMap['Last Week Indoor 5v5'], idempotency_key: 'seed-matchfee-sara-m12', status: 'Completed' as const, created_at: days(-2) },
    // Match fees — Voting Live + tonight's derby
    { user_id: users.turki_s!, type: 'DEBIT' as const, amount: '35.00', reference_type: 'MATCH_FEE' as const, reference_id: matchMap['Voting Live: Rooftop 7v7'], idempotency_key: 'seed-matchfee-turki-m13', status: 'Completed' as const, created_at: days(-1) },
    { user_id: users.waleed_o!, type: 'DEBIT' as const, amount: '35.00', reference_type: 'MATCH_FEE' as const, reference_id: matchMap['Voting Live: Rooftop 7v7'], idempotency_key: 'seed-matchfee-waleed-m13', status: 'Completed' as const, created_at: days(-1) },
    { user_id: users.bandar_m!, type: 'DEBIT' as const, amount: '45.00', reference_type: 'MATCH_FEE' as const, reference_id: matchMap['Friday Night 11v11'], idempotency_key: 'seed-matchfee-bandar-m1', status: 'Completed' as const, created_at: days(-1) },
    // POTM prize
    { user_id: users.yousef_q!, type: 'CREDIT' as const, amount: '50.00', reference_type: 'PRIZE' as const, reference_id: matchMap['Last Week 11v11 Classic'], idempotency_key: 'seed-prize-yousef-m11', status: 'Completed' as const, created_at: days(-2) },
    // Refunds — rained-out match
    { user_id: users.nawaf_s!, type: 'CREDIT' as const, amount: '28.00', reference_type: 'REFUND' as const, reference_id: matchMap['Rained-Out 8v8'], idempotency_key: 'seed-refund-nawaf-m5', status: 'Completed' as const, created_at: days(-1) },
    { user_id: users.rakan_f!, type: 'CREDIT' as const, amount: '28.00', reference_type: 'REFUND' as const, reference_id: matchMap['Rained-Out 8v8'], idempotency_key: 'seed-refund-rakan-m5', status: 'Completed' as const, created_at: days(-1) },
    // Historical refund (kept anchor from previous seed)
    { user_id: users.yousef_q!, type: 'CREDIT' as const, amount: '25.00', reference_type: 'REFUND' as const, reference_id: matchMap['Indoor 5v5 Tournament'], idempotency_key: 'seed-refund-yousef-001', status: 'Completed' as const, created_at: days(-2) },
  ]);
  console.log('✔ Inserted 18 transactions');

  // ── 10. Chat Messages (AR + EN) ─────────────────────────────────────────
  const messageRows: Array<{
    match_id: string;
    user_id: string;
    content: string;
    created_at: Date;
  }> = [];
  let msgOffset = 0;
  function addMessages(matchTitle: string, msgs: Array<[string, string]>) {
    const matchId = matchMap[matchTitle]!;
    for (const [handle, content] of msgs) {
      messageRows.push({
        match_id: matchId,
        user_id: users[handle]!,
        content,
        created_at: new Date(now.getTime() - (48 - msgOffset * 2) * 60 * 60 * 1000),
      });
      msgOffset++;
    }
  }

  addMessages('Friday Night 11v11', [
    ['ahmed_r', "Who's ready for tonight? 🔥⚽"],
    ['ahmed_r', 'مين جاهز الليلة؟ النصر محتاجينكم 💪'],
    ['khalid_o', 'Count me in! Bringing my A-game 💪'],
    ['omar_s', "I'll be there 15 mins early to warm up"],
    ['salman_t', 'أنا جاي مع عبدالمحسن، حجزوا لنا مكان بالسيارة'],
  ]);
  addMessages('Ladies Night 7v7', [
    ['noura_a', 'يا بنات، اللعبة الليلة الساعة ٧ 🌙⚽'],
    ['sara_m', 'Coming! First time at Malqa arena — excited ✨'],
    ['reem_q', 'بحضر بكرة أدرس وبجي مباشرة من الدوام 😅'],
    ['amal_z', 'احجزوا لي معكم بالفريق الأزرق'],
  ]);
  addMessages('Rooftop 7v7 — LIVE NOW', [
    ['yousef_q', 'We are live! Rooftop sunset is unreal 🌇'],
    ['omar_s', 'في أحرار جاهزين، افتحوا المباراة!'],
    ['turki_s', 'Score is 2-1 already 😳'],
    ['dana_s', 'جايين نشوف من الشرفية 👀'],
  ]);
  addMessages('Indoor 5v5 Tournament', [
    ['khalid_o', 'Indoor AC is a blessing in this heat 🥶'],
    ['noura_a', 'First time using KoraLink! Excited to play ⚽'],
  ]);
  addMessages('Weekend Warriors 11v11', [
    ['sultan_d', 'Looking for a goalkeeper! Anyone interested? 🧤'],
    ['majed_a', 'سأدخل حراسة إذا ما عندكم أحد'],
  ]);
  addMessages('Mixed 7v7 Friday', [
    ['mansour_g', 'All skill levels welcome 🤝'],
    ['lina_h', 'Is parking free at KSU?'],
  ]);
  addMessages('Last Week 11v11 Classic', [
    ['yousef_q', 'MOTM with a brace — unbeatable night 🏆'],
  ]);
  addMessages('Voting Live: Rooftop 7v7', [
    ['turki_s', "Great game everyone! Don't forget to vote for MOTM 🗳️"],
    ['waleed_o', 'ما نسيت، صوّتوا لي 😂'],
  ]);

  await db.insert(schema.match_messages).values(messageRows);
  console.log(`✔ Inserted ${messageRows.length} chat messages`);

  // ── 11. Disputes (admin console demo) ───────────────────────────────────
  await db.insert(schema.disputes).values([
    {
      match_id: matchMap['Last Week 11v11 Classic']!,
      reporter_id: users.turki_s!,
      respondent_id: users.bandar_m!,
      type: 'no_show',
      status: 'opened',
      evidence: [
        { description: 'أكد الحضور مرتين بالدردشة ولم يحضر', source: 'chat', capturedAt: days(-3).toISOString() },
        { description: 'Player confirmed twice in match chat but never showed', source: 'chat', capturedAt: days(-3).toISOString() },
        { description: 'Marked no_show in roster after 20 min grace period', source: 'system', capturedAt: days(-3).toISOString() },
      ],
      created_at: days(-1),
      updated_at: days(-1),
    },
    {
      match_id: matchMap['Last Week Indoor 5v5']!,
      reporter_id: users.majed_a!,
      respondent_id: users.faisal_h!,
      type: 'pitch_condition',
      status: 'under_review',
      evidence: [
        { description: 'Pitch B lighting flickered both halves', source: 'photo', capturedAt: days(-2).toISOString() },
      ],
      internal_note: 'Waiting for maintenance report from venue owner',
      policy_ref: 'KL-DISPUTE-002',
      created_at: days(-1),
      updated_at: days(-1),
    },
    {
      match_id: null,
      reporter_id: users.nawaf_s!,
      respondent_id: null,
      type: 'unrecognized_charge',
      status: 'resolved',
      evidence: [
        { description: 'Two MATCH_FEE entries for one booking', source: 'ledger', capturedAt: days(-5).toISOString() },
      ],
      decision: 'Refunded after ledger review — duplicate MATCH_FEE entry reversed.',
      decided_by: users['koralink_admin']!,
      created_at: days(-5),
      updated_at: days(-4),
    },
  ]);
  console.log('✔ Inserted 3 disputes');

  // ── 12. Reports (admin console demo) ────────────────────────────────────
  await db.insert(schema.reports).values([
    {
      reporter_id: users.sara_m!,
      subject_type: 'user',
      subject_id: users['bandar_m']!,
      reason: 'Inappropriate messages in match chat after the game.',
      status: 'open',
      created_at: days(-1),
      updated_at: days(-1),
    },
    {
      reporter_id: users.khalid_o!,
      subject_type: 'venue',
      subject_id: venues['Malqa Ladies Arena']!,
      reason: 'Pitch flooded near the goal line last Thursday — slipped twice.',
      status: 'reviewing',
      created_at: days(-2),
      updated_at: days(-1),
    },
    {
      reporter_id: users.omar_s!,
      subject_type: 'user',
      subject_id: users['nawaf_s']!,
      reason: 'Suspected fake account — joined 3 matches and never messaged.',
      status: 'dismissed',
      resolution: 'Verified via OTP — legitimate user, active in upcoming matches.',
      resolved_by: users['koralink_admin']!,
      resolved_at: days(-2),
      created_at: days(-3),
      updated_at: days(-2),
    },
  ]);
  console.log('✔ Inserted 3 reports');

  // ── 13. Settlements (partner payouts — admin console demo) ──────────────
  await db.insert(schema.settlements).values([
    {
      venue_id: venues['KSU Stadium']!,
      amount: '12400.00',
      period_start: days(-35).toISOString().slice(0, 10),
      period_end: days(-5).toISOString().slice(0, 10),
      status: 'paid',
      payout_ref: 'STRIPE-PAYOUT-2026-08-KSU',
      paid_at: days(-4),
      created_at: days(-5),
    },
    {
      venue_id: venues['Malqa Ladies Arena']!,
      amount: '3150.00',
      period_start: days(-5).toISOString().slice(0, 10),
      period_end: days(2).toISOString().slice(0, 10),
      status: 'pending',
      created_at: days(-1),
    },
  ]);
  console.log('✔ Inserted 2 settlements');

  console.log('\n✅ Seed complete!\n');
  console.log(`  Users: ${userRows.length} (18 men, 7 women incl. owner+admin)`);
  console.log(`  Venues: ${venueRows.length} (KSU, Olaya, Al-Nakheel, Malqa Ladies)`);
  console.log(`  Pitches: ${pitchRows.length}`);
  console.log(`  Pitch Slots: ${slotValues.length}`);
  console.log(`  Matches: ${matchRows.length} (6 Open incl. 3 Women-Only, 1 Full, 1 LIVE, 3 Completed, 1 Cancelled)`);
  console.log(`  Match Players: ${matchPlayersData.length}`);
  console.log(`  POM Votes: ${voteData.length} (1 match in live voting window)`);
  console.log(`  Follows: ${followPairs.length}`);
  console.log(`  Activities: ${activityRows.length}`);
  console.log(`  Transactions: 18`);
  console.log(`  Chat Messages: ${messageRows.length} (AR + EN)`);
  console.log(`  Disputes: 3 | Reports: 3 | Settlements: 2`);
}

seed()
  .catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  })
  .finally(() => {
    pool.end();
  });
