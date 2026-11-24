import express, { type NextFunction, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb, type Db } from './db.js';
import { profanityError, FIELD_LIMITS } from './profanity.js';
import { fetchWind, scoreGoHunt, compassWord, type WindSnapshot } from './weather.js';
import { computeBadges, buildLeaderboard, seasonOf, seasonLabelFor, type Activity, type TrophyPostInput } from './scoring.js';
import { authMiddleware, requireAuth, requestUserId, isOwner, sameAccount, visibleContact, authConfigured, authConfig, SEED_OWNER_ID, LOCAL_USER_ID, type AuthedRequest } from './auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Package root: works both under tsx (server/) and compiled
// (dist-server/server/), by walking up to the dir with package.json + server/.
function findRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 5; i++) {
    if (existsSync(join(dir, 'package.json')) && existsSync(join(dir, 'server'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}
const ROOT = findRoot(__dirname);
const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(authMiddleware as any);

function parseJson(v: unknown, fallback: unknown = []): any {
  if (v == null) return fallback;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return fallback; } }
  return v;
}
function toBool(v: unknown): boolean { return v === true || v === 1 || v === '1' || v === 't'; }
function toIso(v: unknown): string { if (v instanceof Date) return v.toISOString(); return String(v ?? ''); }
function nowIso(): string { return new Date().toISOString(); }
function shareCode(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return 'CAMP-' + s;
}
function trailDistanceFt(points: { lat: number; lng: number }[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    total += 2 * 6371000 * Math.asin(Math.sqrt(h)) * 3.28084;
  }
  return Math.round(total);
}
function sessionsOverlap(a: string, b: string): boolean { return a === 'all_day' || b === 'all_day' || a === b; }
function limitText(v: string, max: number): string { return String(v ?? '').slice(0, max); }

type Handler = (req: AuthedRequest, res: Response, db: Db) => Promise<unknown>;

// One-time self-claim of the seeded rows. Seeded records carry the
// placeholder owner 'seed-owner' until the first real account claims them
// (scripts/claim-seed.ts did this by hand). If that step never ran — e.g.
// the database kept the seeded rows while the app was redeployed from a
// clean build — the owner is locked out of their own camp: the app shows
// the owner controls (the names match) but the server refuses delete and
// invite with 403. So the first authenticated account to show up claims
// the seed data, exactly as the manual script would have. Checked once
// per account per process; a failure never breaks the request itself.
const seedClaimChecked = new Set<string>();
async function maybeClaimSeed(db: Db, req: AuthedRequest): Promise<void> {
  const user = req.authUser;
  if (!user || user.id === LOCAL_USER_ID || seedClaimChecked.has(user.id)) return;
  seedClaimChecked.add(user.id);
  try {
    const profile = await db.get<any>('SELECT ownerUserId FROM profile WHERE id = 1');
    if (!profile || ((profile.ownerUserId ?? SEED_OWNER_ID) !== SEED_OWNER_ID)) return;
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
    for (const [table, col] of tables) {
      await db.run(`UPDATE ${table} SET ${col} = ? WHERE ${col} = ?`, [user.id, SEED_OWNER_ID]);
    }
    console.log(`Seed data claimed for account ${user.id}`);
  } catch (e) {
    seedClaimChecked.delete(user.id);
    console.warn('Seed claim failed (will retry on a later request):', e instanceof Error ? e.message : e);
  }
}

function wrap(fn: Handler) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try { const db = await getDb(); await maybeClaimSeed(db, req as AuthedRequest); await maybeClaimLegacy(db, req as AuthedRequest); await fn(req as AuthedRequest, res, db); }
    catch (e) { next(e); }
  };
}

// One-time adoption of the rows that predate per-account ownership. When
// the app effectively had one user, private rows (friends, gear, hunts,
// licenses, settings) and map work (pins, trails) were stored with no
// owner. They belong to the owner of the first profile — the primary
// account — so that account adopts them; later accounts start clean.
// Runs once per account per process, and only for the primary owner.
const legacyClaimChecked = new Set<string>();
async function maybeClaimLegacy(db: Db, req: AuthedRequest): Promise<void> {
  const user = req.authUser;
  if (!user || user.id === LOCAL_USER_ID || legacyClaimChecked.has(user.id)) return;
  legacyClaimChecked.add(user.id);
  try {
    const first = await db.get<any>('SELECT ownerUserId FROM profile ORDER BY id ASC LIMIT 1');
    if (!first || !isOwner(first.ownerUserId, user.id)) return;
    const tables: [string, string][] = [
      ['friends', 'ownerUserId'], ['gear', 'ownerUserId'], ['hunts', 'ownerUserId'],
      ['licenses', 'ownerUserId'], ['app_settings', 'ownerUserId'],
      ['pins', 'createdByUserId'], ['trails', 'createdByUserId'],
    ];
    for (const [table, col] of tables) {
      await db.run(`UPDATE ${table} SET ${col} = ? WHERE ${col} = '' OR ${col} = ?`, [user.id, SEED_OWNER_ID]);
    }
  } catch (e) {
    legacyClaimChecked.delete(user.id);
    console.warn('Legacy ownership claim failed (will retry on a later request):', e instanceof Error ? e.message : e);
  }
}
function bad(res: Response, status: number, message: string): void { res.status(status).json({ error: message }); }
function profanityFail(res: Response, ...texts: (string | undefined | null)[]): boolean {
  const err = profanityError(...texts);
  if (err) { bad(res, 400, err); return true; }
  return false;
}

