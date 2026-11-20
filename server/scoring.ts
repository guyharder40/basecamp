// Badges + Leaderboard scoring — server side.
// Badges are computed live from activity (no badges table), matching the
// live app. Leaderboard is a server-computed multi-factor total; the app
// never explains how points are tallied anywhere (no breakdown shown).

export interface BadgeDef {
  id: string; name: string; description: string;
  check: (a: Activity) => boolean;
  progress: (a: Activity) => { current: number; target: number };
}
export interface ActivityDates {
  hunts: string[]; harvests: string[]; bucks: string[]; does: string[]; turkeys: string[];
  pins: string[]; trails: string[]; checkins: string[]; messages: string[]; photos: string[];
  friends: string[]; camps: string[]; reservations: string[];
  thirdSpeciesDate: string | null;
}
export interface Activity {
  hunts: number; harvests: number; bucks: number; does: number; turkeys: number;
  species: string[]; pins: number; trails: number; checkins: number;
  chatMessages: number; trophyLikesReceived: number; friends: number;
  campsCreated: number; reservations: number; trophyPosts: number;
  accountCreatedAt: string; // ISO date of first sign-in / profile creation
  dates: ActivityDates;
}

export const FOUNDER_CUTOFF_DEFAULT = '2027-11-14';
export function founderCutoff(): string {
  return process.env.FOUNDER_CUTOFF || FOUNDER_CUTOFF_DEFAULT;
}

function prog(current: number, target: number) { return { current: Math.min(current, target), target }; }

export const BADGE_DEFS: BadgeDef[] = [
  { id: 'first_hunt', name: 'First Hunt', description: 'Log your first hunt.', check: a => a.hunts >= 1, progress: a => prog(a.hunts, 1) },
  { id: 'first_harvest', name: 'First Harvest', description: 'Record your first harvest.', check: a => a.harvests >= 1, progress: a => prog(a.harvests, 1) },
  { id: 'first_buck', name: 'First Buck', description: 'Take your first buck.', check: a => a.bucks >= 1, progress: a => prog(a.bucks, 1) },
  { id: 'first_doe', name: 'First Doe', description: 'Take your first doe.', check: a => a.does >= 1, progress: a => prog(a.does, 1) },
  { id: 'first_turkey', name: 'First Turkey', description: 'Take your first turkey.', check: a => a.turkeys >= 1, progress: a => prog(a.turkeys, 1) },
  { id: 'seasoned_hunter', name: 'Seasoned Hunter', description: 'Log 10 hunts.', check: a => a.hunts >= 10, progress: a => prog(a.hunts, 10) },
  { id: 'full_freezer', name: 'Full Freezer', description: 'Record 5 harvests.', check: a => a.harvests >= 5, progress: a => prog(a.harvests, 5) },
  { id: 'camp_founder', name: 'Camp Founder', description: 'Create your first camp.', check: a => a.campsCreated >= 1, progress: a => prog(a.campsCreated, 1) },
  { id: 'trailblazer', name: 'Trailblazer', description: 'Post your first trophy photo.', check: a => a.trophyPosts >= 1, progress: a => prog(a.trophyPosts, 1) },
  { id: 'pathfinder', name: 'Pathfinder', description: 'Drop your first pin on a camp map.', check: a => a.pins >= 1, progress: a => prog(a.pins, 1) },
  { id: 'in_the_stand', name: 'In the Stand', description: 'Check in to a stand for the first time.', check: a => a.checkins >= 1, progress: a => prog(a.checkins, 1) },
  { id: 'planned_ahead', name: 'Planned Ahead', description: 'Reserve a stand ahead of time.', check: a => a.reservations >= 1, progress: a => prog(a.reservations, 1) },
  { id: 'trophy_wall', name: 'Trophy Wall', description: 'Post 5 trophy photos.', check: a => a.trophyPosts >= 5, progress: a => prog(a.trophyPosts, 5) },
  { id: 'campfire_voice', name: 'Campfire Voice', description: 'Send 10 camp chat messages.', check: a => a.chatMessages >= 10, progress: a => prog(a.chatMessages, 10) },
  { id: 'good_company', name: 'Good Company', description: 'Have 3 friends.', check: a => a.friends >= 3, progress: a => prog(a.friends, 3) },
  { id: 'founder', name: 'Founder', description: 'Joined in Basecamp’s first year.', check: a => a.accountCreatedAt <= founderCutoff(), progress: a => prog(a.accountCreatedAt <= founderCutoff() ? 1 : 0, 1) },
  { id: 'veteran_hunter', name: 'Veteran Hunter', description: 'Log 25 hunts.', check: a => a.hunts >= 25, progress: a => prog(a.hunts, 25) },
  { id: 'deadeye', name: 'Deadeye', description: 'Record 10 harvests.', check: a => a.harvests >= 10, progress: a => prog(a.harvests, 10) },
  { id: 'grand_slam', name: 'Grand Slam', description: 'Harvest 3 different species.', check: a => a.species.length >= 3, progress: a => prog(a.species.length, 3) },
  { id: 'cartographer', name: 'Cartographer', description: 'Drop 10 pins on camp maps.', check: a => a.pins >= 10, progress: a => prog(a.pins, 10) },
  { id: 'trail_master', name: 'Trail Master', description: 'Create 5 trails.', check: a => a.trails >= 5, progress: a => prog(a.trails, 5) },
  { id: 'stand_regular', name: 'Stand Regular', description: 'Check in to a stand 10 times.', check: a => a.checkins >= 10, progress: a => prog(a.checkins, 10) },
  { id: 'storyteller', name: 'Storyteller', description: 'Send 25 camp chat messages.', check: a => a.chatMessages >= 25, progress: a => prog(a.chatMessages, 25) },
  { id: 'crowd_favorite', name: 'Crowd Favorite', description: 'Earn 5 likes on your trophy photos.', check: a => a.trophyLikesReceived >= 5, progress: a => prog(a.trophyLikesReceived, 5) },
  { id: 'inner_circle', name: 'Inner Circle', description: 'Have 5 friends.', check: a => a.friends >= 5, progress: a => prog(a.friends, 5) },
];

