export type Visibility = 'public' | 'friends' | 'private';
export type PinType = 'stand' | 'camera' | 'parking' | 'water' | 'foodplot' | 'blind' | 'cabin' | 'feeder' | 'harvest' | 'other';
export type Session = 'morning' | 'afternoon' | 'evening' | 'all_day';
export interface Profile { firstName: string; lastName: string; displayName: string; status: string; bio: string; email: string; emailVisibility: Visibility; phone: string; phoneVisibility: Visibility; interests: string[]; huntingState: string; avatarUrl?: string; bannerUrl?: string; pinnedBadges?: string[]; discoverable?: boolean; profileVisibility?: Visibility; createdAt?: string; ownerUserId?: string; }
export interface Friend { id: number; name: string; email?: string; phone?: string; notes?: string; createdAt?: string; }
export interface FriendRequest { id: number; fromUserId: string; fromName: string; toUserId: string; toName: string; status: string; createdAt?: string; }
export interface Friend { id: number; name: string; email?: string; phone?: string; notes?: string; createdAt?: string; }
export interface Camp { id: number; name: string; location: string; acres: string; description?: string; shareCode: string; ownerName: string; ownerUserId?: string; centerLat: number; centerLng: number; mapZoom: number; mapView?: string; memberCount?: number; pinCount?: number; created_at?: string; }
export interface CampMember { id: number; campId: number; name: string; role: 'owner' | 'editor' | 'viewer'; joined: boolean; email?: string; phone?: string; }
export interface Pin { id: number; campId: number; label: string; name: string; pinType: PinType; color: string; lat: number; lng: number; notes?: string; bestWinds: string[]; createdBy?: string; createdAt?: string; }
export interface TrailPoint { lat: number; lng: number; }
export interface Trail { id: number; campId: number; name: string; color: string; points: TrailPoint[]; distanceFt: number; createdAt?: string; }
export interface Checkin { id: number; campId: number; pinId: number; pinLabel?: string; userName: string; notes?: string; checkedInAt: string; checkedOutAt?: string | null; isActive: boolean; }
export interface Reservation { id: number; campId: number; pinId: number; pinLabel?: string; userName: string; date: string; session: Session; note?: string; createdAt?: string; }
export interface CampNote { id: number; campId: number; title: string; body: string; authorName: string; createdAt: string; updatedAt: string; }
export interface CampMessage { id: number; campId: number; authorName: string; body: string; createdAt: string; }
export interface PhotoComment { id: number; photoId: number; authorName: string; body: string; createdAt: string; }
export interface Photo { id: number; campId: number; authorName: string; species: string; caption: string; imageUrl: string; imageAvailable?: boolean; likeCount: number; likedBy: string[]; comments: PhotoComment[]; harvestClass?: string; weightLbs?: number | null; antlerScore?: number | null; antlerPoints?: number | null; createdAt: string; }
export interface GearItem { id: number; name: string; category: string; brand?: string; notes?: string; packed: boolean; createdAt?: string; }
export interface Hunt { id: number; date: string; species: string; stand?: string; notes?: string; harvested?: boolean; campId?: number | null; createdAt?: string; }
export interface LicenseTag { id: number; licenseId: number; animal: string; kind: string; tagNumber: string; filled: boolean; filledDate?: string; createdAt?: string; }
export interface License { id: number; state: string; kind: string; licenseNumber: string; issuedDate: string; expiryDate: string; coverage: string; notes: string; tags: LicenseTag[]; createdAt?: string; }
export interface AppSettings { theme: 'system' | 'light' | 'dark'; units: 'imperial' | 'metric'; defaultMapView: string; profileVisibility: Visibility; discoverable: boolean; notifyCampChat: boolean; notifyTrophyActivity: boolean; notifyStandActivity: boolean; notifyCommunity: boolean; notifyBadges: boolean; notifyWind: boolean; }
export interface Badge { id: string; name: string; description: string; earned: boolean; current: number; target: number; earnedAt?: string | null; }
export interface CommunityGroup { id: number; name: string; state: string; description: string; createdBy: string; createdByUserId: string; imageUrl: string; memberCount: number; joined: boolean; createdAt?: string; }
export interface CommunityGroupMember { id: number; userName: string; userId: string; isCreator: boolean; createdAt?: string; }
export interface CommunityGroupDetail extends CommunityGroup { members: CommunityGroupMember[]; isCreator: boolean; }
export interface CommunityPost { id: number; groupId: number | null; authorName: string; species: string; caption: string; imageUrl: string; likeCount: number; likedBy: string[]; liked?: boolean; comments: PhotoComment[]; harvestClass?: string; weightLbs?: number | null; antlerScore?: number | null; antlerPoints?: number | null; createdAt: string; }
export interface LeaderboardEntry { name: string; userId?: string | null; score: number; posts: number; species: string[]; biggestBuck: number | null; heaviestLbs: number | null; }
export interface WindPeriod { key: string; label: string; compass: string; dirDeg: number; speedMph: number; }
export interface WindSnapshot { asOf: string; timezone: string; currentCompass: string; currentDirDeg: number; currentSpeedMph: number; currentGustMph: number; currentTempF: number; todayHighF: number; todayLowF: number; periods: WindPeriod[]; source: string; stale?: boolean; }
export interface WindData { wind: WindSnapshot; compassWord: string; stands: { id: number; name: string; bestWinds: string[]; goodToday: boolean }[]; matchingStandNames: string[]; stale?: boolean; }
export interface GoHuntScore { score: number; verdict: string; reason: string; bestStandId: number | null; bestStandName: string | null; breakdown: { wind: number; rut: number; temp: number; moon: number }; rutLabel: string; moonName: string; }
export interface HuntNowCamp { campId: number; campName: string; score?: number; verdict?: string; reason?: string; bestStandId?: number | null; bestStandName?: string | null; windCompass?: string; windSpeedMph?: number; tempF?: number; rutLabel?: string; unavailable?: boolean; stale?: boolean; detail?: string; }
export interface SeasonRecap { season: string; startYear: number; inProgress: boolean; hasActivity: boolean; hunts: number; harvests: number; successRate: number; daysAfield: number; species: string[]; trophyPosts: number; likes: number; comments: number; seasonScore: number; biggestBuck: number | null; heaviestLbs: number | null; checkins: number; reservations: number; standsHunted: number; badgesEarned: { id: string; name: string }[]; photos: { id: number; campId: number; species: string; caption: string; imageUrl: string; createdAt: string }[]; availableSeasons: number[]; }
export const HARVEST_CLASSES = ['', 'Buck', 'Doe', 'Turkey', 'Bear', 'Elk', 'Other'];
// Drawn badge glyphs (24x24, stroke style) — the same glyph shows on the
// metallic earned medal (cream) and on the flat locked disc (sage). INK is
// replaced with the ink colour for filled details.
export const BADGE_GLYPHS: Record<string, string> = {
  founder: '<path d="M6 21V4"/><path d="M6 5h11l-2.5 3.5L17 12H6"/>',
  first_hunt: '<ellipse cx="12" cy="15.5" rx="4.2" ry="3.4"/><circle cx="5.6" cy="10.6" r="1.7"/><circle cx="9.3" cy="7.7" r="1.7"/><circle cx="13.9" cy="7.7" r="1.7"/><circle cx="17.7" cy="10.6" r="1.7"/>',
  first_harvest: '<circle cx="12" cy="12" r="6.5"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4"/><circle cx="12" cy="12" r="1.3" fill="INK" stroke="none"/>',
  first_buck: '<path d="M10 21c0-5-1-8-3.5-10.5M6.5 10.5C5 9 4.5 6.5 5 4M6.5 10.5c1.5-1 2.1-3 1.9-5M14 21c0-5 1-8 3.5-10.5M17.5 10.5c1.5-1.5 2-4 1.5-6.5M17.5 10.5c-1.5-1-2.1-3-1.9-5"/>',
  first_doe: '<path d="M7 3.5h10V10c0 1.8-.8 2.8-1.3 4.2l-.8 4.3a1.9 1.9 0 0 1-3.8 0l-.8-4.3C7.8 12.8 7 11.8 7 10Z"/><circle cx="10.2" cy="10.8" r="1.05" fill="INK" stroke="none"/><circle cx="13.8" cy="10.8" r="1.05" fill="INK" stroke="none"/><path d="M7 5.2 4.6 4M17 5.2 19.4 4"/>',
  first_turkey: '<path d="M19.5 4.5C14 4.8 8.6 8.6 6.9 14.7L5 21"/><path d="M7.2 14.3c3.8-.3 7.3-2.4 9.6-5.6"/><path d="M9.4 12.6l3.8-.4M11.3 9.9l3.6-.5M13.4 7.5l3.3-.6"/>',
  seasoned_hunter: '<path d="M12 3.5l2.5 5.2 5.7.7-4.2 3.9 1.1 5.6L12 16.2l-5.1 2.7L8 13.3 3.8 9.4l5.7-.7Z"/>',
  full_freezer: '<path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9"/><circle cx="12" cy="12" r="1.6"/>',
  camp_founder: '<path d="M12 4 22 20H2Z"/><path d="M12 12l4 8H8Z"/>',
  trailblazer: '<path d="M4 20c5-1.5 6-4.5 6-8s2-6 10-7" stroke-dasharray="3 3.4"/><circle cx="4" cy="20" r="1.5" fill="INK" stroke="none"/><circle cx="20" cy="5" r="1.5" fill="INK" stroke="none"/>',
  pathfinder: '<path d="M12 21s-6.5-5.6-6.5-10.5a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21Z"/><circle cx="12" cy="10.5" r="2.3"/>',
  in_the_stand: '<path d="M9 3v18M15 3v18M9 8h6M9 13h6M9 18h6"/>',
  planned_ahead: '<rect x="3.5" y="5.5" width="17" height="15" rx="2"/><path d="M3.5 10.2h17M8 3.5v4M16 3.5v4"/><path d="M9 16.3l2.1 2.1 3.9-4"/>',
  trophy_wall: '<path d="M7 4h10v5a5 5 0 0 1-10 0Z"/><path d="M7 5.2H4.6A2.4 2.4 0 0 0 6.9 9M17 5.2h2.4A2.4 2.4 0 0 1 17.1 9"/><path d="M12 14v2.5M8.5 20.5h7M10 16.5h4"/>',
  campfire_voice: '<path d="M12 3.5c1.2 3.2-2.6 5-2.6 7.7a2.6 2.6 0 0 0 5.2 0c0-1-.5-1.9-1.1-2.7 2.1.9 3.7 2.9 3.7 5.3a5.2 5.2 0 0 1-10.4 0C6.8 8.6 11 6.7 12 3.5Z"/><path d="M4.5 20.8 19.5 18M4.5 18l15 2.8"/>',
  good_company: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 20c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="17" cy="9.5" r="2.6"/><path d="M15.6 15.3c2.3.2 4.1 1.8 4.7 4.2"/>',
  veteran_hunter: '<path d="M12 3l7 2.5V11c0 4.8-3 8.4-7 10-4-1.6-7-5.2-7-10V5.5Z"/><path d="M9 11.5l2.2 2.2 4.3-4.2"/>',
  deadeye: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.8"/><circle cx="12" cy="12" r="1.4" fill="INK" stroke="none"/>',
  grand_slam: '<path d="M4 18.5 3 8l5.5 4L12 5l3.5 7L21 8l-1 10.5Z"/><path d="M4.5 21h15"/>',
  cartographer: '<path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6 9 4Z"/><path d="M9 4v14M15 6v14"/><path d="M6.8 14.8c2.2-4.2 5-1.8 6.6-4.4" stroke-dasharray="2.4 2.6"/>',
  trail_master: '<path d="M3 20c3-4.5 6-6 9-6s6 1.5 9 5"/><path d="M12 14V4"/><path d="M12 4h7l-2 2.8L19 9.6h-7"/>',
  stand_regular: '<path d="M20 15.5A8.5 8.5 0 1 1 8.5 4a7 7 0 0 0 11.5 11.5Z"/>',
  storyteller: '<path d="M12 6.5C10 4.8 6.8 4.2 4 4.8v13.5c2.8-.6 6-.1 8 1.7 2-1.8 5.2-2.3 8-1.7V4.8C17.2 4.2 14 4.8 12 6.5Z"/><path d="M12 6.5V20"/>',
  crowd_favorite: '<path d="M12 20.5S4 15.3 4 9.6A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 8 2.6c0 5.7-8 10.9-8 10.9Z"/>',
  inner_circle: '<circle cx="12" cy="12" r="2.6"/><circle cx="12" cy="4.6" r="1.6"/><circle cx="18.4" cy="9.4" r="1.6"/><circle cx="16.1" cy="18" r="1.6"/><circle cx="7.9" cy="18" r="1.6"/><circle cx="5.6" cy="9.4" r="1.6"/>',
};
function starburstPoints(spikes = 36, outer = 49, inner = 45.8): string {
  const pts: string[] = [];
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI * i) / spikes - Math.PI / 2;
    pts.push(`${(50 + r * Math.cos(a)).toFixed(1)},${(50 + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
}
// The award medallion as an SVG string: earned badges are glossy metallic
// medals (gold for Founder, bronze for the rest) with a beaded ring,
// starburst seal and ribbon tails; locked badges are flat dark discs with
// a dashed ring and a lock chip. Matches the Muse app's badge design.
export function badgeMedalSvg(id: string, earned: boolean, mini = false): string {
  const glyph = BADGE_GLYPHS[id] ?? BADGE_GLYPHS.founder;
  if (!earned) {
    const g = glyph.replaceAll('INK', '#9db09a');
    return `<svg viewBox="0 0 100 100" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="45" fill="#243527"/><circle cx="50" cy="50" r="38.5" fill="none" stroke="#51644f" stroke-width="1.6" stroke-dasharray="4.5 4.5"/><g transform="translate(33.5,33.5) scale(1.375)" fill="none" stroke="#9db09a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${g}</g><g transform="translate(74,74)"><circle r="12.5" fill="#10190f" stroke="#3d4f3c"/><path d="M-4 1.5V-1.8a4 4 0 0 1 8 0v3.3" fill="none" stroke="#cfd8cc" stroke-width="1.8"/><rect x="-6" y="1" width="12" height="9.5" rx="2" fill="#cfd8cc"/><circle cy="5.5" r="1.4" fill="#10190f"/></g></svg>`;
  }
  const gold = id === 'founder';
  const face = gold ? ['#ffedb0', '#f6c945', '#d29a26'] : ['#f2c184', '#c08a44', '#8a5a26'];
  const seal = gold ? '#c9932f' : '#7c4a21';
  const ring = gold ? '#8a5a13' : '#5f3c17';
  const beads = gold ? 'rgba(255,246,205,.95)' : 'rgba(255,232,196,.9)';
  const gid = `bgm-${id}-${gold ? 'g' : 'b'}`;
  const g = glyph.replaceAll('INK', '#fff7e0');
  const ribbons = mini ? '' : '<path d="M36 72h12l-3 34-4.8-5.4L35 106Z" fill="#a33327"/><path d="M52 72h12l3 34-4.8-5.4L57 106Z" fill="#8e2b20"/>';
  return `<svg viewBox="0 0 100 ${mini ? 100 : 116}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="${gid}" cx="38%" cy="30%" r="85%"><stop offset="0%" stop-color="${face[0]}"/><stop offset="55%" stop-color="${face[1]}"/><stop offset="100%" stop-color="${face[2]}"/></radialGradient></defs>${ribbons}<polygon points="${starburstPoints()}" fill="${seal}"/><circle cx="50" cy="50" r="39" fill="url(#${gid})" stroke="${ring}" stroke-width="1.6"/><circle cx="50" cy="50" r="34.5" fill="none" stroke="${beads}" stroke-width="2.6" stroke-linecap="round" stroke-dasharray="0.1 5.03"/><circle cx="50" cy="50" r="30.5" fill="none" stroke="rgba(90,55,10,.45)" stroke-width="1"/><ellipse cx="36" cy="31" rx="19" ry="11" fill="#ffffff" opacity="0.16"/><g transform="translate(33.5,33.5) scale(1.375)" fill="none" stroke="#fff7e0" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${g}</g></svg>`;
}
export function badgeEmoji(id: string): string {
  const map: Record<string, string> = {
    first_hunt: '🎯', first_harvest: '🦌', first_buck: '🦌', first_doe: '🦌', first_turkey: '🦃',
    seasoned_hunter: '🎖️', full_freezer: '🧊', camp_founder: '🏕️', trailblazer: '📸', pathfinder: '📍',
    in_the_stand: '🪜', planned_ahead: '📅', trophy_wall: '🖼️', campfire_voice: '🔥', good_company: '🤝',
    founder: '🏅', veteran_hunter: '⭐', deadeye: '🎯', grand_slam: '🏆', cartographer: '🗺️',
    trail_master: '🥾', stand_regular: '🌙', storyteller: '📖', crowd_favorite: '❤️', inner_circle: '⭕',
  };
  return map[id] ?? '🏅';
}
export function fmtSpeed(mph: number, units: 'imperial' | 'metric'): string { return units === 'metric' ? `${Math.round(mph * 1.60934)} km/h` : `${Math.round(mph)} mph`; }
export function fmtTempF(f: number, units: 'imperial' | 'metric'): string { return units === 'metric' ? `${Math.round((f - 32) * 5 / 9)}°C` : `${Math.round(f)}°F`; }
export function fmtDistanceUnits(ft: number, units: 'imperial' | 'metric'): string {
  if (units === 'metric') { const km = ft * 0.0003048; return km >= 1 ? `${km.toFixed(2)} km` : `${Math.round(ft * 0.3048)} m`; }
  return fmtDistance(ft);
}
export interface CampDetail { camp: Camp; members: CampMember[]; pins: Pin[]; trails: Trail[]; }
// Pin types in the Muse app's order, each with its signature colour — the
// colour its symbol pin carries in the type picker.
export const PIN_TYPES: { type: PinType; label: string; color: string }[] = [
  { type: 'stand', label: 'Stand', color: '#C2702E' },
  { type: 'blind', label: 'Blind', color: '#8A5A33' },
  { type: 'cabin', label: 'Camp / cabin', color: '#2E4034' },
  { type: 'water', label: 'Water', color: '#3F7FBF' },
  { type: 'foodplot', label: 'Food plot', color: '#5D7D4F' },
  { type: 'parking', label: 'Parking / gate', color: '#7D8B74' },
  { type: 'feeder', label: 'Feeder', color: '#C9932F' },
  { type: 'camera', label: 'Trail camera', color: '#7B4FA6' },
  { type: 'harvest', label: 'Harvest site', color: '#C23B2E' },
  { type: 'other', label: 'Other', color: '#4A4A48' },
];
// White line glyphs drawn inside the teardrop head (24x24 box, stroke white).
export const PIN_GLYPHS: Record<PinType, string> = {
  stand: '<path d="M9 3v18M15 3v18M9 8h6M9 13h6M9 18h6"/>',
  blind: '<path d="M12 4 22 20H2Z"/><path d="M12 13l3.5 7h-7Z"/>',
  cabin: '<path d="M4 11 12 4l8 7"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/>',
  water: '<path d="M12 3c0 0-6.5 7.2-6.5 11a6.5 6.5 0 0 0 13 0C18.5 10.2 12 3 12 3Z"/>',
  foodplot: '<path d="M12 21v-8"/><path d="M12 13c0-4-3-6.5-8-6.5 0 4.5 3 7 8 6.5Z"/><path d="M12 10c0-3.5 2.5-5.5 7-5.5 0 4-2.5 6-7 5.5Z"/>',
  parking: '<text x="12" y="17.5" text-anchor="middle" font-size="14" font-weight="700" fill="#fff" stroke="none">P</text>',
  feeder: '<path d="M5 4h14l-2.5 6h-9Z"/><path d="M9.5 10 8 20M14.5 10 16 20"/><path d="M6.5 20h11"/>',
  camera: '<rect x="3" y="7" width="18" height="12" rx="2"/><circle cx="12" cy="13" r="3.4"/><path d="M8.5 7 10 4.5h4L15.5 7"/>',
  harvest: '<circle cx="12" cy="12" r="6.5"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4"/><circle cx="12" cy="12" r="1.3" fill="#fff" stroke="none"/>',
  other: '<circle cx="12" cy="12" r="4" fill="#fff" stroke="none"/>',
};
// The teardrop pin as an SVG string — used for the map markers (Leaflet
// divIcon HTML) and, through the TeardropPin component, everywhere in the UI.
export function teardropSvg(type: PinType, color: string, selected = false): string {
  const glyph = PIN_GLYPHS[type] ?? PIN_GLYPHS.other;
  return `<svg viewBox="0 0 64 72" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg"><path d="M32 3C19.3 3 9 13.1 9 25.5 9 42.5 32 69 32 69s23-26.5 23-43.5C55 13.1 44.7 3 32 3Z" fill="${color}" stroke="${selected ? '#C2702E' : '#FFFFFF'}" stroke-width="${selected ? 4.5 : 3}"/><g transform="translate(21.4,14.9) scale(0.88)" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${glyph}</g></svg>`;
}
export function pinTypeColor(type: PinType): string { return PIN_TYPES.find(p => p.type === type)?.color ?? '#C2702E'; }
export const PIN_COLORS = ['#C2702E', '#C23B2E', '#5D7D4F', '#3F7FBF', '#7B4FA6', '#C9932F', '#2F8F86', '#D1608C', '#3C4043', '#8A6D3B'];
export const WIND_DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export const INTEREST_PRESETS = ['Rifle Hunting', 'Bow Hunting', 'Crossbow', 'Muzzleloader', 'Shotgun Hunting', 'Turkey', 'Waterfowl', 'Whitetail Deer', 'Elk', 'Mule Deer', 'Bear', 'Small Game', 'Upland Birds', 'Predator Hunting', 'Fishing', 'Trapping', 'Archery', 'Long Range', 'Hunting Dogs', 'Trail Cameras', 'Food Plots', 'Land Management'];
export const GEAR_CATEGORIES = ['Weapon', 'Ammo', 'Optics', 'Clothing', 'Calls', 'Tree Stand', 'Blind', 'Pack', 'Knife & Tools', 'Safety', 'Other'];
export const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];
export function pinTypeLabel(type: PinType): string { return PIN_TYPES.find(p => p.type === type)?.label ?? type; }
export function fmtDate(iso: string): string { try { return new Date(iso).toLocaleDateString(); } catch { return iso; } }
export function fmtTime(iso: string): string { try { return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch { return iso; } }
export function trailDistanceFt(points: TrailPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    total += 2 * 6371000 * Math.asin(Math.sqrt(h)) * 3.28084;
  }
  return Math.round(total);
}
export function fmtDistance(ft: number): string { if (ft < 5280) return `${Math.round(ft)} ft`; return `${(ft / 5280).toFixed(2)} mi`; }
