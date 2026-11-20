// One-time seed claim: link Guy's seeded data to his real Supabase account
// after first sign-in.
//
// Usage (from the package root, after signing in once in the deployed app
// and copying your Supabase user id from Dashboard → Authentication → Users):
//
//   npm run claim-seed -- --user-id <your-supabase-user-uuid>
//
// What it does: updates profile.ownerUserId, camps.ownerUserId,
// camp_members.userId, checkins.userId, reservations.userId,
// messages.authorUserId, photos.authorUserId, community_groups
// .createdByUserId and community_group_members.userId from the placeholder
// 'seed-owner' to your real account id. It never invents a user id and it
// refuses to run twice (nothing left with the placeholder).
// In local dev mode (no Supabase configured) there is nothing to claim —
// the local user already owns the seed data.

import { getDb } from '../server/db.js';
import { SEED_OWNER_ID } from '../server/auth.js';

async function main(): Promise<void> {
  const arg = process.argv.find(a => a === '--user-id');
  const idx = process.argv.indexOf('--user-id');
  const userId = idx >= 0 ? process.argv[idx + 1] : undefined;
  if (!userId || userId.startsWith('--')) {
    console.error('Usage: npm run claim-seed -- --user-id <supabase-user-uuid>');
    process.exit(1);
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    console.error('That does not look like a Supabase user UUID. Copy it from Supabase Dashboard → Authentication → Users.');
    process.exit(1);
  }
  const db = await getDb();
  const tables: [string, string][] = [
    ['profile', 'ownerUserId'],
    ['camps', 'ownerUserId'],
    ['camp_members', 'userId'],
    ['checkins', 'userId'],
    ['reservations', 'userId'],
    ['messages', 'authorUserId'],
    ['photos', 'authorUserId'],
    ['community_groups', 'createdByUserId'],
    ['community_group_members', 'userId'],
    ['community_posts', 'authorUserId'],
  ];
  let changed = 0;
  for (const [table, col] of tables) {
    try {
      const r = await db.run(`UPDATE ${table} SET ${col} = ? WHERE ${col} = ?`, [userId, SEED_OWNER_ID]);
      changed += r.changes;
      console.log(`${table}.${col}: ${r.changes} row(s) claimed`);
    } catch (e) {
      console.error(`Skipped ${table}.${col}:`, e instanceof Error ? e.message : e);
    }
  }
  if (changed === 0) console.log('Nothing left to claim — the seed data is already linked (or this database has no seeded rows).');
  else console.log(`Done. ${changed} row(s) now belong to ${userId}.`);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