export interface BadgeResult { id: string; name: string; description: string; earned: boolean; current: number; target: number; earnedAt: string | null; }
// The date a badge was earned is the date of the record that reached its
// target — the nth dated record for that kind of activity. Likes carry no
// timestamps in the schema, so Crowd Favorite has no derivable date.
function nth(dates: string[], n: number): string | null {
  if (!dates || dates.length < n) return null;
  return [...dates].sort()[n - 1] ?? null;
}
const EARNED_DATE: Record<string, (a: Activity) => string | null> = {
  first_hunt: a => nth(a.dates.hunts, 1),
  seasoned_hunter: a => nth(a.dates.hunts, 10),
  veteran_hunter: a => nth(a.dates.hunts, 25),
  first_harvest: a => nth(a.dates.harvests, 1),
  full_freezer: a => nth(a.dates.harvests, 5),
  deadeye: a => nth(a.dates.harvests, 10),
  first_buck: a => nth(a.dates.bucks, 1),
  first_doe: a => nth(a.dates.does, 1),
  first_turkey: a => nth(a.dates.turkeys, 1),
  grand_slam: a => a.dates.thirdSpeciesDate,
  camp_founder: a => nth(a.dates.camps, 1),
  trailblazer: a => nth(a.dates.photos, 1),
  trophy_wall: a => nth(a.dates.photos, 5),
  pathfinder: a => nth(a.dates.pins, 1),
  cartographer: a => nth(a.dates.pins, 10),
  trail_master: a => nth(a.dates.trails, 5),
  in_the_stand: a => nth(a.dates.checkins, 1),
  stand_regular: a => nth(a.dates.checkins, 10),
  planned_ahead: a => nth(a.dates.reservations, 1),
  campfire_voice: a => nth(a.dates.messages, 10),
  storyteller: a => nth(a.dates.messages, 25),
  good_company: a => nth(a.dates.friends, 3),
  inner_circle: a => nth(a.dates.friends, 5),
  founder: a => a.accountCreatedAt || null,
  crowd_favorite: () => null,
};
export function computeBadges(a: Activity): BadgeResult[] {
  return BADGE_DEFS.map(d => {
    const p = d.progress(a);
    const earned = d.check(a);
    return { id: d.id, name: d.name, description: d.description, earned, current: p.current, target: p.target, earnedAt: earned ? (EARNED_DATE[d.id]?.(a) ?? null) : null };
  });
}

