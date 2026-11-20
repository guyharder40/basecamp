export type Visibility = 'public' | 'friends' | 'private';
export type PinType = 'stand' | 'camera' | 'parking' | 'water' | 'foodplot' | 'blind' | 'cabin' | 'feeder' | 'harvest';
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
export interface HuntNowCamp { campId: number; campName: string; score?: number; verdict?: string; reason?: string; bestStandId?: number | null; bestStandName?: string | null; windCompass?: string; windSpeedMph?: number; tempF?: number; rutLabel?: string; unavailable?: boolean; stale?: boolean; }
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
export const PIN_TYPES: { type: PinType; label: string; symbol: string }[] = [
  { type: 'stand', label: 'Stand', symbol: '🪜' },
  { type: 'camera', label: 'Trail camera', symbol: '📷' },
  { type: 'parking', label: 'Parking / gate', symbol: 'P' },
  { type: 'water', label: 'Water', symbol: '💧' },
  { type: 'foodplot', label: 'Food plot', symbol: '🌱' },
  { type: 'blind', label: 'Blind', symbol: '⛺' },
  { type: 'cabin', label: 'Cabin', symbol: '🏠' },
  { type: 'feeder', label: 'Feeder', symbol: '🌾' },
  { type: 'harvest', label: 'Harvest', symbol: '🎯' },
];
export const PIN_COLORS = ['#C2702E', '#16A34A', '#2563EB', '#DC2626', '#7C3AED', '#0891B2', '#CA8A04', '#111827'];
export const WIND_DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export const INTEREST_PRESETS = ['Rifle Hunting', 'Bow Hunting', 'Crossbow', 'Muzzleloader', 'Shotgun Hunting', 'Turkey', 'Waterfowl', 'Whitetail Deer', 'Elk', 'Mule Deer', 'Bear', 'Small Game', 'Upland Birds', 'Predator Hunting', 'Fishing', 'Trapping', 'Archery', 'Long Range', 'Hunting Dogs', 'Trail Cameras', 'Food Plots', 'Land Management'];
export const GEAR_CATEGORIES = ['Weapon', 'Ammo', 'Optics', 'Clothing', 'Calls', 'Tree Stand', 'Blind', 'Pack', 'Knife & Tools', 'Safety', 'Other'];
export const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];
export function pinSymbol(type: PinType): string { return PIN_TYPES.find(p => p.type === type)?.symbol ?? '📍'; }
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