// Row mappers
const mapProfile = (r: any) => ({
  ownerUserId: r.ownerUserId ?? SEED_OWNER_ID,
  username: r.username ?? '',
  firstName: r.firstName ?? '', lastName: r.lastName ?? '', displayName: `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim(),
  status: r.status ?? '', bio: r.bio ?? '', email: r.email ?? '', emailVisibility: r.emailVisibility ?? 'private',
  phone: r.phone ?? '', phoneVisibility: r.phoneVisibility ?? 'private', interests: parseJson(r.interests, []),
  huntingState: r.huntingState ?? '', avatarUrl: r.avatarUrl ?? '', bannerUrl: r.bannerUrl ?? '',
  pinnedBadges: parseJson(r.pinnedBadges, []), discoverable: toBool(r.discoverable ?? 1),
  profileVisibility: r.profileVisibility ?? 'friends', createdAt: toIso(r.createdAt),
});
const mapFriend = (r: any) => ({ id: r.id, name: r.name, email: r.email ?? '', phone: r.phone ?? '', notes: r.notes ?? '', createdAt: toIso(r.createdAt) });
const mapCamp = (r: any, memberCount = 1, pinCount = 0) => ({ id: r.id, name: r.name, location: r.location ?? '', acres: String(r.acres ?? ''), description: r.description ?? '', shareCode: r.shareCode, ownerName: r.ownerName ?? '', ownerUserId: r.ownerUserId ?? SEED_OWNER_ID, centerLat: Number(r.centerLat), centerLng: Number(r.centerLng), mapZoom: Number(r.mapZoom ?? 14), mapView: r.mapView ?? '', memberCount, pinCount, created_at: toIso(r.createdAt) });
const mapPin = (r: any) => ({ id: r.id, campId: r.campId, label: r.label ?? '', name: r.name ?? r.label ?? '', pinType: r.pinType ?? 'stand', color: r.color ?? '#C2702E', lat: Number(r.lat), lng: Number(r.lng), notes: r.notes ?? '', bestWinds: parseJson(r.bestWinds, []), createdBy: r.createdBy ?? '', createdAt: toIso(r.createdAt) });
const mapTrail = (r: any) => ({ id: r.id, campId: r.campId, name: r.name, color: r.color ?? '#C2702E', points: parseJson(r.points, []), distanceFt: Number(r.distanceFt ?? 0), createdAt: toIso(r.createdAt) });
const mapCheckin = (r: any, pinLabel?: string) => ({ id: r.id, campId: r.campId, pinId: r.pinId, pinLabel: pinLabel ?? '', userName: r.userName, userId: r.userId ?? '', notes: r.notes ?? '', checkedInAt: toIso(r.checkedInAt), checkedOutAt: r.checkedOutAt ? toIso(r.checkedOutAt) : null, isActive: toBool(r.isActive) });
const mapReservation = (r: any, pinLabel?: string) => ({ id: r.id, campId: r.campId, pinId: r.pinId, pinLabel: pinLabel ?? '', userName: r.userName, userId: r.userId ?? '', date: r.date, session: r.session, note: r.note ?? '', createdAt: toIso(r.createdAt) });
const mapNote = (r: any) => ({ id: r.id, campId: r.campId, title: r.title, body: r.body ?? '', authorName: r.authorName ?? '', createdAt: toIso(r.createdAt), updatedAt: toIso(r.updatedAt) });
const mapMessage = (r: any) => ({ id: r.id, campId: r.campId, authorName: r.authorName, body: r.body, createdAt: toIso(r.createdAt) });
const mapGear = (r: any) => ({ id: r.id, name: r.name, category: r.category ?? 'Other', brand: r.brand ?? '', notes: r.notes ?? '', packed: toBool(r.packed), createdAt: toIso(r.createdAt) });
const mapHunt = (r: any) => ({ id: r.id, date: r.date, species: r.species ?? '', stand: r.stand ?? '', notes: r.notes ?? '', harvested: toBool(r.harvested), campId: r.campId ?? null, createdAt: toIso(r.createdAt) });
const mapLicense = (r: any) => ({ id: r.id, state: r.state ?? '', kind: r.kind ?? '', licenseNumber: r.licenseNumber ?? '', issuedDate: r.issuedDate ?? '', expiryDate: r.expiryDate ?? '', coverage: r.coverage ?? '', notes: r.notes ?? '', createdAt: toIso(r.createdAt) });
const mapTag = (r: any) => ({ id: r.id, licenseId: r.licenseId, animal: r.animal ?? '', kind: r.kind ?? '', tagNumber: r.tagNumber ?? '', filled: toBool(r.filled), filledDate: r.filledDate ?? '', createdAt: toIso(r.createdAt) });
const mapGroup = (r: any, memberCount = 0, joined = false) => ({ id: r.id, name: r.name, state: r.state ?? '', description: r.description ?? '', createdBy: r.createdBy ?? '', createdByUserId: r.createdByUserId ?? '', imageUrl: r.imageUrl ?? '', memberCount, joined, createdAt: toIso(r.createdAt) });

async function pinLabelFor(db: Db, campId: number, pinId: number): Promise<string> {
  const p = await db.get<{ label: string; name: string }>('SELECT label, name FROM pins WHERE id = ?', [pinId]);
  if (!p) return 'Stand';
  return p?.name || p?.label || 'Stand';
}
async function photoWithExtras(db: Db, r: any): Promise<any> {
  const likes = await db.all<{ userName: string }>('SELECT userName FROM photo_likes WHERE photoId = ?', [r.id]);
  const comments = await db.all<any>('SELECT * FROM photo_comments WHERE photoId = ? ORDER BY createdAt ASC', [r.id]);
  return {
    id: r.id, campId: r.campId, authorName: r.authorName, species: r.species ?? '', caption: r.caption ?? '',
    imageUrl: r.imageUrl ?? '', likeCount: likes.length, likedBy: likes.map(l => l.userName),
    comments: comments.map(c => ({ id: c.id, photoId: c.photoId, authorName: c.authorName, body: c.body, createdAt: toIso(c.createdAt) })),
    harvestClass: r.harvestClass ?? '', weightLbs: r.weightLbs ?? null, antlerScore: r.antlerScore ?? null, antlerPoints: r.antlerPoints ?? null,
    createdAt: toIso(r.createdAt),
  };
}
async function communityPostWithExtras(db: Db, r: any, myName: string): Promise<any> {
  const likes = await db.all<{ userName: string }>('SELECT userName FROM community_post_likes WHERE postId = ?', [r.id]);
  const comments = await db.all<any>('SELECT * FROM community_post_comments WHERE postId = ? ORDER BY createdAt ASC', [r.id]);
  return {
    id: r.id, groupId: r.groupId ?? null, authorName: r.authorName, species: r.species ?? '', caption: r.caption ?? '',
    imageUrl: r.imageUrl ?? '', likeCount: likes.length, likedBy: likes.map(l => l.userName), liked: likes.some(l => l.userName === myName),
    comments: comments.map(c => ({ id: c.id, postId: c.postId, authorName: c.authorName, body: c.body, createdAt: toIso(c.createdAt) })),
    harvestClass: r.harvestClass ?? '', weightLbs: r.weightLbs ?? null, antlerScore: r.antlerScore ?? null, antlerPoints: r.antlerPoints ?? null,
    createdAt: toIso(r.createdAt),
  };
}
async function isCampOwner(db: Db, campId: number, userId: string): Promise<boolean> {
  if (!userId) return false;
  const camp = await db.get<any>('SELECT ownerUserId FROM camps WHERE id = ?', [campId]);
  if (!camp) return false;
  return isOwner(camp.ownerUserId, userId);
}
/** The profile row belonging to the signed-in account. Profiles are
 *  per-account since the multi-user build-out; local mode (no auth
 *  configured) keeps the single row it has always had. With sign-in on,
 *  an anonymous or new account simply has no profile yet — never hand
 *  back somebody else's row. */
async function profileRowForUser(db: Db, req: AuthedRequest): Promise<any | null> {
  const uid = requestUserId(req);
  if (authConfigured()) {
    if (!uid) return null;
    const rows = await db.all<any>('SELECT * FROM profile ORDER BY id ASC');
    return rows.find(r => sameAccount(r.ownerUserId, uid)) ?? null;
  }
  const row = await db.get('SELECT * FROM profile ORDER BY id ASC LIMIT 1');
  return row ?? null;
}
/** Does this account own a private row (friends / gear / hunts /
 *  licenses / settings)? Local mode: everything belongs to the local user. */
function ownsPrivate(ownerVal: unknown, uid: string): boolean {
  if (!authConfigured()) return true;
  return sameAccount(String(ownerVal ?? ''), uid);
}
async function myDisplayName(db: Db, req: AuthedRequest): Promise<string> {
  const row = await profileRowForUser(db, req);
  const name = `${row?.firstName ?? ''} ${row?.lastName ?? ''}`.trim();
  return name || req.authUser?.email || 'Hunter';
}

// Health + auth status
app.get('/api/health', wrap(async (_req, res, db) => { res.json({ ok: true, db: db.kind, auth: authConfigured() ? 'supabase' : 'local' }); }));
// Runtime auth config for the browser client. The client build needs NO
// VITE_SUPABASE_* vars: it fetches this on startup and lazily creates its
// Supabase client from the server's public values (anon key is public by
// design; the service-role key is never served). No DB access needed.
app.get('/api/auth/config', (_req, res) => { res.json(authConfig()); });
app.get('/api/auth/status', wrap(async (req, res, db) => {
  const profile = await profileRowForUser(db, req);
  res.json({
    configured: authConfigured(),
    signedIn: !!req.authUser,
    userId: req.authUser?.id ?? null,
    email: req.authUser?.email ?? null,
    profileLinked: !!profile,
    profileName: profile ? `${(profile as any).firstName ?? ''} ${(profile as any).lastName ?? ''}`.trim() : '',
  });
}));

const USERNAME_RULE = /^[A-Za-z0-9_]{3,20}$/;
const USERNAME_HELP = 'Username needs 3–20 characters: letters, numbers and underscores only.';
/** Is this username free? (Public on purpose: the create-account form
 *  checks before the account exists. Answers with a yes/no only.) */
app.get('/api/auth/username', wrap(async (req, res, db) => {
  const u = String(req.query.u ?? '').trim();
  if (!USERNAME_RULE.test(u)) return res.json({ available: false, reason: USERNAME_HELP });
  const rows = await db.all<any>('SELECT username FROM profile');
  const taken = rows.some(r => String(r.username ?? '').toLowerCase() === u.toLowerCase());
  if (!taken) return res.json({ available: true });
  const mine = await profileRowForUser(db, req);
  const isMine = !!mine && String(mine.username ?? '').toLowerCase() === u.toLowerCase();
  res.json({ available: isMine });
}));

// Profile — always the signed-in account's own profile.
app.get('/api/profile', wrap(async (req, res, db) => {
  const row = await profileRowForUser(db, req);
  if (!row) return res.json({ username: '', firstName: '', lastName: '', displayName: '', status: '', bio: '', email: '', emailVisibility: 'private', phone: '', phoneVisibility: 'private', interests: [], huntingState: '', avatarUrl: '', bannerUrl: '', pinnedBadges: [], discoverable: true, profileVisibility: 'friends', createdAt: '' });
  res.json(mapProfile(row));
}));
app.put('/api/profile', wrap(async (req, res, db) => {
  const user = requireAuth(req, res); if (!user) return;
  const b = req.body ?? {};
  if (profanityFail(res, b.firstName, b.lastName, b.status, b.bio)) return;
  const existing = await profileRowForUser(db, req);
  const cur = existing ?? undefined;
  const merged = {
    username: b.username !== undefined ? String(b.username).trim() : (cur?.username ?? ''),
    firstName: limitText(b.firstName ?? cur?.firstName ?? '', FIELD_LIMITS.textShort),
    lastName: limitText(b.lastName ?? cur?.lastName ?? '', FIELD_LIMITS.textShort),
    status: limitText(b.status ?? cur?.status ?? '', FIELD_LIMITS.textShort),
    bio: limitText(b.bio ?? cur?.bio ?? '', FIELD_LIMITS.textBody),
    email: b.email ?? cur?.email ?? '', emailVisibility: b.emailVisibility ?? cur?.emailVisibility ?? 'private',
    phone: b.phone ?? cur?.phone ?? '', phoneVisibility: b.phoneVisibility ?? cur?.phoneVisibility ?? 'private',
    interests: Array.isArray(b.interests) ? b.interests : parseJson(cur?.interests, []),
    huntingState: b.huntingState ?? cur?.huntingState ?? '', avatarUrl: b.avatarUrl ?? cur?.avatarUrl ?? '', bannerUrl: b.bannerUrl ?? cur?.bannerUrl ?? '',
    pinnedBadges: Array.isArray(b.pinnedBadges) ? b.pinnedBadges.slice(0, 3) : parseJson(cur?.pinnedBadges, []),
    discoverable: b.discoverable !== undefined ? (b.discoverable ? 1 : 0) : (toBool(cur?.discoverable ?? 1) ? 1 : 0),
    profileVisibility: b.profileVisibility ?? cur?.profileVisibility ?? 'friends',
  };
  // Username: optional, but unique across every hunter when set.
  if (merged.username) {
    if (!USERNAME_RULE.test(merged.username)) return bad(res, 400, USERNAME_HELP);
    const clash = await db.get<any>('SELECT id FROM profile WHERE LOWER(username) = LOWER(?)', [merged.username]);
    if (clash && (!existing || Number((clash as any).id) !== Number((existing as any).id))) {
      return bad(res, 409, 'That username is taken — please pick another.');
    }
  }
  try {
    if (existing) {
      await db.run('UPDATE profile SET username=?, firstName=?, lastName=?, status=?, bio=?, email=?, emailVisibility=?, phone=?, phoneVisibility=?, interests=?, huntingState=?, avatarUrl=?, bannerUrl=?, pinnedBadges=?, discoverable=?, profileVisibility=? WHERE id=?',
        [merged.username, merged.firstName, merged.lastName, merged.status, merged.bio, merged.email, merged.emailVisibility, merged.phone, merged.phoneVisibility, JSON.stringify(merged.interests), merged.huntingState, merged.avatarUrl, merged.bannerUrl, JSON.stringify(merged.pinnedBadges), merged.discoverable, merged.profileVisibility, (existing as any).id]);
    } else {
      // First save for this account: create its own profile row.
      await db.run('INSERT INTO profile (ownerUserId, username, firstName, lastName, status, bio, email, emailVisibility, phone, phoneVisibility, interests, huntingState, avatarUrl, bannerUrl, pinnedBadges, discoverable, profileVisibility, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [user.id, merged.username, merged.firstName, merged.lastName, merged.status, merged.bio, merged.email, merged.emailVisibility, merged.phone, merged.phoneVisibility, JSON.stringify(merged.interests), merged.huntingState, merged.avatarUrl, merged.bannerUrl, JSON.stringify(merged.pinnedBadges), merged.discoverable, merged.profileVisibility, nowIso()]);
    }
  } catch (e) {
    // The unique index is the backstop if two hunters race for a name.
    if (/unique|duplicate/i.test(e instanceof Error ? e.message : '')) return bad(res, 409, 'That username is taken — please pick another.');
    throw e;
  }
  const row = await profileRowForUser(db, req);
  res.json(mapProfile(row));
}));

// Friends (+ real friend requests) — the friends list is per-account.
app.get('/api/friends', wrap(async (req, res, db) => {
  const uid = requestUserId(req);
  const rows = await db.all('SELECT * FROM friends ORDER BY name ASC');
  res.json(rows.filter((r: any) => ownsPrivate(r.ownerUserId, uid)).map(mapFriend));
}));
app.post('/api/friends', wrap(async (req, res, db) => {
  const user = requireAuth(req, res); if (!user) return;
  const name = limitText(String(req.body?.name ?? '').trim(), FIELD_LIMITS.textShort);
  if (!name) return bad(res, 400, 'Name is required.');
  if (profanityFail(res, name, req.body?.notes)) return;
  const mine = (await db.all('SELECT * FROM friends')).filter((r: any) => ownsPrivate(r.ownerUserId, user.id));
  const existing = mine.find((r: any) => String(r.name).toLowerCase() === name.toLowerCase());
  if (existing) return res.json(mapFriend(existing));
  const r = await db.run('INSERT INTO friends (name, email, phone, notes, createdAt, ownerUserId) VALUES (?, ?, ?, ?, ?, ?)', [name, req.body?.email ?? '', req.body?.phone ?? '', req.body?.notes ?? '', nowIso(), user.id]);
  const row = await db.get('SELECT * FROM friends WHERE id = ?', [r.lastInsertRowid]);
  res.json(mapFriend(row));
}));
app.delete('/api/friends/:id', wrap(async (req, res, db) => {
  const user = requireAuth(req, res); if (!user) return;
  const row = await db.get<any>('SELECT * FROM friends WHERE id = ?', [req.params.id]);
  if (!row || !ownsPrivate(row.ownerUserId, user.id)) return bad(res, 404, 'Friend not found.');
  await db.run('DELETE FROM friends WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));
app.get('/api/friends/requests', wrap(async (req, res, db) => {
  const uid = requestUserId(req);
  const rows = await db.all('SELECT * FROM friend_requests WHERE toUserId = ? OR fromUserId = ? ORDER BY createdAt DESC', [uid, uid]);
  res.json(rows.map((r: any) => ({ id: r.id, fromUserId: r.fromUserId, fromName: r.fromName, toUserId: r.toUserId, toName: r.toName, status: r.status, createdAt: toIso(r.createdAt) })));
}));
app.post('/api/friends/requests', wrap(async (req, res, db) => {
  const user = requireAuth(req, res); if (!user) return;
  const toName = limitText(String(req.body?.toName ?? '').trim(), FIELD_LIMITS.textShort);
  const toUserId = String(req.body?.toUserId ?? '').trim();
  if (!toName && !toUserId) return bad(res, 400, 'Who do you want to add as a friend?');
  if (profanityFail(res, toName)) return;
  const fromName = await myDisplayName(db, req);
  const r = await db.run('INSERT INTO friend_requests (fromUserId, fromName, toUserId, toName, status, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
    [user.id, fromName, toUserId, toName, 'pending', nowIso()]);
  const row = await db.get('SELECT * FROM friend_requests WHERE id = ?', [r.lastInsertRowid]);
  res.json({ id: (row as any).id, fromUserId: user.id, fromName, toUserId, toName, status: 'pending', createdAt: nowIso() });
}));
app.post('/api/friends/requests/:id/accept', wrap(async (req, res, db) => {
  const user = requireAuth(req, res); if (!user) return;
  const r = await db.get<any>('SELECT * FROM friend_requests WHERE id = ?', [req.params.id]);
  if (!r) return bad(res, 404, 'Friend request not found.');
  if (authConfigured() && r.toUserId && r.toUserId !== user.id) return bad(res, 403, 'Only the person invited can accept this request.');
  await db.run('UPDATE friend_requests SET status = ? WHERE id = ?', ['accepted', req.params.id]);
  const mine = (await db.all('SELECT * FROM friends')).filter((f: any) => ownsPrivate(f.ownerUserId, user.id));
  const existing = mine.find((f: any) => String(f.name).toLowerCase() === String(r.fromName).toLowerCase());
  if (!existing) await db.run('INSERT INTO friends (name, email, phone, notes, createdAt, ownerUserId) VALUES (?, ?, ?, ?, ?, ?)', [r.fromName, '', '', '', nowIso(), user.id]);
  res.json({ ok: true });
}));
app.post('/api/friends/requests/:id/decline', wrap(async (req, res, db) => {
  const user = requireAuth(req, res); if (!user) return;
  const r = await db.get<any>('SELECT * FROM friend_requests WHERE id = ?', [req.params.id]);
  if (!r) return bad(res, 404, 'Friend request not found.');
  if (authConfigured() && r.toUserId && r.toUserId !== user.id) return bad(res, 403, 'Only the person invited can decline this request.');
  await db.run('UPDATE friend_requests SET status = ? WHERE id = ?', ['declined', req.params.id]);
  res.json({ ok: true });
}));

// Camps — with sign-in on, a hunter sees the camps they own or belong to.
app.get('/api/camps', wrap(async (req, res, db) => {
  let rows = await db.all<any>('SELECT * FROM camps ORDER BY createdAt DESC');
  if (authConfigured()) {
    const uid = requestUserId(req);
    const members = await db.all<any>('SELECT campId, userId FROM camp_members');
    const memberCampIds = new Set(members.filter(m => sameAccount(m.userId, uid)).map(m => m.campId));
    rows = rows.filter(r => isOwner(r.ownerUserId, uid) || memberCampIds.has(r.id));
  }
  const out = [];
  for (const r of rows) {
    const mc = await db.get<{ c: number }>('SELECT COUNT(*) as c FROM camp_members WHERE campId = ?', [r.id]);
    const pc = await db.get<{ c: number }>('SELECT COUNT(*) as c FROM pins WHERE campId = ?', [r.id]);
    out.push(mapCamp(r, 1 + Number(mc?.c ?? 0), Number(pc?.c ?? 0)));
  }
  res.json(out);
}));
app.post('/api/camps', wrap(async (req, res, db) => {
  const user = requireAuth(req, res); if (!user) return;
  const name = limitText(String(req.body?.name ?? '').trim(), FIELD_LIMITS.campName);
  if (!name) return bad(res, 400, 'Camp name is required.');
  if (profanityFail(res, name, req.body?.location, req.body?.description)) return;
  const ownerName = await myDisplayName(db, req);
  const r = await db.run(
    'INSERT INTO camps (name, location, acres, description, shareCode, ownerName, ownerUserId, centerLat, centerLng, mapZoom, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    // A new camp starts centred on the middle of the US until its owner
    // sets the real location — never on anybody's own camp.
    [name, req.body?.location ?? '', String(req.body?.acres ?? ''), req.body?.description ?? '', shareCode(), ownerName, user.id, Number(req.body?.centerLat ?? 39.8283), Number(req.body?.centerLng ?? -98.5795), Number(req.body?.mapZoom ?? 14), nowIso()]
  );
  const row = await db.get('SELECT * FROM camps WHERE id = ?', [r.lastInsertRowid]);
  res.json(mapCamp(row, 1, 0));
}));
app.post('/api/camps/join', wrap(async (req, res, db) => {
  const user = requireAuth(req, res); if (!user) return;
  const code = String(req.body?.code ?? '').trim().toUpperCase();
  const row = await db.get('SELECT * FROM camps WHERE UPPER(shareCode) = ?', [code]);
  if (!row) return bad(res, 404, 'No camp found with that share code.');
  const name = await myDisplayName(db, req);
  const existing = await db.get('SELECT * FROM camp_members WHERE campId = ? AND (userId = ? OR LOWER(name) = LOWER(?))', [row.id, user.id, name]);
  if (!existing) {
    const profile = await profileRowForUser(db, req);
    await db.run('INSERT INTO camp_members (campId, name, role, joined, email, phone, userId) VALUES (?, ?, ?, ?, ?, ?, ?)', [row.id, name, 'viewer', 1, (profile as any)?.email ?? '', (profile as any)?.phone ?? '', user.id]);
  }
  res.json(mapCamp(row, 1, 0));
}));
// Camp access gate: everything under /api/camps/:id (detail, map, pins,
// trails, stands, chat, trophies, crew) is for the camp's owner and
// members only. Registered after the list/create/join routes above, which
// it must not block; local mode (no sign-in) is a single hunter, so open.
app.use('/api/camps/:id', async (req, res, next) => {
  try {
    if (!authConfigured()) return next();
    const uid = requestUserId(req as AuthedRequest);
    if (!uid) return res.status(401).json({ error: 'Sign in to continue.' });
    const db = await getDb();
    const camp = await db.get<any>('SELECT ownerUserId FROM camps WHERE id = ?', [(req.params as any).id]);
    if (!camp) return next(); // the handler itself answers 404
    if (isOwner(camp.ownerUserId, uid)) return next();
    const members = await db.all<any>('SELECT userId FROM camp_members WHERE campId = ?', [(req.params as any).id]);
    if (members.some(m => sameAccount(m.userId, uid))) return next();
    return res.status(403).json({ error: 'You are not a member of this camp.' });
  } catch (e) { return next(e as Error); }
});
app.get('/api/camps/:id', wrap(async (req, res, db) => {
  const camp = await db.get('SELECT * FROM camps WHERE id = ?', [req.params.id]);
  if (!camp) return bad(res, 404, 'Camp not found.');
  const viewerId = requestUserId(req);
  const owner = isOwner((camp as any).ownerUserId, viewerId);
  const members = await db.all('SELECT * FROM camp_members WHERE campId = ? ORDER BY name ASC', [req.params.id]);
  const pins = await db.all('SELECT * FROM pins WHERE campId = ? ORDER BY id ASC', [req.params.id]);
  const trails = await db.all('SELECT * FROM trails WHERE campId = ? ORDER BY id ASC', [req.params.id]);
  res.json({
    camp: mapCamp(camp),
    members: members.map((m: any) => ({
      id: m.id, campId: m.campId, name: m.name, role: m.role, joined: toBool(m.joined),
      // Contact details are only shown to the camp owner or the member
      // themselves; everyone else sees just the name and role.
      email: owner || m.userId === viewerId ? (m.email ?? '') : '',
      phone: owner || m.userId === viewerId ? (m.phone ?? '') : '',
    })),
    pins: pins.map(mapPin),
    trails: trails.map(mapTrail),
  });
}));
app.delete('/api/camps/:id', wrap(async (req, res, db) => {
  const user = requireAuth(req, res); if (!user) return;
  if (!(await isCampOwner(db, Number(req.params.id), user.id))) return bad(res, 403, 'Only the camp owner can delete this camp.');
  const id = req.params.id;
  for (const t of ['camp_members', 'pins', 'trails', 'checkins', 'reservations', 'notes', 'messages']) await db.run(`DELETE FROM ${t} WHERE campId = ?`, [id]);
  const photos = await db.all<{ id: number }>('SELECT id FROM photos WHERE campId = ?', [id]);
  for (const p of photos) { await db.run('DELETE FROM photo_likes WHERE photoId = ?', [p.id]); await db.run('DELETE FROM photo_comments WHERE photoId = ?', [p.id]); }
  await db.run('DELETE FROM photos WHERE campId = ?', [id]);
  await db.run('DELETE FROM camps WHERE id = ?', [id]);
  res.json({ ok: true });
}));
app.put('/api/camps/:id/location', wrap(async (req, res, db) => {
  await db.run('UPDATE camps SET centerLat = ?, centerLng = ?, mapZoom = ? WHERE id = ?', [Number(req.body?.centerLat), Number(req.body?.centerLng), Number(req.body?.mapZoom ?? 14), req.params.id]);
  const row = await db.get('SELECT * FROM camps WHERE id = ?', [req.params.id]);
  if (!row) return bad(res, 404, 'Camp not found.');
  res.json(mapCamp(row));
}));
app.put('/api/camps/:id/map-view', wrap(async (req, res, db) => {
  const view = String(req.body?.mapView ?? 'streets');
  if (!['streets', 'satellite', 'topo', 'dark', 'grayscale'].includes(view)) return bad(res, 400, 'Unknown map view.');
  await db.run('UPDATE camps SET mapView = ? WHERE id = ?', [view, req.params.id]);
  res.json({ ok: true, mapView: view });
}));

// Camp members — only the owner can invite or remove (enforced server-side).
app.post('/api/camps/:id/members', wrap(async (req, res, db) => {
  const user = requireAuth(req, res); if (!user) return;
  if (!(await isCampOwner(db, Number(req.params.id), user.id))) return bad(res, 403, 'Only the camp owner can invite people to this camp.');
  const name = limitText(String(req.body?.name ?? '').trim(), FIELD_LIMITS.textShort);
  if (!name) return bad(res, 400, 'Name is required.');
  if (profanityFail(res, name)) return;
  const role = req.body?.role === 'editor' ? 'editor' : 'viewer';
  const existing = await db.get('SELECT * FROM camp_members WHERE campId = ? AND LOWER(name) = LOWER(?)', [req.params.id, name]);
  if (existing) return res.json({ id: existing.id, campId: existing.campId, name: existing.name, role: existing.role, joined: toBool(existing.joined) });
  const r = await db.run('INSERT INTO camp_members (campId, name, role, joined, email, phone, userId) VALUES (?, ?, ?, ?, ?, ?, ?)', [req.params.id, name, role, 0, req.body?.email ?? '', req.body?.phone ?? '', req.body?.userId ?? '']);
  const row = await db.get('SELECT * FROM camp_members WHERE id = ?', [r.lastInsertRowid]);
  if (!row) return bad(res, 500, 'Could not save member.');
  res.json({ id: row.id, campId: row.campId, name: row.name, role: row.role, joined: toBool(row.joined) });
}));
app.delete('/api/camps/:id/members/:memberId', wrap(async (req, res, db) => {
  const user = requireAuth(req, res); if (!user) return;
  if (!(await isCampOwner(db, Number(req.params.id), user.id))) return bad(res, 403, 'Only the camp owner can remove members.');
  await db.run('DELETE FROM camp_members WHERE id = ? AND campId = ?', [req.params.memberId, req.params.id]);
  res.json({ ok: true });
}));

// Pins
app.post('/api/camps/:id/pins', wrap(async (req, res, db) => {
  const user = requireAuth(req, res); if (!user) return;
  const b = req.body ?? {};
  if (profanityFail(res, b.name, b.notes)) return;
  const count = await db.get<{ c: number }>('SELECT COUNT(*) as c FROM pins WHERE campId = ?', [req.params.id]);
  const label = `#${Number(count?.c ?? 0) + 1}`;
  const myName = await myDisplayName(db, req);
  const r = await db.run(
    'INSERT INTO pins (campId, label, name, pinType, color, lat, lng, notes, bestWinds, createdBy, createdAt, createdByUserId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [req.params.id, label, limitText(String(b.name ?? '').trim() || label, FIELD_LIMITS.textShort), b.pinType ?? 'stand', b.color ?? '#C2702E', Number(b.lat), Number(b.lng), limitText(b.notes ?? '', FIELD_LIMITS.textBody), JSON.stringify(b.bestWinds ?? []), myName, nowIso(), user.id]
  );
  const row = await db.get('SELECT * FROM pins WHERE id = ?', [r.lastInsertRowid]);
  res.json(mapPin(row));
}));
app.put('/api/camps/:id/pins/:pinId', wrap(async (req, res, db) => {
  const b = req.body ?? {};
  if (profanityFail(res, b.name, b.notes)) return;
  const cur = await db.get('SELECT * FROM pins WHERE id = ? AND campId = ?', [req.params.pinId, req.params.id]);
  if (!cur) return bad(res, 404, 'Pin not found.');
  await db.run('UPDATE pins SET name=?, pinType=?, color=?, lat=?, lng=?, notes=?, bestWinds=? WHERE id=? AND campId=?',
    [limitText(b.name ?? cur.name, FIELD_LIMITS.textShort), b.pinType ?? cur.pinType, b.color ?? cur.color, Number(b.lat ?? cur.lat), Number(b.lng ?? cur.lng), limitText(b.notes ?? cur.notes, FIELD_LIMITS.textBody), JSON.stringify(b.bestWinds ?? parseJson(cur.bestWinds, [])), req.params.pinId, req.params.id]);
  const row = await db.get('SELECT * FROM pins WHERE id = ?', [req.params.pinId]);
  res.json(mapPin(row));
}));
app.delete('/api/camps/:id/pins/:pinId', wrap(async (req, res, db) => {
  await db.run('DELETE FROM reservations WHERE pinId = ? AND campId = ?', [req.params.pinId, req.params.id]);
  await db.run('DELETE FROM pins WHERE id = ? AND campId = ?', [req.params.pinId, req.params.id]);
  res.json({ ok: true });
}));