// --- Leaderboard ---
// Multi-factor total from real trophy posts (community + camp photos):
// harvest count, animal class, antler score/points, weight/size,
// likes and comments received, species variety. Totals only — no breakdown
// is ever returned or displayed.
export interface TrophyPostInput {
  authorName: string; authorId?: string | null;
  species: string; harvestClass?: string; weightLbs?: number | null;
  antlerScore?: number | null; antlerPoints?: number | null;
  likes: number; comments: number; createdAt: string;
}
export function scorePost(p: TrophyPostInput): number {
  let s = 10; // base per harvest post
  const cls = (p.harvestClass || '').toLowerCase();
  if (cls === 'buck') s += 15;
  else if (cls === 'doe') s += 8;
  else if (cls === 'turkey' || cls === 'gobbler') s += 10;
  else if (cls) s += 5;
  if (p.antlerScore) s += Math.min(40, Math.round(p.antlerScore / 4));
  if (p.antlerPoints) s += Math.min(20, p.antlerPoints * 2);
  if (p.weightLbs) s += Math.min(15, Math.round(p.weightLbs / 10));
  s += Math.min(20, p.likes * 2);
  s += Math.min(10, p.comments);
  return s;
}
export interface LeaderboardEntry {
  name: string; userId?: string | null; score: number; posts: number;
  species: string[]; biggestBuck: number | null; heaviestLbs: number | null;
}
export function buildLeaderboard(posts: TrophyPostInput[]): LeaderboardEntry[] {
  const by = new Map<string, LeaderboardEntry & { speciesSet: Set<string> }>();
  for (const p of posts) {
    const key = p.authorId || p.authorName;
    let e = by.get(key);
    if (!e) {
      e = { name: p.authorName, userId: p.authorId ?? null, score: 0, posts: 0, species: [], biggestBuck: null, heaviestLbs: null, speciesSet: new Set() };
      by.set(key, e);
    }
    e.score += scorePost(p);
    e.posts += 1;
    if (p.species) e.speciesSet.add(p.species);
    if ((p.harvestClass || '').toLowerCase() === 'buck' && p.antlerScore) {
      e.biggestBuck = Math.max(e.biggestBuck ?? 0, p.antlerScore);
    }
    if (p.weightLbs) e.heaviestLbs = Math.max(e.heaviestLbs ?? 0, p.weightLbs);
  }
  const out = [...by.values()].map(e => {
    // Species variety bonus, folded into the total (never shown separately).
    e.score += Math.min(20, Math.max(0, e.speciesSet.size - 1) * 5);
    e.species = [...e.speciesSet];
    const { speciesSet, ...rest } = e as any;
    return rest as LeaderboardEntry;
  });
  out.sort((a, b) => b.score - a.score);
  return out;
}

// Season window: Sep 1 – Aug 31.
export function seasonOf(date: Date): { start: Date; end: Date; label: string } {
  const y = date.getMonth() >= 8 ? date.getFullYear() : date.getFullYear() - 1;
  return {
    start: new Date(y, 8, 1),
    end: new Date(y + 1, 7, 31, 23, 59, 59),
    label: `${y}–${String(y + 1).slice(2)}`,
  };
}
export function seasonLabelFor(startYear: number): string {
  return `${startYear}–${String(startYear + 1).slice(2)}`;
}
