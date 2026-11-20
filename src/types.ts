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
export interface Badge { id: string; name: string; description: string; earned: boolean; current: number; target: number; }
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
export const BADGE_MEDALS: Record<string, string> = { founder: '🏅', first_doe: '🦌', camp_founder: '🏕️' };
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
