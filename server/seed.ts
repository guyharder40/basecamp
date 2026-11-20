import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from './db.js';
import { SEED_OWNER_ID } from './auth.js';
import { SEED_DATA_JSON } from './seedData.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function seedPath(): string | null {
  const candidates = [
    join(process.cwd(), 'data', 'seed.json'),
    join(__dirname, '..', 'data', 'seed.json'),
  ];
  for (const p of candidates) if (existsSync(p)) return p;
  return null;
}

function j(v: unknown): string { return JSON.stringify(v ?? []); }
function now(): string { return new Date().toISOString(); }
function bool(v: unknown): number { return v ? 1 : 0; }

export async function seedFromFile(db: Db): Promise<void> {
  // Seed data is inlined as a module (seedData.ts) so it is always in the
  // server bundle; fall back to data/seed.json on disk if the inline copy
  // is ever empty. (Same Vercel bundling reason as the schema: a file read
  // with readFileSync at runtime is not bundled, so the seed silently never
  // ran on the first deploy and the profile stayed empty.)
  let seed: any = null;
  if (SEED_DATA_JSON) {
    try { seed = JSON.parse(SEED_DATA_JSON); } catch { seed = null; }
  }
  if (!seed) {
    const path = seedPath();
    if (!path) { console.error('Basecamp seed data not found (neither bundled nor on disk) — skipping seed.'); return; }
    seed = JSON.parse(readFileSync(path, 'utf8')) as any;
  }
  // With an empty seed (clean base app) there is no profile to insert —
  // the first sign-in creates it through the setup form instead. (Without
  // this guard the fallbacks below would invent a "Guy Harder" profile.)
  if (seed.profile) {
    const p = seed.profile ?? {};
    await db.run(
      `INSERT INTO profile (id, ownerUserId, firstName, lastName, status, bio, email, emailVisibility, phone, phoneVisibility, interests, huntingState, avatarUrl, bannerUrl, pinnedBadges, discoverable, profileVisibility, createdAt)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [SEED_OWNER_ID, p.firstName ?? 'Guy', p.lastName ?? 'Harder', p.status ?? '', p.bio ?? '', p.email ?? '', p.emailVisibility ?? 'private', p.phone ?? '', p.phoneVisibility ?? 'private', j(p.interests ?? []), p.huntingState ?? '', p.avatarUrl ?? '', p.bannerUrl ?? '', j(p.pinnedBadges ?? []), 1, 'friends', '2026-11-13T13:34:30.879Z']
    );
  }
  for (const c of seed.camps ?? []) {
    const r = await db.run(
      `INSERT INTO camps (name, location, acres, description, shareCode, ownerName, ownerUserId, centerLat, centerLng, mapZoom, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [c.name, c.location ?? '', String(c.acres ?? ''), c.description ?? '', c.shareCode, c.ownerName ?? '', SEED_OWNER_ID, c.centerLat ?? 39.0977, c.centerLng ?? -76.651, c.mapZoom ?? 14, c.created_at ?? now()]
    );
    const campId = r.lastInsertRowid ?? c.id;
    for (const pin of c.pins ?? []) {
      await db.run(
        `INSERT INTO pins (campId, label, name, pinType, color, lat, lng, notes, bestWinds, createdBy, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [campId, pin.label ?? pin.name ?? '', pin.name ?? pin.label ?? 'Pin', pin.pinType ?? 'stand', pin.color ?? '#C2702E', pin.lat, pin.lng, pin.notes ?? '', j(pin.bestWinds ?? []), pin.createdBy ?? '', pin.created_at ?? now()]
      );
    }
    for (const t of c.trails ?? []) {
      await db.run(
        `INSERT INTO trails (campId, name, color, points, distanceFt, createdAt) VALUES (?, ?, ?, ?, ?, ?)`,
        [campId, t.name, t.color ?? '#C2702E', j(t.points ?? []), t.distanceFt ?? 0, t.created_at ?? now()]
      );
    }
  }
  for (const f of seed.friends ?? []) {
    await db.run(`INSERT INTO friends (name, email, phone, notes, createdAt) VALUES (?, ?, ?, ?, ?)`,
      [f.name, f.email ?? '', f.phone ?? '', f.notes ?? '', f.createdAt ?? now()]);
  }
  for (const g of seed.gear ?? []) {
    await db.run(`INSERT INTO gear (name, category, brand, notes, packed, createdAt) VALUES (?, ?, ?, ?, ?, ?)`,
      [g.name, g.category ?? 'Other', g.brand ?? '', g.notes ?? '', g.packed ? 1 : 0, g.createdAt ?? now()]);
  }
  for (const h of seed.hunts ?? []) {
    await db.run(`INSERT INTO hunts (date, species, stand, notes, harvested, campId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [h.date, h.species ?? '', h.stand ?? '', h.notes ?? '', h.harvested ? 1 : 0, h.campId ?? null, h.createdAt ?? now()]);
  }
  for (const m of seed.messages ?? []) {
    await db.run(`INSERT INTO messages (campId, authorName, authorUserId, body, createdAt) VALUES (?, ?, ?, ?, ?)`,
      [m.campId, m.authorName, SEED_OWNER_ID, m.body, m.created_at ?? now()]);
  }
  for (const n of seed.notes ?? []) {
    await db.run(`INSERT INTO notes (campId, title, body, authorName, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)`,
      [n.campId, n.title, n.body ?? '', n.authorName ?? '', n.createdAt ?? now(), n.updatedAt ?? now()]);
  }
  for (const c of seed.checkins ?? []) {
    // NOTE: the live data itself has a pinId mismatch (check-in references
    // pin 6; the only stand pin is id 8). Carried over unchanged, not corrected.
    await db.run(
      `INSERT INTO checkins (campId, pinId, userName, userId, notes, checkedInAt, checkedOutAt, isActive) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [c.campId, c.pinId, c.userName, SEED_OWNER_ID, c.notes ?? '', c.checkedInAt, c.checkedOutAt ?? null, c.isActive ? 1 : 0]
    );
  }
  for (const r of seed.reservations ?? []) {
    await db.run(`INSERT INTO reservations (campId, pinId, userName, userId, date, session, note, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [r.campId, r.pinId, r.userName, SEED_OWNER_ID, r.date, r.session, r.note ?? '', r.createdAt ?? now()]);
  }
  for (const ph of seed.photos ?? []) {
    // The original photo file is a Muse blob and is NOT in this package.
    // We seed the metadata only; the app shows a placeholder until re-uploaded.
    const r = await db.run(
      `INSERT INTO photos (campId, authorName, authorUserId, species, caption, imageUrl, contentType, harvestClass, weightLbs, antlerScore, antlerPoints, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [ph.campId, ph.authorName, SEED_OWNER_ID, ph.species ?? '', ph.caption ?? '', ph.imageUrl ?? '', ph.contentType ?? 'image/jpeg', ph.harvestClass ?? '', ph.weightLbs ?? null, ph.antlerScore ?? null, ph.antlerPoints ?? null, ph.created_at ?? now()]
    );
    const photoId = r.lastInsertRowid ?? ph.id;
    for (const like of ph.likedBy ?? []) {
      await db.run('INSERT INTO photo_likes (photoId, userName) VALUES (?, ?)', [photoId, like]);
    }
    for (const cm of ph.comments ?? []) {
      await db.run('INSERT INTO photo_comments (photoId, authorName, body, createdAt) VALUES (?, ?, ?, ?)', [photoId, cm.authorName, cm.body, cm.createdAt ?? now()]);
    }
  }
  for (const l of seed.campPhotoLikes ?? []) {
    await db.run('INSERT INTO photo_likes (photoId, userName) VALUES (?, ?)', [l.photoId, l.userName]).catch(() => undefined);
  }
  for (const cm of seed.campPhotoComments ?? []) {
    await db.run('INSERT INTO photo_comments (photoId, authorName, body, createdAt) VALUES (?, ?, ?, ?)', [cm.photoId, cm.authorName, cm.body, cm.createdAt ?? now()]);
  }
  for (const lic of seed.licenses ?? []) {
    const r = await db.run(
      `INSERT INTO licenses (state, kind, licenseNumber, issuedDate, expiryDate, coverage, notes, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [lic.state ?? '', lic.kind ?? '', lic.licenseNumber ?? '', lic.issuedDate ?? '', lic.expiryDate ?? '', lic.coverage ?? '', lic.notes ?? '', lic.createdAt ?? now()]
    );
    const licenseId = r.lastInsertRowid ?? lic.id;
    for (const t of (seed.licenseTags ?? []).filter((x: any) => x.licenseId === lic.id)) {
      await db.run(`INSERT INTO license_tags (licenseId, animal, kind, tagNumber, filled, filledDate, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [licenseId, t.animal ?? '', t.kind ?? '', t.tagNumber ?? '', t.filled ? 1 : 0, t.filledDate ?? '', t.createdAt ?? now()]);
    }
  }
  for (const g of seed.communityGroups ?? []) {
    const r = await db.run(
      `INSERT INTO community_groups (name, state, description, createdBy, createdByUserId, imageUrl, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [g.name, g.state ?? '', g.description ?? '', g.createdBy ?? '', SEED_OWNER_ID, g.imageBlobKey ? '' : '', g.created_at ?? now()]
    );
    const groupId = r.lastInsertRowid ?? g.id;
    for (const m of (seed.communityGroupMembers ?? []).filter((x: any) => x.groupId === g.id)) {
      await db.run('INSERT INTO community_group_members (groupId, userName, userId, createdAt) VALUES (?, ?, ?, ?)',
        [groupId, m.userName, SEED_OWNER_ID, m.created_at ?? now()]);
    }
  }
  for (const cp of seed.communityPosts ?? []) {
    const r = await db.run(
      `INSERT INTO community_posts (groupId, authorName, authorUserId, species, caption, imageUrl, harvestClass, weightLbs, antlerScore, antlerPoints, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [cp.groupId ?? null, cp.authorName, SEED_OWNER_ID, cp.species ?? '', cp.caption ?? '', cp.imageUrl ?? '', cp.harvestClass ?? '', cp.weightLbs ?? null, cp.antlerScore ?? null, cp.antlerPoints ?? null, cp.created_at ?? now()]
    );
    const postId = r.lastInsertRowid ?? cp.id;
    for (const like of cp.likedBy ?? []) {
      await db.run('INSERT INTO community_post_likes (postId, userName) VALUES (?, ?)', [postId, like]).catch(() => undefined);
    }
    for (const cm of cp.comments ?? []) {
      await db.run('INSERT INTO community_post_comments (postId, authorName, body, createdAt) VALUES (?, ?, ?, ?)', [postId, cm.authorName, cm.body, cm.createdAt ?? now()]);
    }
  }
  const s = seed.settings ?? {};
  await db.run(
    `INSERT INTO app_settings (id, theme, units, defaultMapView, profileVisibility, discoverable, notifyCampChat, notifyTrophyActivity, notifyStandActivity, notifyCommunity, notifyBadges, notifyWind)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO NOTHING`,
    [s.theme ?? 'system', s.units ?? 'imperial', s.defaultMapView ?? 'streets', s.profileVisibility ?? 'friends', bool(s.discoverable ?? true), bool(s.notifyCampChat ?? true), bool(s.notifyTrophyActivity ?? true), bool(s.notifyStandActivity ?? true), bool(s.notifyCommunity ?? true), bool(s.notifyBadges ?? true), bool(s.notifyWind ?? true)]
  ).catch(async () => {
    const exists = await db.get('SELECT id FROM app_settings WHERE id = 1');
    if (!exists) await db.run('INSERT INTO app_settings (id, theme, units, defaultMapView, profileVisibility, discoverable, notifyCampChat, notifyTrophyActivity, notifyStandActivity, notifyCommunity, notifyBadges, notifyWind) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [s.theme ?? 'system', s.units ?? 'imperial', s.defaultMapView ?? 'streets', s.profileVisibility ?? 'friends', bool(s.discoverable ?? true), bool(s.notifyCampChat ?? true), bool(s.notifyTrophyActivity ?? true), bool(s.notifyStandActivity ?? true), bool(s.notifyCommunity ?? true), bool(s.notifyBadges ?? true), bool(s.notifyWind ?? true)]);
  });
  for (const w of seed.windCache ?? []) {
    await db.run(
      `INSERT INTO camp_wind_cache (campId, payload, fetchedAt) VALUES (?, ?, ?)
       ON CONFLICT (campId) DO UPDATE SET payload=excluded.payload, fetchedAt=excluded.fetchedAt`,
      [w.campId, JSON.stringify(w.payload), w.fetchedAt ?? now()]
    ).catch(async () => {
      const exists = await db.get('SELECT campId FROM camp_wind_cache WHERE campId = ?', [w.campId]);
      if (exists) await db.run('UPDATE camp_wind_cache SET payload = ?, fetchedAt = ? WHERE campId = ?', [JSON.stringify(w.payload), w.fetchedAt ?? now(), w.campId]);
      else await db.run('INSERT INTO camp_wind_cache (campId, payload, fetchedAt) VALUES (?, ?, ?)', [w.campId, JSON.stringify(w.payload), w.fetchedAt ?? now()]);
    });
  }
}
