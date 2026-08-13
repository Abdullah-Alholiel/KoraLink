/**
 * KoraLink database seed script.
 *
 * Usage (from apps/api):
 *   npx tsx --env-file=.env drizzle/seed.ts
 *
 * Inserts a realistic development dataset:
 *   8 users, 3 venues, 5 pitches, 8 matches (incl. today + completed),
 *   pitch slots, match votes (POM), reviews, sample transactions, chat messages.
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
  console.log('🌱 Seeding KoraLink database...\n');

  // ── Clear existing data (order respects FK constraints) ───────────────
  await db.delete(schema.match_messages);
  await db.delete(schema.match_votes);
  await db.delete(schema.transactions);
  await db.delete(schema.match_players);
  await db.delete(schema.matches);
  await db.delete(schema.pitch_slots);
  await db.delete(schema.pitches);
  await db.delete(schema.venues);
  await db.delete(schema.users);
  console.log('✔ Cleared existing data');

  // ── 1. Users (8) ───────────────────────────────────────────────────────
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
        wallet_balance: '150.00',
        karma_score: 3,
        rating: 3.8,
      },
    ])
    .returning({ id: schema.users.id, handle: schema.users.handle });

  console.log(`✔ Inserted ${userRows.length} users`);
  const users = Object.fromEntries(userRows.map((u) => [u.handle, u.id]));

  // ── 2. Venues (3) ──────────────────────────────────────────────────────
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
    ])
    .returning({ id: schema.venues.id, name: schema.venues.name });

  console.log(`✔ Inserted ${venueRows.length} venues`);
  const venues = Object.fromEntries(venueRows.map((v) => [v.name, v.id]));

  // ── 3. Pitches (5) ─────────────────────────────────────────────────────
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
    ])
    .returning({ id: schema.pitches.id, name: schema.pitches.name });

  console.log(`✔ Inserted ${pitchRows.length} pitches`);
  const pitches = Object.fromEntries(pitchRows.map((p) => [p.name, p.id]));

  // ── 3b. Pitch Slots (for partner venue — KSU Stadium) ──────────────────
  const slotNow = new Date();
  const slotDates: string[] = [];
  for (let d = 0; d < 7; d++) {
    const date = new Date(slotNow.getTime() + d * 24 * 60 * 60 * 1000);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    slotDates.push(`${yyyy}-${mm}-${dd}`);
  }

  const slotHours = [18, 19, 20, 21];

  const partnerPitchIds = [
    pitches['Pitch A – Main Field']!,
    pitches['Pitch B – Training Ground']!,
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

  // ── 4. Matches (8) with dynamic dates ──────────────────────────────
  const now = new Date();
  const days = (n: number) =>
    new Date(now.getTime() + n * 24 * 60 * 60 * 1000);
  const fmtDate = (d: Date, time: string) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return new Date(`${yyyy}-${mm}-${dd}T${time}:00+03:00`);
  };

  const matchRows = await db
    .insert(schema.matches)
    .values([
      // ── Today's matches (so Play screen has data immediately) ──
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
        max_players: 22,
        location: point(46.6227, 24.7231),
      },
      {
        host_id: users.yousef_q!,
        pitch_id: pitches['Pitch B – Training Ground']!,
        title: 'Today 7v7 Kickabout',
        match_type: 'Casual',
        gender_rule: 'Mixed',
        status: 'Open',
        scheduled_at: fmtDate(days(0), '18:00'),
        duration_mins: 60,
        price_per_player: '25.00',
        max_players: 14,
        location: point(46.6227, 24.7231),
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
        location: point(46.6753, 24.696),
      },
      // ── This week ──
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
        max_players: 14,
        location: point(46.6753, 24.696),
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
        location: point(46.6227, 24.7231),
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
        location: point(46.6227, 24.7231),
      },
      // ── Completed matches (for POM voting + reviews demo) ──
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
        max_players: 22,
        location: point(46.6227, 24.7231),
        completed_at: new Date(days(-3).getTime() + 90 * 60 * 1000),
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
        max_players: 10,
        location: point(46.6753, 24.696),
        completed_at: new Date(days(-2).getTime() + 50 * 60 * 1000),
      },
    ])
    .returning({ id: schema.matches.id, title: schema.matches.title });

  console.log(`✔ Inserted ${matchRows.length} matches`);
  const matchMap = Object.fromEntries(matchRows.map((m) => [m.title, m.id]));

  // ── 5. Match Players ────────────────────────────────────────────────
  const allHandles = ['ahmed_r', 'khalid_o', 'faisal_h', 'omar_s', 'yousef_q', 'sultan_d', 'mansour_g', 'nawaf_s'];
  const allPlayerIds = allHandles.map((h) => users[h]!);

  const matchPlayersData: Array<{
    match_id: string;
    user_id: string;
    team: 'Home' | 'Away';
    is_host: boolean;
  }> = [];

  for (let i = 0; i < matchRows.length; i++) {
    const match = matchRows[i];
    const hostHandle = allHandles[i % allHandles.length];
    const hostId = users[hostHandle]!;

    // Host joins as Home
    matchPlayersData.push({
      match_id: match.id,
      user_id: hostId,
      team: 'Home',
      is_host: true,
    });

    // Add 3-6 extra players per match
    const extraCount = 3 + (i % 4);
    for (let j = 0; j < extraCount; j++) {
      const playerId = allPlayerIds[(i * 2 + j + 1) % allPlayerIds.length]!;
      const alreadyJoined = matchPlayersData.some(
        (mp) => mp.match_id === match.id && mp.user_id === playerId,
      );
      if (!alreadyJoined) {
        matchPlayersData.push({
          match_id: match.id,
          user_id: playerId,
          team: j % 2 === 0 ? 'Home' : 'Away',
          is_host: false,
        });
      }
    }
  }

  await db.insert(schema.match_players).values(matchPlayersData);
  console.log(`✔ Inserted ${matchPlayersData.length} match players`);

  // ── 6. POM Votes (for the two completed matches) ────────────────────
  const completedMatch1 = matchMap['Last Week 11v11 Classic'];
  const completedMatch2 = matchMap['Last Week Indoor 5v5'];

  const voteData: Array<{
    match_id: string;
    voter_id: string;
    candidate_id: string;
  }> = [];

  // Match 1: Ahmed hosted, players vote Yousef as POM (3 votes), Khalid gets 1
  if (completedMatch1) {
    const m1Players = matchPlayersData.filter((mp) => mp.match_id === completedMatch1);
    const voters1 = m1Players.filter((mp) => !mp.is_host).slice(0, 4);
    for (let i = 0; i < voters1.length; i++) {
      const candidateId = i < 3 ? users.yousef_q! : users.khalid_o!;
      if (voters1[i].user_id !== candidateId) {
        voteData.push({
          match_id: completedMatch1,
          voter_id: voters1[i].user_id,
          candidate_id: candidateId,
        });
      }
    }
  }

  // Match 2: Yousef hosted, players vote Sultan as POM (2 votes)
  if (completedMatch2) {
    const m2Players = matchPlayersData.filter((mp) => mp.match_id === completedMatch2);
    const voters2 = m2Players.filter((mp) => !mp.is_host).slice(0, 3);
    for (let i = 0; i < voters2.length; i++) {
      if (voters2[i].user_id !== users.sultan_d!) {
        voteData.push({
          match_id: completedMatch2,
          voter_id: voters2[i].user_id,
          candidate_id: users.sultan_d!,
        });
      }
    }
  }

  if (voteData.length > 0) {
    await db.insert(schema.match_votes).values(voteData);
  }
  console.log(`✔ Inserted ${voteData.length} POM votes`);

  // ── 8. Transactions ─────────────────────────────────────────────────
  await db.insert(schema.transactions).values([
    {
      user_id: users.ahmed_r!,
      type: 'CREDIT' as const,
      amount: '500.00',
      reference_type: 'TOPUP' as const,
      idempotency_key: 'seed-topup-ahmed-001',
      status: 'Completed' as const,
    },
    {
      user_id: users.ahmed_r!,
      type: 'DEBIT' as const,
      amount: '45.00',
      reference_type: 'MATCH_FEE' as const,
      reference_id: matchMap['Last Week 11v11 Classic'],
      idempotency_key: 'seed-matchfee-ahmed-001',
      status: 'Completed' as const,
    },
    {
      user_id: users.khalid_o!,
      type: 'DEBIT' as const,
      amount: '45.00',
      reference_type: 'MATCH_FEE' as const,
      reference_id: matchMap['Friday Night 11v11'],
      idempotency_key: 'seed-matchfee-khalid-001',
      status: 'Completed' as const,
    },
    {
      user_id: users.yousef_q!,
      type: 'CREDIT' as const,
      amount: '750.00',
      reference_type: 'TOPUP' as const,
      idempotency_key: 'seed-topup-yousef-001',
      status: 'Completed' as const,
    },
    {
      user_id: users.yousef_q!,
      type: 'CREDIT' as const,
      amount: '25.00',
      reference_type: 'REFUND' as const,
      reference_id: matchMap['Indoor 5v5 Tournament'],
      idempotency_key: 'seed-refund-yousef-001',
      status: 'Completed' as const,
    },
    {
      user_id: users.omar_s!,
      type: 'DEBIT' as const,
      amount: '35.00',
      reference_type: 'MATCH_FEE' as const,
      reference_id: matchMap['Sunset 7v7 Rooftop'],
      idempotency_key: 'seed-matchfee-omar-001',
      status: 'Completed' as const,
    },
    {
      user_id: users.sultan_d!,
      type: 'CREDIT' as const,
      amount: '400.00',
      reference_type: 'TOPUP' as const,
      idempotency_key: 'seed-topup-sultan-001',
      status: 'Completed' as const,
    },
  ]);
  console.log(`✔ Inserted 7 sample transactions`);

  // ── 9. Chat Messages ────────────────────────────────────────────────
  await db.insert(schema.match_messages).values([
    {
      match_id: matchMap['Friday Night 11v11']!,
      user_id: users.ahmed_r!,
      content: 'Who\'s ready for tonight? 🔥⚽',
    },
    {
      match_id: matchMap['Friday Night 11v11']!,
      user_id: users.khalid_o!,
      content: 'Count me in! Bringing my A-game 💪',
    },
    {
      match_id: matchMap['Friday Night 11v11']!,
      user_id: users.omar_s!,
      content: 'I\'ll be there 15 mins early to warm up',
    },
    {
      match_id: matchMap['Today 7v7 Kickabout']!,
      user_id: users.yousef_q!,
      content: 'Casual vibes only — no slide tackles please 😄',
    },
    {
      match_id: matchMap['Today 7v7 Kickabout']!,
      user_id: users.nawaf_s!,
      content: 'First time using KoraLink! Excited to play',
    },
    {
      match_id: matchMap['Indoor 5v5 Tournament']!,
      user_id: users.khalid_o!,
      content: 'Indoor AC is a blessing in this heat 🥶',
    },
    {
      match_id: matchMap['Weekend Warriors 11v11']!,
      user_id: users.sultan_d!,
      content: 'Looking for a goalkeeper! Anyone interested?',
    },
    {
      match_id: matchMap['Mixed 7v7 Friday']!,
      user_id: users.mansour_g!,
      content: 'All skill levels welcome 🤝',
    },
  ]);
  console.log(`✔ Inserted 8 chat messages`);

  console.log('\n✅ Seed complete!\n');
  console.log(`  Users: ${userRows.length}`);
  console.log(`  Venues: ${venueRows.length}`);
  console.log(`  Pitches: ${pitchRows.length}`);
  console.log(`  Pitch Slots: ${slotValues.length}`);
  console.log(`  Matches: ${matchRows.length} (incl. 2 completed with POM votes)`);
  console.log(`  Match Players: ${matchPlayersData.length}`);
  console.log(`  POM Votes: ${voteData.length}`);
  console.log(`  Transactions: 7`);
  console.log(`  Chat Messages: 8`);
}

seed()
  .catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  })
  .finally(() => {
    pool.end();
  });
