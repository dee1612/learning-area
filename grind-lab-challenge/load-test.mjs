/**
 * Grind Lab Challenge — Load Test
 * Seeds 25 fake users with random meal data, then reads leaderboard.
 *
 * Run:   node load-test.mjs
 * Wipe:  node load-test.mjs --wipe
 */
import { createClient } from '@supabase/supabase-js';

const SB_URL = 'https://bqqoczbminqhknwbhslh.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxcW9jemJtaW5xaGtud2Joc2xoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNDA4NTYsImV4cCI6MjA5MDgxNjg1Nn0.-NBZEI_NXx3IsHXCyrPB3lLvJtWq0mzUsxnADzyu6pA';
const sb = createClient(SB_URL, SB_KEY);

const NICKNAMES = [
  'IronMike','QueenD','ProteinKing','GrindQueen','BeastMode',
  'SweatShop','LiftLord','CardioKing','PalmPower','GainZone',
  'FuelUp','MuscleMax','CleanEater','RepsGod','NoBrakes',
  'PumpCity','LeanMean','GrindHard','ProMax','NutriBeast',
  'SwoleGoal','FlexFuel','CoreKing','PeakForm','IronWill',
  'StrongSoul','PrimalFit','RawPower','ApexGrind','BurnMode'
];

const NUM_USERS = 25;
const TEST_PREFIX = 'loadtest_';

function randomPoints() {
  let total = 0;
  for (let d = 0; d < 7; d++) {
    const yes = [Math.random() > 0.35, Math.random() > 0.35, Math.random() > 0.35].filter(Boolean).length;
    total += yes * 10;
  }
  return total;
}

async function seed() {
  console.log(`\n⚡ Seeding ${NUM_USERS} test users...\n`);
  const now = new Date().toISOString();

  const participants = [];
  const leaderboard = [];

  for (let i = 0; i < NUM_USERS; i++) {
    const email = `${TEST_PREFIX}user${String(i + 1).padStart(2, '0')}@grindlab.test`;
    const nickname = NICKNAMES[i] || `Grinder${i + 1}`;
    const points = randomPoints();
    const streak = Math.floor(Math.random() * 8);
    participants.push({ email, nickname, joined_at: now, last_active: now });
    leaderboard.push({ email, nickname, points, streak, updated_at: now });
  }

  // Upsert participants
  let t = Date.now();
  const { error: pErr } = await sb.from('glc_participants').upsert(participants, { onConflict: 'email' });
  if (pErr) { console.error('❌ Participants error:', pErr.message); process.exit(1); }
  console.log(`✅ ${NUM_USERS} participants upserted  (${Date.now() - t}ms)`);

  // Upsert leaderboard
  t = Date.now();
  const { error: lErr } = await sb.from('glc_leaderboard').upsert(leaderboard, { onConflict: 'email' });
  if (lErr) { console.error('❌ Leaderboard error:', lErr.message); process.exit(1); }
  console.log(`✅ ${NUM_USERS} leaderboard rows upserted  (${Date.now() - t}ms)`);

  // Simulate concurrent leaderboard reads (like 10 users opening the app at once)
  console.log('\n🔄 Simulating 10 concurrent leaderboard reads...');
  t = Date.now();
  const reads = await Promise.all(
    Array.from({ length: 10 }, () =>
      Promise.all([
        sb.from('glc_leaderboard').select('*').order('points', { ascending: false }),
        sb.from('glc_participants').select('email')
      ])
    )
  );
  const readMs = Date.now() - t;
  const errors = reads.flat(2).filter(r => r.error);
  if (errors.length) {
    console.error('❌ Read errors:', errors.map(e => e.error.message));
  } else {
    console.log(`✅ 10 concurrent reads completed  (${readMs}ms total, ~${Math.round(readMs / 10)}ms avg)`);
  }

  // Display leaderboard
  const [{ data: lbData }, { data: pData }] = reads[0];
  const activeEmails = new Set(pData.map(p => p.email));
  const filtered = lbData.filter(row => activeEmails.has(row.email)).sort((a, b) => b.points - a.points);

  console.log(`\n📊 Top 10 of ${filtered.length} users:\n`);
  console.log('Rank  Nickname           Points  Streak');
  console.log('----  -----------------  ------  ------');
  filtered.slice(0, 10).forEach((u, i) => {
    console.log(`#${String(i + 1).padEnd(3)}  ${u.nickname.padEnd(17)}  ${String(u.points).padStart(6)}  🔥${u.streak}`);
  });

  const avg = Math.round(filtered.reduce((s, u) => s + u.points, 0) / filtered.length);
  console.log(`\n📈 avg ${avg} pts | top ${filtered[0]?.points ?? 0} pts | ${filtered.length} users on board`);
  console.log('\n✅ All good! Run with --wipe to remove test users.\n');
}

async function wipe() {
  console.log('\n🗑  Removing test users...\n');
  const emails = Array.from({ length: NUM_USERS }, (_, i) =>
    `${TEST_PREFIX}user${String(i + 1).padStart(2, '0')}@grindlab.test`
  );
  const [r1, r2] = await Promise.all([
    sb.from('glc_participants').delete().in('email', emails),
    sb.from('glc_leaderboard').delete().in('email', emails),
  ]);
  if (r1.error) console.error('❌ Participants:', r1.error.message);
  else console.log('✅ Test participants removed');
  if (r2.error) console.error('❌ Leaderboard:', r2.error.message);
  else console.log('✅ Test leaderboard rows removed\n');
}

if (process.argv.includes('--wipe')) {
  wipe().catch(console.error);
} else {
  seed().catch(console.error);
}