// Trails
app.post('/api/camps/:id/trails', wrap(async (req, res, db) => {
  const user = requireAuth(req, res); if (!user) return;
  if (profanityFail(res, req.body?.name)) return;
  const points = Array.isArray(req.body?.points) ? req.body.points : [];
  const r = await db.run('INSERT INTO trails (campId, name, color, points, distanceFt, createdAt, createdByUserId) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [req.params.id, limitText(req.body?.name ?? 'Trail', FIELD_LIMITS.textShort), req.body?.color ?? '#C2702E', JSON.stringify(points), trailDistanceFt(points), nowIso(), user.id]);
  const row = await db.get('SELECT * FROM trails WHERE id = ?', [r.lastInsertRowid]);
  res.json(mapTrail(row));
}));
app.put('/api/camps/:id/trails/:trailId/color', wrap(async (req, res, db) => {
  await db.run('UPDATE trails SET color = ? WHERE id = ? AND campId = ?', [req.body?.color ?? '#C2702E', req.params.trailId, req.params.id]);
  const row = await db.get('SELECT * FROM trails WHERE id = ?', [req.params.trailId]);
  if (!row) return bad(res, 404, 'Trail not found.');
  res.json(mapTrail(row));
}));
app.delete('/api/camps/:id/trails/:trailId', wrap(async (req, res, db) => {
  await db.run('DELETE FROM trails WHERE id = ? AND campId = ?', [req.params.trailId, req.params.id]);
  res.json({ ok: true });
}));

// Check-ins
app.get('/api/camps/:id/checkins', wrap(async (req, res, db) => {
  const rows = await db.all('SELECT * FROM checkins WHERE campId = ? ORDER BY checkedInAt DESC', [req.params.id]);
  const out = [];
  for (const r of rows) out.push(mapCheckin(r, await pinLabelFor(db, Number(req.params.id), r.pinId)));
  res.json(out);
}));
app.post('/api/camps/:id/checkins', wrap(async (req, res, db) => {
  const user = requireAuth(req, res); if (!user) return;
  const pinId = Number(req.body?.pinId);
  if (!pinId) return bad(res, 400, 'Stand is required.');
  if (profanityFail(res, req.body?.notes)) return;
  const userName = await myDisplayName(db, req);
  const occupied = await db.get('SELECT * FROM checkins WHERE campId = ? AND pinId = ? AND isActive = 1', [req.params.id, pinId]);
  if (occupied && (occupied as any).userId !== user.id && (occupied as any).userName !== userName) return bad(res, 409, 'That stand is already occupied.');
  if (occupied) return res.json(mapCheckin(occupied, await pinLabelFor(db, Number(req.params.id), pinId)));
  await db.run('UPDATE checkins SET isActive = 0, checkedOutAt = ? WHERE campId = ? AND userId = ? AND isActive = 1', [nowIso(), req.params.id, user.id]);
  await db.run('UPDATE checkins SET isActive = 0, checkedOutAt = ? WHERE campId = ? AND userName = ? AND isActive = 1', [nowIso(), req.params.id, userName]);
  const r = await db.run('INSERT INTO checkins (campId, pinId, userName, userId, notes, checkedInAt, checkedOutAt, isActive) VALUES (?, ?, ?, ?, ?, ?, NULL, 1)',
    [req.params.id, pinId, userName, user.id, limitText(req.body?.notes ?? '', FIELD_LIMITS.textShort), nowIso()]);
  const row = await db.get('SELECT * FROM checkins WHERE id = ?', [r.lastInsertRowid]);
  res.json(mapCheckin(row, await pinLabelFor(db, Number(req.params.id), pinId)));
}));
app.post('/api/camps/:id/checkins/:checkinId/checkout', wrap(async (req, res, db) => {
  await db.run('UPDATE checkins SET isActive = 0, checkedOutAt = ? WHERE id = ? AND campId = ?', [nowIso(), req.params.checkinId, req.params.id]);
  res.json({ ok: true });
}));

// Reservations
app.get('/api/camps/:id/reservations', wrap(async (req, res, db) => {
  const rows = await db.all('SELECT * FROM reservations WHERE campId = ? ORDER BY date ASC, session ASC', [req.params.id]);
  const out = [];
  for (const r of rows) out.push(mapReservation(r, await pinLabelFor(db, Number(req.params.id), r.pinId)));
  res.json(out);
}));
app.post('/api/camps/:id/reservations', wrap(async (req, res, db) => {
  const user = requireAuth(req, res); if (!user) return;
  const b = req.body ?? {};
  const pinId = Number(b.pinId);
  const date = String(b.date ?? '');
  const session = String(b.session ?? 'morning');
  if (!pinId || !date) return bad(res, 400, 'Stand and date are required.');
  if (profanityFail(res, b.note)) return;
  const userName = await myDisplayName(db, req);
  const existing = await db.all('SELECT * FROM reservations WHERE campId = ? AND date = ?', [req.params.id, date]);
  for (const r of existing) {
    if (r.pinId === pinId && sessionsOverlap(r.session, session)) return bad(res, 409, 'That stand is already reserved for that session.');
    if ((r.userId === user.id || r.userName === userName) && r.pinId !== pinId && sessionsOverlap(r.session, session)) return bad(res, 409, 'You already hold another stand for that session.');
  }
  const r = await db.run('INSERT INTO reservations (campId, pinId, userName, userId, date, session, note, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [req.params.id, pinId, userName, user.id, date, session, limitText(b.note ?? '', FIELD_LIMITS.textShort), nowIso()]);
  const row = await db.get('SELECT * FROM reservations WHERE id = ?', [r.lastInsertRowid]);
  res.json(mapReservation(row, await pinLabelFor(db, Number(req.params.id), pinId)));
}));
app.delete('/api/camps/:id/reservations/:resId', wrap(async (req, res, db) => {
  await db.run('DELETE FROM reservations WHERE id = ? AND campId = ?', [req.params.resId, req.params.id]);
  res.json({ ok: true });
}));

// Pinned notes
app.get('/api/camps/:id/notes', wrap(async (req, res, db) => {
  const rows = await db.all('SELECT * FROM notes WHERE campId = ? ORDER BY updatedAt DESC', [req.params.id]);
  res.json(rows.map(mapNote));
}));
app.post('/api/camps/:id/notes', wrap(async (req, res, db) => {
  const user = requireAuth(req, res); if (!user) return;
  const title = limitText(String(req.body?.title ?? '').trim(), FIELD_LIMITS.textShort);
  if (!title) return bad(res, 400, 'Title is required.');
  if (profanityFail(res, title, req.body?.body)) return;
  const authorName = await myDisplayName(db, req);
  const r = await db.run('INSERT INTO notes (campId, title, body, authorName, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
    [req.params.id, title, limitText(req.body?.body ?? '', FIELD_LIMITS.textBody), authorName, nowIso(), nowIso()]);
  const row = await db.get('SELECT * FROM notes WHERE id = ?', [r.lastInsertRowid]);
  res.json(mapNote(row));
}));
app.put('/api/camps/:id/notes/:noteId', wrap(async (req, res, db) => {
  if (profanityFail(res, req.body?.title, req.body?.body)) return;
  await db.run('UPDATE notes SET title = ?, body = ?, updatedAt = ? WHERE id = ? AND campId = ?', [limitText(req.body?.title ?? '', FIELD_LIMITS.textShort), limitText(req.body?.body ?? '', FIELD_LIMITS.textBody), nowIso(), req.params.noteId, req.params.id]);
  const row = await db.get('SELECT * FROM notes WHERE id = ?', [req.params.noteId]);
  if (!row) return bad(res, 404, 'Note not found.');
  res.json(mapNote(row));
}));
app.delete('/api/camps/:id/notes/:noteId', wrap(async (req, res, db) => {
  await db.run('DELETE FROM notes WHERE id = ? AND campId = ?', [req.params.noteId, req.params.id]);
  res.json({ ok: true });
}));

// Chat
app.get('/api/camps/:id/messages', wrap(async (req, res, db) => {
  const rows = await db.all('SELECT * FROM messages WHERE campId = ? ORDER BY createdAt ASC', [req.params.id]);
  res.json(rows.map(mapMessage));
}));
app.post('/api/camps/:id/messages', wrap(async (req, res, db) => {
  const user = requireAuth(req, res); if (!user) return;
  const body = limitText(String(req.body?.body ?? '').trim(), FIELD_LIMITS.textBody);
  if (!body) return bad(res, 400, 'Message is required.');
  if (profanityFail(res, body)) return;
  const authorName = await myDisplayName(db, req);
  const r = await db.run('INSERT INTO messages (campId, authorName, authorUserId, body, createdAt) VALUES (?, ?, ?, ?, ?)', [req.params.id, authorName, user.id, body, nowIso()]);
  const row = await db.get('SELECT * FROM messages WHERE id = ?', [r.lastInsertRowid]);
  res.json(mapMessage(row));
}));
app.delete('/api/camps/:id/messages/:msgId', wrap(async (req, res, db) => {
  await db.run('DELETE FROM messages WHERE id = ? AND campId = ?', [req.params.msgId, req.params.id]);
  res.json({ ok: true });
}));
app.post('/api/camps/:id/messages/:msgId/pin', wrap(async (req, res, db) => {
  const m = await db.get('SELECT * FROM messages WHERE id = ? AND campId = ?', [req.params.msgId, req.params.id]);
  if (!m) return bad(res, 404, 'Message not found.');
  const title = String(m.body).slice(0, 60);
  const r = await db.run('INSERT INTO notes (campId, title, body, authorName, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)', [req.params.id, title, m.body, m.authorName, nowIso(), nowIso()]);
  const row = await db.get('SELECT * FROM notes WHERE id = ?', [r.lastInsertRowid]);
  res.json(mapNote(row));
}));

// Trophy photos
app.get('/api/camps/:id/photos', wrap(async (req, res, db) => {
  const rows = await db.all('SELECT * FROM photos WHERE campId = ? ORDER BY createdAt DESC', [req.params.id]);
  const out = [];
  for (const r of rows) out.push(await photoWithExtras(db, r));
  res.json(out);
}));
app.post('/api/camps/:id/photos', wrap(async (req, res, db) => {
  const user = requireAuth(req, res); if (!user) return;
  const imageUrl = String(req.body?.imageUrl ?? '');
  if (!imageUrl) return bad(res, 400, 'A photo is required.');
  if (profanityFail(res, req.body?.species, req.body?.caption)) return;
  const authorName = await myDisplayName(db, req);
  const r = await db.run('INSERT INTO photos (campId, authorName, authorUserId, species, caption, imageUrl, contentType, harvestClass, weightLbs, antlerScore, antlerPoints, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [req.params.id, authorName, user.id, limitText(req.body?.species ?? '', FIELD_LIMITS.textShort), limitText(req.body?.caption ?? '', FIELD_LIMITS.textBody), imageUrl, 'image/jpeg', req.body?.harvestClass ?? '', req.body?.weightLbs ?? null, req.body?.antlerScore ?? null, req.body?.antlerPoints ?? null, nowIso()]);
  const row = await db.get('SELECT * FROM photos WHERE id = ?', [r.lastInsertRowid]);
  res.json(await photoWithExtras(db, row));
}));
app.put('/api/camps/:id/photos/:photoId', wrap(async (req, res, db) => {
  // Add or fix harvest details on a trophy post (own posts; server trusts
  // the caller in local mode, and ownership is checked in Supabase mode).
  const user = requireAuth(req, res); if (!user) return;
  const cur = await db.get('SELECT * FROM photos WHERE id = ? AND campId = ?', [req.params.photoId, req.params.id]);
  if (!cur) return bad(res, 404, 'Photo not found.');
  if (authConfigured() && (cur as any).authorUserId && (cur as any).authorUserId !== user.id) return bad(res, 403, 'Only the hunter who posted this can edit its details.');
  if (profanityFail(res, req.body?.species, req.body?.caption)) return;
  await db.run('UPDATE photos SET species=?, caption=?, harvestClass=?, weightLbs=?, antlerScore=?, antlerPoints=? WHERE id=? AND campId=?',
    [limitText(req.body?.species ?? cur.species, FIELD_LIMITS.textShort), limitText(req.body?.caption ?? cur.caption, FIELD_LIMITS.textBody), req.body?.harvestClass ?? cur.harvestClass ?? '', req.body?.weightLbs ?? (cur as any).weightLbs ?? null, req.body?.antlerScore ?? (cur as any).antlerScore ?? null, req.body?.antlerPoints ?? (cur as any).antlerPoints ?? null, req.params.photoId, req.params.id]);
  const row = await db.get('SELECT * FROM photos WHERE id = ?', [req.params.photoId]);
  res.json(await photoWithExtras(db, row));
}));
app.post('/api/camps/:id/photos/:photoId/like', wrap(async (req, res, db) => {
  const user = requireAuth(req, res); if (!user) return;
  const userName = await myDisplayName(db, req);
  const existing = await db.get('SELECT * FROM photo_likes WHERE photoId = ? AND userName = ?', [req.params.photoId, userName]);
  if (existing) await db.run('DELETE FROM photo_likes WHERE photoId = ? AND userName = ?', [req.params.photoId, userName]);
  else await db.run('INSERT INTO photo_likes (photoId, userName) VALUES (?, ?)', [req.params.photoId, userName]);
  const row = await db.get('SELECT * FROM photos WHERE id = ?', [req.params.photoId]);
  if (!row) return bad(res, 404, 'Photo not found.');
  res.json(await photoWithExtras(db, row));
}));
app.post('/api/camps/:id/photos/:photoId/comments', wrap(async (req, res, db) => {
  const user = requireAuth(req, res); if (!user) return;
  const body = limitText(String(req.body?.body ?? '').trim(), FIELD_LIMITS.textBody);
  if (!body) return bad(res, 400, 'Comment is required.');
  if (profanityFail(res, body)) return;
  const authorName = await myDisplayName(db, req);
  await db.run('INSERT INTO photo_comments (photoId, authorName, body, createdAt) VALUES (?, ?, ?, ?)', [req.params.photoId, authorName, body, nowIso()]);
  const row = await db.get('SELECT * FROM photos WHERE id = ?', [req.params.photoId]);
  if (!row) return bad(res, 404, 'Photo not found.');
  res.json(await photoWithExtras(db, row));
}));
app.delete('/api/camps/:id/photos/:photoId', wrap(async (req, res, db) => {
  await db.run('DELETE FROM photo_likes WHERE photoId = ?', [req.params.photoId]);
  await db.run('DELETE FROM photo_comments WHERE photoId = ?', [req.params.photoId]);
  await db.run('DELETE FROM photos WHERE id = ? AND campId = ?', [req.params.photoId, req.params.id]);
  res.json({ ok: true });
}));

// Gear
app.get('/api/gear', wrap(async (req, res, db) => {
  const uid = requestUserId(req);
  const rows = await db.all('SELECT * FROM gear ORDER BY name ASC');
  res.json(rows.filter((r: any) => ownsPrivate(r.ownerUserId, uid)).map(mapGear));
}));
app.post('/api/gear', wrap(async (req, res, db) => {
  const user = requireAuth(req, res); if (!user) return;
  const name = limitText(String(req.body?.name ?? '').trim(), FIELD_LIMITS.gearName);
  if (!name) return bad(res, 400, 'Gear name is required.');
  if (profanityFail(res, name, req.body?.brand, req.body?.notes)) return;
  const r = await db.run('INSERT INTO gear (name, category, brand, notes, packed, createdAt, ownerUserId) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [name, req.body?.category ?? 'Other', limitText(req.body?.brand ?? '', FIELD_LIMITS.textShort), limitText(req.body?.notes ?? '', FIELD_LIMITS.textBody), 0, nowIso(), user.id]);
  const row = await db.get('SELECT * FROM gear WHERE id = ?', [r.lastInsertRowid]);
  res.json(mapGear(row));
}));
app.put('/api/gear/:id', wrap(async (req, res, db) => {
  const user = requireAuth(req, res); if (!user) return;
  if (profanityFail(res, req.body?.name, req.body?.brand, req.body?.notes)) return;
  const cur = await db.get('SELECT * FROM gear WHERE id = ?', [req.params.id]);
  if (!cur || !ownsPrivate((cur as any).ownerUserId, user.id)) return bad(res, 404, 'Gear not found.');
  await db.run('UPDATE gear SET name=?, category=?, brand=?, notes=?, packed=? WHERE id=?',
    [limitText(req.body?.name ?? cur.name, FIELD_LIMITS.gearName), req.body?.category ?? cur.category, limitText(req.body?.brand ?? cur.brand, FIELD_LIMITS.textShort), limitText(req.body?.notes ?? cur.notes, FIELD_LIMITS.textBody), req.body?.packed !== undefined ? (req.body.packed ? 1 : 0) : (toBool(cur.packed) ? 1 : 0), req.params.id]);
  const row = await db.get('SELECT * FROM gear WHERE id = ?', [req.params.id]);
  res.json(mapGear(row));
}));
app.delete('/api/gear/:id', wrap(async (req, res, db) => {
  const user = requireAuth(req, res); if (!user) return;
  const cur = await db.get('SELECT * FROM gear WHERE id = ?', [req.params.id]);
  if (!cur || !ownsPrivate((cur as any).ownerUserId, user.id)) return bad(res, 404, 'Gear not found.');
  await db.run('DELETE FROM gear WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

// Hunts
app.get('/api/hunts', wrap(async (req, res, db) => {
  const uid = requestUserId(req);
  const rows = await db.all('SELECT * FROM hunts ORDER BY date DESC');
  res.json(rows.filter((r: any) => ownsPrivate(r.ownerUserId, uid)).map(mapHunt));
}));
app.post('/api/hunts', wrap(async (req, res, db) => {
  const user = requireAuth(req, res); if (!user) return;
  if (profanityFail(res, req.body?.species, req.body?.stand, req.body?.notes)) return;
  const r = await db.run('INSERT INTO hunts (date, species, stand, notes, harvested, campId, createdAt, ownerUserId) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [req.body?.date ?? new Date().toISOString().slice(0, 10), limitText(req.body?.species ?? '', FIELD_LIMITS.textShort), limitText(req.body?.stand ?? '', FIELD_LIMITS.textShort), limitText(req.body?.notes ?? '', FIELD_LIMITS.textBody), req.body?.harvested ? 1 : 0, req.body?.campId ?? null, nowIso(), user.id]);
  const row = await db.get('SELECT * FROM hunts WHERE id = ?', [r.lastInsertRowid]);
  res.json(mapHunt(row));
}));
app.put('/api/hunts/:id', wrap(async (req, res, db) => {
  const user = requireAuth(req, res); if (!user) return;
  if (profanityFail(res, req.body?.species, req.body?.stand, req.body?.notes)) return;
  const cur = await db.get('SELECT * FROM hunts WHERE id = ?', [req.params.id]);
  if (!cur || !ownsPrivate((cur as any).ownerUserId, user.id)) return bad(res, 404, 'Hunt not found.');
  await db.run('UPDATE hunts SET date=?, species=?, stand=?, notes=?, harvested=?, campId=? WHERE id=?',
    [req.body?.date ?? cur.date, limitText(req.body?.species ?? cur.species, FIELD_LIMITS.textShort), limitText(req.body?.stand ?? cur.stand, FIELD_LIMITS.textShort), limitText(req.body?.notes ?? cur.notes, FIELD_LIMITS.textBody), req.body?.harvested !== undefined ? (req.body.harvested ? 1 : 0) : (toBool(cur.harvested) ? 1 : 0), req.body?.campId ?? (cur as any).campId ?? null, req.params.id]);
  const row = await db.get('SELECT * FROM hunts WHERE id = ?', [req.params.id]);
  res.json(mapHunt(row));
}));
app.delete('/api/hunts/:id', wrap(async (req, res, db) => {
  const user = requireAuth(req, res); if (!user) return;
  const cur = await db.get('SELECT * FROM hunts WHERE id = ?', [req.params.id]);
  if (!cur || !ownsPrivate((cur as any).ownerUserId, user.id)) return bad(res, 404, 'Hunt not found.');
  await db.run('DELETE FROM hunts WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

// Licenses & Tags (private to the account)
app.get('/api/licenses', wrap(async (req, res, db) => {
  const user = requireAuth(req, res); if (!user) return;
  const all = await db.all('SELECT * FROM licenses ORDER BY expiryDate ASC');
  const rows = all.filter((r: any) => ownsPrivate(r.ownerUserId, user.id));
  const out = [];
  for (const r of rows) {
    const tags = await db.all('SELECT * FROM license_tags WHERE licenseId = ? ORDER BY createdAt ASC', [r.id]);
    out.push({ ...mapLicense(r), tags: tags.map(mapTag) });
  }
  res.json(out);
}));
app.post('/api/licenses', wrap(async (req, res, db) => {
  const user = requireAuth(req, res); if (!user) return;
  const b = req.body ?? {};
  if (!String(b.state ?? '').trim() || !String(b.kind ?? '').trim()) return bad(res, 400, 'State and kind are required.');
  if (profanityFail(res, b.kind, b.licenseNumber, b.coverage, b.notes)) return;
  const r = await db.run('INSERT INTO licenses (state, kind, licenseNumber, issuedDate, expiryDate, coverage, notes, createdAt, ownerUserId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [b.state, limitText(b.kind, FIELD_LIMITS.textShort), limitText(b.licenseNumber ?? '', FIELD_LIMITS.licenseNumber), b.issuedDate ?? '', b.expiryDate ?? '', limitText(b.coverage ?? '', FIELD_LIMITS.textShort), limitText(b.notes ?? '', FIELD_LIMITS.textBody), nowIso(), user.id]);
  const row = await db.get('SELECT * FROM licenses WHERE id = ?', [r.lastInsertRowid]);
  res.json({ ...mapLicense(row), tags: [] });
}));
app.put('/api/licenses/:id', wrap(async (req, res, db) => {
  const user = requireAuth(req, res); if (!user) return;
  if (profanityFail(res, req.body?.kind, req.body?.licenseNumber, req.body?.coverage, req.body?.notes)) return;
  const cur = await db.get('SELECT * FROM licenses WHERE id = ?', [req.params.id]);
  if (!cur || !ownsPrivate((cur as any).ownerUserId, user.id)) return bad(res, 404, 'License not found.');
  const b = req.body ?? {};
  await db.run('UPDATE licenses SET state=?, kind=?, licenseNumber=?, issuedDate=?, expiryDate=?, coverage=?, notes=? WHERE id=?',
    [b.state ?? cur.state, limitText(b.kind ?? cur.kind, FIELD_LIMITS.textShort), limitText(b.licenseNumber ?? cur.licenseNumber, FIELD_LIMITS.licenseNumber), b.issuedDate ?? cur.issuedDate, b.expiryDate ?? cur.expiryDate, limitText(b.coverage ?? cur.coverage, FIELD_LIMITS.textShort), limitText(b.notes ?? cur.notes, FIELD_LIMITS.textBody), req.params.id]);
  const row = await db.get('SELECT * FROM licenses WHERE id = ?', [req.params.id]);
  const tags = await db.all('SELECT * FROM license_tags WHERE licenseId = ? ORDER BY createdAt ASC', [req.params.id]);
  res.json({ ...mapLicense(row), tags: tags.map(mapTag) });
}));
app.delete('/api/licenses/:id', wrap(async (req, res, db) => {
  const user = requireAuth(req, res); if (!user) return;
  const cur = await db.get('SELECT * FROM licenses WHERE id = ?', [req.params.id]);
  if (!cur || !ownsPrivate((cur as any).ownerUserId, user.id)) return bad(res, 404, 'License not found.');
  await db.run('DELETE FROM license_tags WHERE licenseId = ?', [req.params.id]);
  await db.run('DELETE FROM licenses WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));
app.post('/api/licenses/:id/tags', wrap(async (req, res, db) => {
  const user = requireAuth(req, res); if (!user) return;
  const lic = await db.get('SELECT * FROM licenses WHERE id = ?', [req.params.id]);
  if (!lic || !ownsPrivate((lic as any).ownerUserId, user.id)) return bad(res, 404, 'License not found.');
  const b = req.body ?? {};
  if (!String(b.animal ?? '').trim() || !String(b.tagNumber ?? '').trim()) return bad(res, 400, 'Animal and tag number are required.');
  if (profanityFail(res, b.animal, b.kind, b.tagNumber)) return;
  const r = await db.run('INSERT INTO license_tags (licenseId, animal, kind, tagNumber, filled, filledDate, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [req.params.id, limitText(b.animal, FIELD_LIMITS.textShort), limitText(b.kind ?? '', FIELD_LIMITS.textShort), limitText(b.tagNumber, FIELD_LIMITS.licenseNumber), 0, '', nowIso()]);
  const row = await db.get('SELECT * FROM license_tags WHERE id = ?', [r.lastInsertRowid]);
  res.json(mapTag(row));
}));
app.post('/api/licenses/tags/:tagId/fill', wrap(async (req, res, db) => {
  const user = requireAuth(req, res); if (!user) return;
  const tag = await db.get<any>('SELECT * FROM license_tags WHERE id = ?', [req.params.tagId]);
  if (!tag) return bad(res, 404, 'Tag not found.');
  const lic = await db.get('SELECT * FROM licenses WHERE id = ?', [tag.licenseId]);
  if (!lic || !ownsPrivate((lic as any).ownerUserId, user.id)) return bad(res, 404, 'Tag not found.');
  await db.run('UPDATE license_tags SET filled = 1, filledDate = ? WHERE id = ?', [new Date().toISOString().slice(0, 10), req.params.tagId]);
  const row = await db.get('SELECT * FROM license_tags WHERE id = ?', [req.params.tagId]);
  res.json(mapTag(row));
}));
app.delete('/api/licenses/tags/:tagId', wrap(async (req, res, db) => {
  const user = requireAuth(req, res); if (!user) return;
  const tag = await db.get<any>('SELECT * FROM license_tags WHERE id = ?', [req.params.tagId]);
  if (!tag) return bad(res, 404, 'Tag not found.');
  const lic = await db.get('SELECT * FROM licenses WHERE id = ?', [tag.licenseId]);
  if (!lic || !ownsPrivate((lic as any).ownerUserId, user.id)) return bad(res, 404, 'Tag not found.');
  await db.run('DELETE FROM license_tags WHERE id = ?', [req.params.tagId]);
  res.json({ ok: true });
}));

// Settings (per account; every change saves the moment it is tapped)
const DEFAULT_SETTINGS = { theme: 'system', units: 'imperial', defaultMapView: 'streets', profileVisibility: 'friends', discoverable: true, notifyCampChat: true, notifyTrophyActivity: true, notifyStandActivity: true, notifyCommunity: true, notifyBadges: true, notifyWind: true };
function mapSettings(r: any) {
  if (!r) return { ...DEFAULT_SETTINGS };
  return {
    theme: r.theme ?? 'system', units: r.units ?? 'imperial', defaultMapView: r.defaultMapView ?? 'streets',
    profileVisibility: r.profileVisibility ?? 'friends', discoverable: toBool(r.discoverable ?? 1),
    notifyCampChat: toBool(r.notifyCampChat ?? 1), notifyTrophyActivity: toBool(r.notifyTrophyActivity ?? 1),
    notifyStandActivity: toBool(r.notifyStandActivity ?? 1), notifyCommunity: toBool(r.notifyCommunity ?? 1),
    notifyBadges: toBool(r.notifyBadges ?? 1), notifyWind: toBool(r.notifyWind ?? 1),
  };
}
/** The settings row belonging to the signed-in account (per-account
 *  since the multi-user build-out; local mode keeps its single row). */
async function settingsRowForUser(db: Db, req: AuthedRequest): Promise<any | null> {
  const uid = requestUserId(req);
  if (authConfigured()) {
    if (!uid) return null;
    const rows = await db.all<any>('SELECT * FROM app_settings ORDER BY id ASC');
    return rows.find(r => sameAccount(r.ownerUserId, uid)) ?? null;
  }
  const row = await db.get('SELECT * FROM app_settings ORDER BY id ASC LIMIT 1');
  return row ?? null;
}
app.get('/api/settings', wrap(async (req, res, db) => {
  res.json(mapSettings(await settingsRowForUser(db, req)));
}));
app.put('/api/settings', wrap(async (req, res, db) => {
  const user = requireAuth(req, res); if (!user) return;
  const b = req.body ?? {};
  const existing = await settingsRowForUser(db, req);
  const cur = mapSettings(existing);
  const m = {
    theme: ['system', 'light', 'dark'].includes(b.theme) ? b.theme : cur.theme,
    units: ['imperial', 'metric'].includes(b.units) ? b.units : cur.units,
    defaultMapView: ['streets', 'satellite', 'topo', 'dark', 'grayscale'].includes(b.defaultMapView) ? b.defaultMapView : cur.defaultMapView,
    profileVisibility: ['public', 'friends', 'private'].includes(b.profileVisibility) ? b.profileVisibility : cur.profileVisibility,
    discoverable: b.discoverable !== undefined ? (b.discoverable ? 1 : 0) : (cur.discoverable ? 1 : 0),
    notifyCampChat: b.notifyCampChat !== undefined ? (b.notifyCampChat ? 1 : 0) : (cur.notifyCampChat ? 1 : 0),
    notifyTrophyActivity: b.notifyTrophyActivity !== undefined ? (b.notifyTrophyActivity ? 1 : 0) : (cur.notifyTrophyActivity ? 1 : 0),
    notifyStandActivity: b.notifyStandActivity !== undefined ? (b.notifyStandActivity ? 1 : 0) : (cur.notifyStandActivity ? 1 : 0),
    notifyCommunity: b.notifyCommunity !== undefined ? (b.notifyCommunity ? 1 : 0) : (cur.notifyCommunity ? 1 : 0),
    notifyBadges: b.notifyBadges !== undefined ? (b.notifyBadges ? 1 : 0) : (cur.notifyBadges ? 1 : 0),
    notifyWind: b.notifyWind !== undefined ? (b.notifyWind ? 1 : 0) : (cur.notifyWind ? 1 : 0),
  };
  if (existing) {
    await db.run('UPDATE app_settings SET theme=?, units=?, defaultMapView=?, profileVisibility=?, discoverable=?, notifyCampChat=?, notifyTrophyActivity=?, notifyStandActivity=?, notifyCommunity=?, notifyBadges=?, notifyWind=? WHERE id=?',
      [m.theme, m.units, m.defaultMapView, m.profileVisibility, m.discoverable, m.notifyCampChat, m.notifyTrophyActivity, m.notifyStandActivity, m.notifyCommunity, m.notifyBadges, m.notifyWind, (existing as any).id]);
  } else {
    await db.run('INSERT INTO app_settings (theme, units, defaultMapView, profileVisibility, discoverable, notifyCampChat, notifyTrophyActivity, notifyStandActivity, notifyCommunity, notifyBadges, notifyWind, ownerUserId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [m.theme, m.units, m.defaultMapView, m.profileVisibility, m.discoverable, m.notifyCampChat, m.notifyTrophyActivity, m.notifyStandActivity, m.notifyCommunity, m.notifyBadges, m.notifyWind, user.id]);
  }
  res.json(mapSettings(await settingsRowForUser(db, req)));
}));

// Badges — computed live from real activity
async function buildActivity(db: Db, uid?: string, sinceIso?: string, untilIso?: string): Promise<Activity> {
  const inRange = (sql: string, params: unknown[]) => db.all(sql, params);
  // Activity is per-account: a hunter's badges come from their own hunts,
  // pins, camps and posts — never from anyone else's.
  const myUid = uid ?? '';
  const profiles = await db.all<any>('SELECT * FROM profile ORDER BY id ASC');
  const myProfile = profiles.find(r => sameAccount(r.ownerUserId, myUid)) ?? (!authConfigured() ? profiles[0] : undefined);
  const myName = myProfile ? `${myProfile.firstName ?? ''} ${myProfile.lastName ?? ''}`.trim() : '';
  const allHunts = await db.all<any>('SELECT * FROM hunts');
  const hunts = allHunts.filter(h => ownsPrivate(h.ownerUserId, myUid));
  const huntsIn = sinceIso ? hunts.filter(h => h.date >= sinceIso.slice(0, 10) && h.date <= (untilIso ?? '9999').slice(0, 10)) : hunts;
  const harvested = hunts.filter(h => toBool(h.harvested));
  const photos = await db.all<any>('SELECT * FROM photos');
  const cposts = await db.all<any>('SELECT * FROM community_posts');
  // Authorship by account id; the name match is only a fallback for
  // legacy rows that carry no account id at all.
  const isMine = (r: any) => (myUid && sameAccount(r.authorUserId, myUid)) || (!r.authorUserId && !!myName && (r.authorName === myName || r.authorName === myName.split(' ')[0]));
  const myPhotosAll = photos.filter(isMine);
  const myCPostsAll = cposts.filter(isMine);
  // Season-scoped calls (Season Recap) only count in-season activity.
  const inRangeDate = (iso: string) => !sinceIso || (iso >= sinceIso && iso <= (untilIso ?? '9999-12-31'));
  const myPhotos = sinceIso ? myPhotosAll.filter(p => inRangeDate(toIso(p.createdAt))) : myPhotosAll;
  const myCPosts = sinceIso ? myCPostsAll.filter(p => inRangeDate(toIso(p.createdAt))) : myCPostsAll;
  const species = new Set<string>();
  let bucks = 0, does = 0, turkeys = 0;
  // Dated harvest events drive the badges' earned dates. Each event is one
  // harvest — a harvested hunt, or a trophy post (a post is itself a
  // harvest record) — classified exactly as the counts classify it.
  const harvestEvents: { date: string; kind: 'buck' | 'doe' | 'turkey' | null; species: string }[] = [];
  const harvestOf = (cls: string, sp: string, caption: string | undefined, date: string) => {
    // A trophy photo is itself a harvest record. When no harvest class was
    // filled in, infer doe/buck/turkey from the post's own caption
    // (e.g. "Doe - 2025") — that is how the live app awards First Doe.
    let c = (cls || '').toLowerCase();
    if (!c && caption) {
      if (/doe/i.test(caption)) c = 'doe';
      else if (/buck/i.test(caption)) c = 'buck';
      else if (/turkey|gobbler/i.test(caption)) c = 'turkey';
    }
    let kind: 'buck' | 'doe' | 'turkey' | null = null;
    if (c === 'buck' || c.includes('buck')) { bucks++; kind = 'buck'; }
    else if (c === 'doe' || c.includes('doe')) { does++; kind = 'doe'; }
    else if (c === 'turkey' || c.includes('turkey') || c.includes('gobbler') || sp.toLowerCase().includes('turkey')) { turkeys++; kind = 'turkey'; }
    if (sp) species.add(sp);
    harvestEvents.push({ date, kind, species: sp });
  };
  for (const h of harvested) harvestOf('', h.species ?? '', undefined, h.date);
  for (const p of [...myPhotos, ...myCPosts]) harvestOf(p.harvestClass ?? '', p.species ?? '', p.caption ?? '', toIso(p.createdAt).slice(0, 10));
  harvestEvents.sort((x, y) => x.date.localeCompare(y.date));
  const seenSpecies = new Set<string>();
  let thirdSpeciesDate: string | null = null;
  for (const e of harvestEvents) {
    if (e.species) {
      seenSpecies.add(e.species);
      if (seenSpecies.size >= 3 && !thirdSpeciesDate) thirdSpeciesDate = e.date;
    }
  }
  // Season-scoped calls count only in-season harvests.
  const harvestedIn = sinceIso ? harvested.filter(h => h.date >= sinceIso.slice(0, 10) && h.date <= (untilIso ?? '9999').slice(0, 10)) : harvested;
  const isMyWork = (r: any) => (myUid && sameAccount(r.createdByUserId, myUid)) || (!r.createdByUserId && !!myName && r.createdBy === myName);
  const pins = (await db.all<any>('SELECT createdAt, createdBy, createdByUserId FROM pins')).filter(isMyWork);
  const trails = (await db.all<any>('SELECT createdAt, createdByUserId FROM trails')).filter(isMyWork);
  const isMyStand = (r: any) => (myUid && sameAccount(r.userId, myUid)) || (!r.userId && !!myName && r.userName === myName);
  const checkins = (await db.all<any>('SELECT * FROM checkins')).filter(isMyStand);
  const messages = await db.all<any>('SELECT * FROM messages');
  const myMessages = messages.filter(isMine);
  const friends = (await db.all<any>('SELECT createdAt, ownerUserId FROM friends')).filter(r => ownsPrivate(r.ownerUserId, myUid));
  const camps = (await db.all<any>('SELECT createdAt, ownerUserId FROM camps')).filter(r => isOwner(r.ownerUserId, myUid));
  const reservations = (await db.all<any>('SELECT createdAt, userId, userName FROM reservations')).filter(isMyStand);
  let likesReceived = 0;
  for (const p of myPhotos) {
    const l = await db.get<{ c: number }>('SELECT COUNT(*) as c FROM photo_likes WHERE photoId = ?', [p.id]);
    likesReceived += Number(l?.c ?? 0);
  }
  for (const p of myCPosts) {
    const l = await db.get<{ c: number }>('SELECT COUNT(*) as c FROM community_post_likes WHERE postId = ?', [p.id]);
    likesReceived += Number(l?.c ?? 0);
  }
  const profile = myProfile;
  const d10 = (v: unknown) => (v ? toIso(v as string).slice(0, 10) : '');
  return {
    hunts: huntsIn.length, harvests: harvestedIn.length + myPhotos.length + myCPosts.length, bucks, does, turkeys,
    species: [...species], pins: pins.length, trails: trails.length,
    checkins: checkins.length, chatMessages: myMessages.length,
    trophyLikesReceived: likesReceived, friends: friends.length,
    campsCreated: camps.length, reservations: reservations.length,
    trophyPosts: myPhotos.length + myCPosts.length,
    accountCreatedAt: profile?.createdAt ? toIso(profile.createdAt).slice(0, 10) : '',
    dates: {
      hunts: huntsIn.map(h => h.date).filter(Boolean),
      harvests: harvestEvents.map(e => e.date).filter(Boolean),
      bucks: harvestEvents.filter(e => e.kind === 'buck').map(e => e.date),
      does: harvestEvents.filter(e => e.kind === 'doe').map(e => e.date),
      turkeys: harvestEvents.filter(e => e.kind === 'turkey').map(e => e.date),
      pins: pins.map(r => d10(r.createdAt)).filter(Boolean),
      trails: trails.map(r => d10(r.createdAt)).filter(Boolean),
      checkins: checkins.map(r => d10(r.checkedInAt)).filter(Boolean),
      messages: myMessages.map(r => d10(r.createdAt)).filter(Boolean),
      photos: [...myPhotos, ...myCPosts].map(p => d10(p.createdAt)).filter(Boolean),
      friends: friends.map(r => d10(r.createdAt)).filter(Boolean),
      camps: camps.map(r => d10(r.createdAt)).filter(Boolean),
      reservations: reservations.map(r => d10(r.createdAt)).filter(Boolean),
      thirdSpeciesDate,
    },
  };
}
app.get('/api/badges', wrap(async (req, res, db) => {
  const activity = await buildActivity(db, requestUserId(req));
  res.json({ badges: computeBadges(activity), earned: computeBadges(activity).filter(b => b.earned).length, total: 25 });
}));

// Wind + Go-hunt + Hunt now
function parseCachedWind(cached: any): WindSnapshot | null {
  if (!cached?.payload) return null;
  try { return JSON.parse(cached.payload) as WindSnapshot; } catch { return null; }
}
async function getWindForCamp(db: Db, camp: any, forceRefresh: boolean): Promise<WindSnapshot> {
  const cached = await db.get<any>('SELECT * FROM camp_wind_cache WHERE campId = ?', [camp.id]);
  const cachedSnap = parseCachedWind(cached);
  const fresh = cached?.fetchedAt && (Date.now() - new Date(cached.fetchedAt).getTime()) < 60 * 60 * 1000;
  if (!forceRefresh && fresh && cachedSnap) {
    return { ...cachedSnap, stale: false };
  }
  try {
    const snap = await fetchWind(Number(camp.centerLat), Number(camp.centerLng));
    await db.run(
      `INSERT INTO camp_wind_cache (campId, payload, fetchedAt) VALUES (?, ?, ?)
       ON CONFLICT (campId) DO UPDATE SET payload=excluded.payload, fetchedAt=excluded.fetchedAt`,
      [camp.id, JSON.stringify(snap), nowIso()]
    ).catch(async () => {
      const exists = await db.get('SELECT campId FROM camp_wind_cache WHERE campId = ?', [camp.id]);
      if (exists) await db.run('UPDATE camp_wind_cache SET payload = ?, fetchedAt = ? WHERE campId = ?', [JSON.stringify(snap), nowIso(), camp.id]);
      else await db.run('INSERT INTO camp_wind_cache (campId, payload, fetchedAt) VALUES (?, ?, ?)', [camp.id, JSON.stringify(snap), nowIso()]);
    });
    return { ...snap, stale: false };
  } catch (e) {
    // Fresh fetch failed (including the overall timeout budget). Serve the
    // last cached snapshot marked stale instead of 502ing — like the live
    // app. Only 502 when there is no cached snapshot at all. This applies
    // even on a forced refresh: force bypasses the *fresh* cache shortcut,
    // but a failed refresh still falls back to the last saved snapshot.
    if (cachedSnap) return { ...cachedSnap, stale: true };
    throw e;
  }
}
app.get('/api/camps/:id/wind', wrap(async (req, res, db) => {
  const camp = await db.get('SELECT * FROM camps WHERE id = ?', [req.params.id]);
  if (!camp) return bad(res, 404, 'Camp not found.');
  const force = req.query.refresh === '1';
  try {
    const wind = await getWindForCamp(db, camp, force);
    const pins = await db.all('SELECT * FROM pins WHERE campId = ? AND pinType IN (\'stand\', \'blind\')', [req.params.id]);
    const stands = pins.map((p: any) => ({ id: p.id, name: p.name || p.label, bestWinds: parseJson(p.bestWinds, []) }));
    const matching = stands.filter(s => s.bestWinds.includes(wind.currentCompass));
    res.json({
      wind,
      stale: wind.stale ?? false,
      compassWord: compassWord(wind.currentCompass),
      stands: stands.map(s => ({ ...s, goodToday: s.bestWinds.includes(wind.currentCompass) })),
      matchingStandNames: matching.map(s => s.name),
    });
  } catch (e) {
    res.status(502).json({ error: 'Weather is unavailable right now. Try again in a bit. (' + (e instanceof Error ? e.message : String(e)) + ')' });
  }
}));
app.get('/api/camps/:id/go-hunt', wrap(async (req, res, db) => {
  const camp = await db.get('SELECT * FROM camps WHERE id = ?', [req.params.id]);
  if (!camp) return bad(res, 404, 'Camp not found.');
  const profile = await profileRowForUser(db, req);
  try {
    const wind = await getWindForCamp(db, camp, req.query.refresh === '1');
    const pins = await db.all('SELECT * FROM pins WHERE campId = ? AND pinType IN (\'stand\', \'blind\')', [req.params.id]);
    const stands = pins.map((p: any) => ({ id: p.id, name: p.name || p.label, bestWinds: parseJson(p.bestWinds, []) }));
    const score = scoreGoHunt({ wind, stands, huntingState: (profile as any)?.huntingState ?? '' });
    res.json({ campId: camp.id, campName: (camp as any).name, wind, stale: wind.stale ?? false, score });
  } catch (e) {
    res.status(502).json({ error: 'Weather is unavailable right now. Try again in a bit. (' + (e instanceof Error ? e.message : String(e)) + ')' });
  }
}));
app.get('/api/hunt-now', wrap(async (req, res, db) => {
  const profile = await profileRowForUser(db, req);
  let camps = await db.all<any>('SELECT * FROM camps ORDER BY createdAt DESC');
  if (authConfigured()) {
    const uid = requestUserId(req);
    const members = await db.all<any>('SELECT campId, userId FROM camp_members');
    const memberCampIds = new Set(members.filter(m => sameAccount(m.userId, uid)).map(m => m.campId));
    camps = camps.filter(c => isOwner(c.ownerUserId, uid) || memberCampIds.has(c.id));
  }
  const results = [];
  for (const camp of camps) {
    if (!(camp as any).centerLat || !(camp as any).centerLng) continue;
    try {
      const wind = await getWindForCamp(db, camp, false);
      const pins = await db.all('SELECT * FROM pins WHERE campId = ? AND pinType IN (\'stand\', \'blind\')', [(camp as any).id]);
      const stands = pins.map((p: any) => ({ id: p.id, name: p.name || p.label, bestWinds: parseJson(p.bestWinds, []) }));
      const score = scoreGoHunt({ wind, stands, huntingState: (profile as any)?.huntingState ?? '' });
      results.push({ campId: (camp as any).id, campName: (camp as any).name, score: score.score, verdict: score.verdict, reason: score.reason, bestStandId: score.bestStandId, bestStandName: score.bestStandName, windCompass: wind.currentCompass, windSpeedMph: wind.currentSpeedMph, tempF: wind.currentTempF, rutLabel: score.rutLabel, stale: wind.stale ?? false });
    } catch (e) { results.push({ campId: (camp as any).id, campName: (camp as any).name, unavailable: true, detail: e instanceof Error ? e.message : String(e) }); }
  }
  results.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  res.json({ best: results[0] ?? null, camps: results });
}));

// Community
app.get('/api/community/groups', wrap(async (req, res, db) => {
  const uid = requestUserId(req);
  const rows = await db.all('SELECT * FROM community_groups ORDER BY name ASC');
  const out = [];
  for (const r of rows) {
    const mc = await db.get<{ c: number }>('SELECT COUNT(*) as c FROM community_group_members WHERE groupId = ?', [r.id]);
    const memberRows = uid ? await db.all<any>('SELECT userId FROM community_group_members WHERE groupId = ?', [r.id]) : [];
    const joined = memberRows.some((m: any) => sameAccount(m.userId, uid));
    out.push(mapGroup(r, Number(mc?.c ?? 0), joined));
  }
  res.json(out);
}));
app.post('/api/community/groups', wrap(async (req, res, db) => {
  const user = requireAuth(req, res); if (!user) return;
  const name = limitText(String(req.body?.name ?? '').trim(), FIELD_LIMITS.groupName);
  if (!name) return bad(res, 400, 'Group name is required.');
  if (profanityFail(res, name, req.body?.description)) return;
  const existing = await db.get('SELECT * FROM community_groups WHERE LOWER(name) = LOWER(?)', [name]);
  if (existing) return bad(res, 409, 'A group with that name already exists.');
  const creator = await myDisplayName(db, req);
  const r = await db.run('INSERT INTO community_groups (name, state, description, createdBy, createdByUserId, imageUrl, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [name, req.body?.state ?? '', limitText(req.body?.description ?? '', FIELD_LIMITS.groupAbout), creator, user.id, req.body?.imageUrl ?? '', nowIso()]);
  const row = await db.get('SELECT * FROM community_groups WHERE id = ?', [r.lastInsertRowid]);
  await db.run('INSERT INTO community_group_members (groupId, userName, userId, createdAt) VALUES (?, ?, ?, ?)', [row.id, creator, user.id, nowIso()]);
  res.json(mapGroup(row, 1, true));
}));
app.get('/api/community/groups/:id', wrap(async (req, res, db) => {
  const uid = requestUserId(req);
  const row = await db.get('SELECT * FROM community_groups WHERE id = ?', [req.params.id]);
  if (!row) return bad(res, 404, 'Group not found.');
  const members = await db.all('SELECT * FROM community_group_members WHERE groupId = ? ORDER BY createdAt ASC', [req.params.id]);
  const memberRows = uid ? await db.all<any>('SELECT userId FROM community_group_members WHERE groupId = ?', [req.params.id]) : [];
  const joined = memberRows.some((m: any) => sameAccount(m.userId, uid));
  res.json({
    ...mapGroup(row, members.length, joined),
    members: members.map((m: any) => ({ id: m.id, userName: m.userName, userId: m.userId ?? '', isCreator: isOwner((row as any).createdByUserId, m.userId ?? ''), createdAt: toIso(m.createdAt) })),
    isCreator: isOwner((row as any).createdByUserId, uid),
  });
}));
app.put('/api/community/groups/:id', wrap(async (req, res, db) => {
  const user = requireAuth(req, res); if (!user) return;
  const cur = await db.get('SELECT * FROM community_groups WHERE id = ?', [req.params.id]);
  if (!cur) return bad(res, 404, 'Group not found.');
  if (!isOwner((cur as any).createdByUserId, user.id)) return bad(res, 403, 'Only the group creator can change its settings.');
  const b = req.body ?? {};
  const name = b.name !== undefined ? limitText(String(b.name).trim(), FIELD_LIMITS.groupName) : cur.name;
  if (!name) return bad(res, 400, 'Group name is required.');
  if (profanityFail(res, name, b.description)) return;
  if (name.toLowerCase() !== String(cur.name).toLowerCase()) {
    const clash = await db.get('SELECT * FROM community_groups WHERE LOWER(name) = LOWER(?) AND id != ?', [name, req.params.id]);
    if (clash) return bad(res, 409, 'Another group already has that name.');
  }
  await db.run('UPDATE community_groups SET name=?, state=?, description=?, imageUrl=? WHERE id=?',
    [name, b.state ?? cur.state, limitText(b.description ?? cur.description ?? '', FIELD_LIMITS.groupAbout), b.imageUrl ?? cur.imageUrl ?? '', req.params.id]);
  const row = await db.get('SELECT * FROM community_groups WHERE id = ?', [req.params.id]);
  res.json(mapGroup(row, 0, true));
}));
app.delete('/api/community/groups/:id', wrap(async (req, res, db) => {
  const user = requireAuth(req, res); if (!user) return;
  const cur = await db.get('SELECT * FROM community_groups WHERE id = ?', [req.params.id]);
  if (!cur) return bad(res, 404, 'Group not found.');
  if (!isOwner((cur as any).createdByUserId, user.id)) return bad(res, 403, 'Only the group creator can delete this group.');
  const posts = await db.all<{ id: number }>('SELECT id FROM community_posts WHERE groupId = ?', [req.params.id]);
  for (const p of posts) { await db.run('DELETE FROM community_post_likes WHERE postId = ?', [p.id]); await db.run('DELETE FROM community_post_comments WHERE postId = ?', [p.id]); }
  await db.run('DELETE FROM community_posts WHERE groupId = ?', [req.params.id]);
  await db.run('DELETE FROM community_group_members WHERE groupId = ?', [req.params.id]);
  await db.run('DELETE FROM community_groups WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));
app.post('/api/community/groups/:id/join', wrap(async (req, res, db) => {
  const user = requireAuth(req, res); if (!user) return;
  const row = await db.get('SELECT * FROM community_groups WHERE id = ?', [req.params.id]);
  if (!row) return bad(res, 404, 'Group not found.');
  const name = await myDisplayName(db, req);
  const existingRows = await db.all<any>('SELECT * FROM community_group_members WHERE groupId = ?', [req.params.id]);
  const existing = existingRows.find((m: any) => sameAccount(m.userId, user.id));
  if (!existing) await db.run('INSERT INTO community_group_members (groupId, userName, userId, createdAt) VALUES (?, ?, ?, ?)', [req.params.id, name, user.id, nowIso()]);
  res.json({ ok: true });
}));
app.post('/api/community/groups/:id/leave', wrap(async (req, res, db) => {
  const user = requireAuth(req, res); if (!user) return;
  const row = await db.get('SELECT * FROM community_groups WHERE id = ?', [req.params.id]);
  if (!row) return bad(res, 404, 'Group not found.');
  if (isOwner((row as any).createdByUserId, user.id)) return bad(res, 400, 'The creator cannot leave their own group — delete the group instead.');
  await db.run('DELETE FROM community_group_members WHERE groupId = ? AND userId = ?', [req.params.id, user.id]);
  res.json({ ok: true });
}));
app.post('/api/community/groups/:id/members/:memberId/remove', wrap(async (req, res, db) => {
  const user = requireAuth(req, res); if (!user) return;
  const row = await db.get('SELECT * FROM community_groups WHERE id = ?', [req.params.id]);
  if (!row) return bad(res, 404, 'Group not found.');
  if (!isOwner((row as any).createdByUserId, user.id)) return bad(res, 403, 'Only the group creator can remove members.');
  const member = await db.get('SELECT * FROM community_group_members WHERE id = ? AND groupId = ?', [req.params.memberId, req.params.id]);
  if (!member) return bad(res, 404, 'Member not found.');
  if (isOwner((row as any).createdByUserId, (member as any).userId ?? '')) return bad(res, 400, 'The creator cannot be removed.');
  await db.run('DELETE FROM community_group_members WHERE id = ?', [req.params.memberId]);
  res.json({ ok: true });
}));
app.get('/api/community/posts', wrap(async (req, res, db) => {
  const myName = await myDisplayName(db, req);
  const groupId = req.query.groupId ? Number(req.query.groupId) : null;
  const rows = groupId
    ? await db.all('SELECT * FROM community_posts WHERE groupId = ? ORDER BY createdAt DESC', [groupId])
    : await db.all('SELECT * FROM community_posts WHERE groupId IS NULL ORDER BY createdAt DESC');
  const out = [];
  for (const r of rows) out.push(await communityPostWithExtras(db, r, myName));
  res.json(out);
}));
app.post('/api/community/posts', wrap(async (req, res, db) => {
  const user = requireAuth(req, res); if (!user) return;
  const imageUrl = String(req.body?.imageUrl ?? '');
  if (!imageUrl) return bad(res, 400, 'A photo is required.');
  if (profanityFail(res, req.body?.species, req.body?.caption)) return;
  const groupId = req.body?.groupId ? Number(req.body.groupId) : null;
  if (groupId) {
    const member = await db.get('SELECT id FROM community_group_members WHERE groupId = ? AND userId = ?', [groupId, user.id]);
    if (!member && !authConfigured()) { /* local mode: allow */ }
    else if (!member) return bad(res, 403, 'Join the group before posting to it.');
  }
  const authorName = await myDisplayName(db, req);
  const r = await db.run('INSERT INTO community_posts (groupId, authorName, authorUserId, species, caption, imageUrl, harvestClass, weightLbs, antlerScore, antlerPoints, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [groupId, authorName, user.id, limitText(req.body?.species ?? '', FIELD_LIMITS.textShort), limitText(req.body?.caption ?? '', FIELD_LIMITS.textBody), imageUrl, req.body?.harvestClass ?? '', req.body?.weightLbs ?? null, req.body?.antlerScore ?? null, req.body?.antlerPoints ?? null, nowIso()]);
  const row = await db.get('SELECT * FROM community_posts WHERE id = ?', [r.lastInsertRowid]);
  res.json(await communityPostWithExtras(db, row, authorName));
}));
app.put('/api/community/posts/:postId', wrap(async (req, res, db) => {
  const user = requireAuth(req, res); if (!user) return;
  const cur = await db.get('SELECT * FROM community_posts WHERE id = ?', [req.params.postId]);
  if (!cur) return bad(res, 404, 'Post not found.');
  if (authConfigured() && (cur as any).authorUserId && (cur as any).authorUserId !== user.id) return bad(res, 403, 'Only the hunter who posted this can edit its details.');
  if (profanityFail(res, req.body?.species, req.body?.caption)) return;
  await db.run('UPDATE community_posts SET species=?, caption=?, harvestClass=?, weightLbs=?, antlerScore=?, antlerPoints=? WHERE id=?',
    [limitText(req.body?.species ?? cur.species, FIELD_LIMITS.textShort), limitText(req.body?.caption ?? cur.caption, FIELD_LIMITS.textBody), req.body?.harvestClass ?? cur.harvestClass ?? '', req.body?.weightLbs ?? (cur as any).weightLbs ?? null, req.body?.antlerScore ?? (cur as any).antlerScore ?? null, req.body?.antlerPoints ?? (cur as any).antlerPoints ?? null, req.params.postId]);
  const row = await db.get('SELECT * FROM community_posts WHERE id = ?', [req.params.postId]);
  res.json(await communityPostWithExtras(db, row, await myDisplayName(db, req)));
}));
app.post('/api/community/posts/:postId/like', wrap(async (req, res, db) => {
  const user = requireAuth(req, res); if (!user) return;
  const userName = await myDisplayName(db, req);
  const existing = await db.get('SELECT * FROM community_post_likes WHERE postId = ? AND userName = ?', [req.params.postId, userName]);
  if (existing) await db.run('DELETE FROM community_post_likes WHERE postId = ? AND userName = ?', [req.params.postId, userName]);
  else await db.run('INSERT INTO community_post_likes (postId, userName) VALUES (?, ?)', [req.params.postId, userName]);
  const row = await db.get('SELECT * FROM community_posts WHERE id = ?', [req.params.postId]);
  if (!row) return bad(res, 404, 'Post not found.');
  res.json(await communityPostWithExtras(db, row, userName));
}));
app.post('/api/community/posts/:postId/comments', wrap(async (req, res, db) => {
  const user = requireAuth(req, res); if (!user) return;
  const body = limitText(String(req.body?.body ?? '').trim(), FIELD_LIMITS.textBody);
  if (!body) return bad(res, 400, 'Comment is required.');
  if (profanityFail(res, body)) return;
  const authorName = await myDisplayName(db, req);
  await db.run('INSERT INTO community_post_comments (postId, authorName, body, createdAt) VALUES (?, ?, ?, ?)', [req.params.postId, authorName, body, nowIso()]);
  const row = await db.get('SELECT * FROM community_posts WHERE id = ?', [req.params.postId]);
  if (!row) return bad(res, 404, 'Post not found.');
  res.json(await communityPostWithExtras(db, row, authorName));
}));
app.delete('/api/community/posts/:postId', wrap(async (req, res, db) => {
  await db.run('DELETE FROM community_post_likes WHERE postId = ?', [req.params.postId]);
  await db.run('DELETE FROM community_post_comments WHERE postId = ?', [req.params.postId]);
  await db.run('DELETE FROM community_posts WHERE id = ?', [req.params.postId]);
  res.json({ ok: true });
}));

// Leaderboard — totals only, never a breakdown of how points are tallied.
app.get('/api/community/leaderboard', wrap(async (req, res, db) => {
  const profile = await profileRowForUser(db, req);
  const myName = `${(profile as any)?.firstName ?? ''} ${(profile as any)?.lastName ?? ''}`.trim();
  const scope = String(req.query.scope ?? 'everyone');
  const state = String(req.query.state ?? '');
  const groupId = req.query.groupId ? Number(req.query.groupId) : null;
  const season = String(req.query.season ?? 'all');
  const now = new Date();
  const cur = seasonOf(now);
  const posts: TrophyPostInput[] = [];
  const campPhotos = await db.all('SELECT * FROM photos');
  const cPosts = await db.all('SELECT * FROM community_posts');
  const inSeason = (iso: string) => {
    if (season !== 'season') return true;
    const d = new Date(iso);
    return d >= cur.start && d <= cur.end;
  };
  for (const p of campPhotos) {
    if (!inSeason(p.createdAt)) continue;
    const likes = await db.get<{ c: number }>('SELECT COUNT(*) as c FROM photo_likes WHERE photoId = ?', [p.id]);
    const comments = await db.get<{ c: number }>('SELECT COUNT(*) as c FROM photo_comments WHERE photoId = ?', [p.id]);
    posts.push({ authorName: p.authorName, authorId: p.authorUserId ?? null, species: p.species ?? '', harvestClass: p.harvestClass ?? '', weightLbs: p.weightLbs ?? null, antlerScore: p.antlerScore ?? null, antlerPoints: p.antlerPoints ?? null, likes: Number(likes?.c ?? 0), comments: Number(comments?.c ?? 0), createdAt: toIso(p.createdAt) });
  }
  for (const p of cPosts) {
    if (groupId && p.groupId !== groupId) continue;
    if (!inSeason(p.createdAt)) continue;
    const likes = await db.get<{ c: number }>('SELECT COUNT(*) as c FROM community_post_likes WHERE postId = ?', [p.id]);
    const comments = await db.get<{ c: number }>('SELECT COUNT(*) as c FROM community_post_comments WHERE postId = ?', [p.id]);
    posts.push({ authorName: p.authorName, authorId: p.authorUserId ?? null, species: p.species ?? '', harvestClass: p.harvestClass ?? '', weightLbs: p.weightLbs ?? null, antlerScore: p.antlerScore ?? null, antlerPoints: p.antlerPoints ?? null, likes: Number(likes?.c ?? 0), comments: Number(comments?.c ?? 0), createdAt: toIso(p.createdAt) });
  }
  let entries = buildLeaderboard(posts);
  if (scope === 'area') {
    // "My area" = hunters in the same state as the viewer's profile.
    // In this single-profile build that is the profile's hunting state.
    entries = entries.filter(e => e.name === myName);
  } else if (scope === 'state' && state) {
    if (state !== ((profile as any)?.huntingState ?? '')) entries = [];
  }
  const mine = entries.find(e => sameAccount(e.userId, requestUserId(req)) || e.name === myName) ?? null;
  const biggestBucks = posts
    .filter(p => (p.harvestClass || '').toLowerCase() === 'buck' && p.antlerScore)
    .sort((a, b) => (b.antlerScore ?? 0) - (a.antlerScore ?? 0))
    .slice(0, 5)
    .map(p => ({ hunter: p.authorName, antlerScore: p.antlerScore, antlerPoints: p.antlerPoints, species: p.species }));
  res.json({ entries, yourStanding: mine ? { rank: entries.indexOf(mine) + 1, score: mine.score, posts: mine.posts } : null, biggestBucks, seasonLabel: season === 'season' ? cur.label : 'All time' });
}));

// Season Recap — computed fresh from real records; nothing new is stored.
app.get('/api/recap', wrap(async (req, res, db) => {
  const yearParam = req.query.season ? Number(req.query.season) : undefined;
  const now = new Date();
  const cur = seasonOf(now);
  const startYear = yearParam ?? cur.start.getFullYear();
  const start = new Date(startYear, 8, 1);
  const end = new Date(startYear + 1, 7, 31, 23, 59, 59);
  const inSeason = (iso: string) => { const d = new Date(iso); return d >= start && d <= end; };
  // The recap is personal: only the signed-in hunter's own season counts.
  const myUid = requestUserId(req);
  const myNameR = await myDisplayName(db, req);
  const isMyPost = (p: any) => sameAccount(p.authorUserId, myUid) || (!p.authorUserId && !!myNameR && p.authorName === myNameR);
  const hunts = (await db.all('SELECT * FROM hunts')).filter((h: any) => ownsPrivate(h.ownerUserId, myUid) && h.date >= start.toISOString().slice(0, 10) && h.date <= end.toISOString().slice(0, 10));
  const harvested = hunts.filter((h: any) => toBool(h.harvested));
  const daysAfield = new Set(hunts.map((h: any) => h.date)).size;
  const species = [...new Set(hunts.map((h: any) => h.species).filter(Boolean))];
  const photos = (await db.all('SELECT * FROM photos')).filter((p: any) => isMyPost(p) && inSeason(p.createdAt));
  const cPosts = (await db.all('SELECT * FROM community_posts')).filter((p: any) => isMyPost(p) && inSeason(p.createdAt));
  let likes = 0, comments = 0;
  for (const p of photos) {
    const l = await db.get<{ c: number }>('SELECT COUNT(*) as c FROM photo_likes WHERE photoId = ?', [p.id]);
    const c = await db.get<{ c: number }>('SELECT COUNT(*) as c FROM photo_comments WHERE photoId = ?', [p.id]);
    likes += Number(l?.c ?? 0); comments += Number(c?.c ?? 0);
  }
  for (const p of cPosts) {
    const l = await db.get<{ c: number }>('SELECT COUNT(*) as c FROM community_post_likes WHERE postId = ?', [p.id]);
    const c = await db.get<{ c: number }>('SELECT COUNT(*) as c FROM community_post_comments WHERE postId = ?', [p.id]);
    likes += Number(l?.c ?? 0); comments += Number(c?.c ?? 0);
  }
  const allPosts: TrophyPostInput[] = [
    ...photos.map((p: any) => ({ authorName: p.authorName, authorId: p.authorUserId ?? null, species: p.species ?? '', harvestClass: p.harvestClass ?? '', weightLbs: p.weightLbs ?? null, antlerScore: p.antlerScore ?? null, antlerPoints: p.antlerPoints ?? null, likes: 0, comments: 0, createdAt: toIso(p.createdAt) })),
    ...cPosts.map((p: any) => ({ authorName: p.authorName, authorId: p.authorUserId ?? null, species: p.species ?? '', harvestClass: p.harvestClass ?? '', weightLbs: p.weightLbs ?? null, antlerScore: p.antlerScore ?? null, antlerPoints: p.antlerPoints ?? null, likes: 0, comments: 0, createdAt: toIso(p.createdAt) })),
  ];
  const myPosts = allPosts.filter(p => sameAccount(p.authorId, myUid) || (!p.authorId && !!myNameR && (p.authorName === myNameR || p.authorName === myNameR.split(' ')[0])));
  const lb = buildLeaderboard(myPosts);
  const seasonScore = lb.length ? lb[0].score : 0;
  let biggestBuck: number | null = null, heaviest: number | null = null;
  for (const p of myPosts) {
    if ((p.harvestClass || '').toLowerCase() === 'buck' && p.antlerScore) biggestBuck = Math.max(biggestBuck ?? 0, p.antlerScore);
    if (p.weightLbs) heaviest = Math.max(heaviest ?? 0, p.weightLbs);
  }
  const isMyStandR = (r: any) => sameAccount(r.userId, myUid) || (!r.userId && !!myNameR && r.userName === myNameR);
  const checkins = (await db.all('SELECT * FROM checkins')).filter((c: any) => isMyStandR(c) && inSeason(c.checkedInAt));
  const reservations = (await db.all('SELECT * FROM reservations')).filter((r: any) => isMyStandR(r) && r.date >= start.toISOString().slice(0, 10) && r.date <= end.toISOString().slice(0, 10));
  const standsHunted = new Set(checkins.map((c: any) => c.pinId)).size;
  // Badges earned in this season: badges whose underlying activity happened
  // in the season (approximated from season-filtered activity).
  const seasonActivity = await buildActivity(db, requestUserId(req), start.toISOString(), end.toISOString());
  const seasonBadges = computeBadges(seasonActivity).filter(b => b.earned);
  const hasActivity = hunts.length > 0 || photos.length > 0 || cPosts.length > 0 || checkins.length > 0;
  const availableSeasons: number[] = [];
  const allHunts = (await db.all('SELECT date, ownerUserId FROM hunts')).filter((h: any) => ownsPrivate(h.ownerUserId, myUid));
  const allPhotoDates = [...(await db.all('SELECT createdAt, authorUserId FROM photos')), ...(await db.all('SELECT createdAt, authorUserId FROM community_posts'))].filter((p: any) => isMyPost(p));
  for (const h of allHunts) { const y = seasonOf(new Date(h.date + 'T00:00:00')).start.getFullYear(); if (!availableSeasons.includes(y)) availableSeasons.push(y); }
  for (const p of allPhotoDates) { const y = seasonOf(new Date(p.createdAt)).start.getFullYear(); if (!availableSeasons.includes(y)) availableSeasons.push(y); }
  availableSeasons.sort((a, b) => b - a);
  res.json({
    season: seasonLabelFor(startYear), startYear, inProgress: startYear === cur.start.getFullYear(), hasActivity,
    hunts: hunts.length, harvests: harvested.length,
    successRate: hunts.length ? Math.round(harvested.length / hunts.length * 100) : 0,
    daysAfield, species,
    trophyPosts: photos.length + cPosts.length, likes, comments, seasonScore,
    biggestBuck, heaviestLbs: heaviest,
    checkins: checkins.length, reservations: reservations.length, standsHunted,
    badgesEarned: seasonBadges.map(b => ({ id: b.id, name: b.name })),
    photos: photos.map((p: any) => ({ id: p.id, campId: p.campId, species: p.species ?? '', caption: p.caption ?? '', imageUrl: p.imageUrl ?? '', createdAt: toIso(p.createdAt) })),
    availableSeasons,
  });
}));

// Static client (production build) + SPA fallback
const distDir = join(ROOT, 'dist');
if (existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (_req, res) => { res.sendFile(join(distDir, 'index.html')); });
} else {
  app.get('/', (_req, res) => { res.send('Basecamp API is running. Build the client with `npm run build` and restart to serve the app.'); });
}

// Error handler
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err instanceof Error ? err.message : 'Server error.' });
});

export default app;
