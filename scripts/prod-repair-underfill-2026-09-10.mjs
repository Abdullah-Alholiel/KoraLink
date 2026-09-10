// Prod data repair — 2026-09-10 KSU incident (T2, Abdullah-gated).
//
// Three matches were auto-COMPLETED by the morning wake-up despite being far
// below min_players (the Render FREE spin-down ate the auto-cancel window):
//   57377940-41e0-4bc7-922d-0a9c2d8ed4a4  7v7 KSU        1/12 (min 12)
//   c679a778-83e5-4248-95c2-e148472cc45c  Women Wed 5v5  5/12 (min 12)
//   7f225626-a15f-4219-acaf-2b80894793c5  Ladies Sun 6v6 7/12 (min 12)
//
// Verified pre-conditions (read-only probes, 2026-09-10): zero ledger
// entries, fee_paid_sar NULL on every roster row, booking_mode='self',
// is_player_hosted=false → status-only repair, NO money movement.
//
// Repair (idempotent — the status guard makes re-runs no-ops):
//   1. Completed → Cancelled, completed_at → NULL (mirrors auto-cancel state).
//   2. Backfill bell activity verb='match_auto_cancelled' (actor = host) +
//      feed_items for every roster member, so players see the cancellation.
//
// Usage:  node prod-repair-kasu.mjs          → dry run (SELECTs only)
//         node prod-repair-kasu.mjs --apply  → apply inside one transaction
import fs from 'node:fs';
import pg from 'postgres';

const APPLY = process.argv.includes('--apply');
const IDS = [
  '57377940-41e0-4bc7-922d-0a9c2d8ed4a4',
  'c679a778-83e5-4248-95c2-e148472cc45c',
  '7f225626-a15f-4219-acaf-2b80894793c5',
];

const url = fs.readFileSync('/tmp/.neon-url', 'utf8').trim();
const sql = pg(url, { max: 1, ssl: 'prefer', connect_timeout: 15 });

console.log(`MODE: ${APPLY ? 'APPLY' : 'DRY RUN'}`);

// ── Pre-flight: confirm targets are still Completed below minimum ──
const targets = await sql`
  SELECT m.id, m.title, m.status, m.min_players, m.host_id,
         (SELECT COUNT(*)::int FROM match_players mp WHERE mp.match_id = m.id) AS players,
         (SELECT COUNT(*)::int FROM activities a WHERE a.match_id = m.id AND a.verb = 'match_auto_cancelled') AS cancel_activities
  FROM matches m
  WHERE m.id = ANY(${IDS})`;
console.log('== targets ==');
console.log(JSON.stringify(targets, null, 2));

const bad = targets.filter(
  (t) => t.status !== 'Completed' || t.players >= t.min_players,
);
if (bad.length > 0) {
  console.error('ABORT: some rows are no longer (Completed ∧ below-minimum):', bad.map((b) => b.id));
  await sql.end();
  process.exit(1);
}

const money = await sql`
  SELECT COUNT(*)::int AS n FROM transactions WHERE reference_id = ANY(${IDS})`;
if (money[0].n > 0) {
  console.error(`ABORT: ${money[0].n} ledger rows reference these matches — manual review required`);
  await sql.end();
  process.exit(1);
}

if (!APPLY) {
  console.log('DRY RUN OK — all guards pass. Re-run with --apply to execute.');
  await sql.end();
  process.exit(0);
}

// ── Apply: one transaction, guarded per-row, idempotent ──
await sql.begin(async (tx) => {
  for (const id of IDS) {
    const upd = await tx`
      UPDATE matches
      SET status = 'Cancelled', completed_at = NULL, updated_at = NOW()
      WHERE id = ${id} AND status = 'Completed'`;
    if (upd.count === 0) {
      console.log(`skip ${id} (already repaired or raced)`);
      continue;
    }
    const [m] = await tx`
      SELECT host_id, title FROM matches WHERE id = ${id}`;
    const roster = await tx`
      SELECT user_id FROM match_players WHERE match_id = ${id}`;
    const [act] = await tx`
      INSERT INTO activities (actor_id, verb, match_id)
      VALUES (${m.host_id}, 'match_auto_cancelled', ${id})
      RETURNING id`;
    if (roster.length > 0) {
      await tx`
        INSERT INTO feed_items (recipient_id, activity_id)
        SELECT user_id, ${act.id} FROM match_players WHERE match_id = ${id}`;
    }
    console.log(
      `repaired ${id} "${m.title}" → Cancelled (activity ${act.id}, ${roster.length} feed row(s))`,
    );
  }
});

// ── Verify ──
const after = await sql`
  SELECT id, title, status, completed_at,
         (SELECT COUNT(*)::int FROM activities a WHERE a.match_id = m.id AND a.verb = 'match_auto_cancelled') AS cancel_activities
  FROM matches m WHERE m.id = ANY(${IDS})`;
console.log('== post-state ==');
console.log(JSON.stringify(after, null, 2));

await sql.end();
