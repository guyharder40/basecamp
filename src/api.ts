import type { AppSettings, Badge, Camp, CampDetail, CampMessage, CampNote, Checkin, CommunityGroup, CommunityGroupDetail, CommunityPost, Friend, FriendRequest, GearItem, GoHuntScore, Hunt, HuntNowCamp, LeaderboardEntry, License, LicenseTag, Photo, Pin, Profile, Reservation, SeasonRecap, Trail, WindData } from './types';
import { accessToken } from './lib/supabase';

async function req<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = await accessToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, { headers, ...opts });
  if (!res.ok) {
    let msg = `Request failed: ${res.status}`;
    try { const j = await res.json(); if (j?.error) msg = j.error; } catch { const txt = await res.text().catch(() => ''); if (txt) msg = txt; }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}
export const api = {
  health: () => req<{ ok: boolean; db: string; auth: string }>('/api/health'),
  authStatus: () => req<{ configured: boolean; signedIn: boolean; userId: string | null; email: string | null; profileLinked: boolean; profileName: string }>('/api/auth/status'),
  getProfile: () => req<Profile>('/api/profile'),
  updateProfile: (p: Partial<Profile>) => req<Profile>('/api/profile', { method: 'PUT', body: JSON.stringify(p) }),
  listFriends: () => req<Friend[]>('/api/friends'),
  addFriend: (f: { name: string; email?: string; phone?: string; notes?: string }) => req<Friend>('/api/friends', { method: 'POST', body: JSON.stringify(f) }),
  removeFriend: (id: number) => req<{ ok: boolean }>(`/api/friends/${id}`, { method: 'DELETE' }),
  listFriendRequests: () => req<FriendRequest[]>('/api/friends/requests'),
  sendFriendRequest: (toName: string, toUserId?: string) => req<FriendRequest>('/api/friends/requests', { method: 'POST', body: JSON.stringify({ toName, toUserId }) }),
  acceptFriendRequest: (id: number) => req<{ ok: boolean }>(`/api/friends/requests/${id}/accept`, { method: 'POST' }),
  declineFriendRequest: (id: number) => req<{ ok: boolean }>(`/api/friends/requests/${id}/decline`, { method: 'POST' }),
  listCamps: () => req<Camp[]>('/api/camps'),
  createCamp: (c: { name: string; location: string; acres: string; centerLat: number; centerLng: number; mapZoom?: number }) => req<Camp>('/api/camps', { method: 'POST', body: JSON.stringify(c) }),
  joinCamp: (code: string) => req<Camp>('/api/camps/join', { method: 'POST', body: JSON.stringify({ code }) }),
  getCampDetail: (id: number) => req<CampDetail>(`/api/camps/${id}`),
  deleteCamp: (id: number) => req<{ ok: boolean }>(`/api/camps/${id}`, { method: 'DELETE' }),
  setCampLocation: (id: number, loc: { centerLat: number; centerLng: number; mapZoom: number }) => req<Camp>(`/api/camps/${id}/location`, { method: 'PUT', body: JSON.stringify(loc) }),
  setCampMapView: (id: number, mapView: string) => req<{ ok: boolean; mapView: string }>(`/api/camps/${id}/map-view`, { method: 'PUT', body: JSON.stringify({ mapView }) }),
  inviteMember: (campId: number, m: { name: string; email?: string; phone?: string; role?: string }) => req<unknown>(`/api/camps/${campId}/members`, { method: 'POST', body: JSON.stringify(m) }),
  removeMember: (campId: number, memberId: number) => req<{ ok: boolean }>(`/api/camps/${campId}/members/${memberId}`, { method: 'DELETE' }),
  createPin: (campId: number, p: Partial<Pin>) => req<Pin>(`/api/camps/${campId}/pins`, { method: 'POST', body: JSON.stringify(p) }),
  updatePin: (campId: number, pinId: number, p: Partial<Pin>) => req<Pin>(`/api/camps/${campId}/pins/${pinId}`, { method: 'PUT', body: JSON.stringify(p) }),
  deletePin: (campId: number, pinId: number) => req<{ ok: boolean }>(`/api/camps/${campId}/pins/${pinId}`, { method: 'DELETE' }),
  createTrail: (campId: number, t: { name: string; color: string; points: { lat: number; lng: number }[] }) => req<Trail>(`/api/camps/${campId}/trails`, { method: 'POST', body: JSON.stringify(t) }),
  updateTrailColor: (campId: number, trailId: number, color: string) => req<Trail>(`/api/camps/${campId}/trails/${trailId}/color`, { method: 'PUT', body: JSON.stringify({ color }) }),
  deleteTrail: (campId: number, trailId: number) => req<{ ok: boolean }>(`/api/camps/${campId}/trails/${trailId}`, { method: 'DELETE' }),
  listCheckins: (campId: number) => req<Checkin[]>(`/api/camps/${campId}/checkins`),
  checkIn: (campId: number, body: { pinId: number; userName?: string; notes?: string }) => req<Checkin>(`/api/camps/${campId}/checkins`, { method: 'POST', body: JSON.stringify(body) }),
  checkOut: (campId: number, checkinId: number) => req<{ ok: boolean }>(`/api/camps/${campId}/checkins/${checkinId}/checkout`, { method: 'POST' }),
  listReservations: (campId: number) => req<Reservation[]>(`/api/camps/${campId}/reservations`),
  reserveStand: (campId: number, body: { pinId: number; userName?: string; date: string; session: string; note?: string }) => req<Reservation>(`/api/camps/${campId}/reservations`, { method: 'POST', body: JSON.stringify(body) }),
  cancelReservation: (campId: number, id: number) => req<{ ok: boolean }>(`/api/camps/${campId}/reservations/${id}`, { method: 'DELETE' }),
  listNotes: (campId: number) => req<CampNote[]>(`/api/camps/${campId}/notes`),
  createNote: (campId: number, body: { title: string; body: string; authorName?: string }) => req<CampNote>(`/api/camps/${campId}/notes`, { method: 'POST', body: JSON.stringify(body) }),
  updateNote: (campId: number, id: number, body: { title: string; body: string }) => req<CampNote>(`/api/camps/${campId}/notes/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteNote: (campId: number, id: number) => req<{ ok: boolean }>(`/api/camps/${campId}/notes/${id}`, { method: 'DELETE' }),
  listMessages: (campId: number) => req<CampMessage[]>(`/api/camps/${campId}/messages`),
  sendMessage: (campId: number, body: { authorName?: string; body: string }) => req<CampMessage>(`/api/camps/${campId}/messages`, { method: 'POST', body: JSON.stringify(body) }),
  deleteMessage: (campId: number, id: number) => req<{ ok: boolean }>(`/api/camps/${campId}/messages/${id}`, { method: 'DELETE' }),
  pinMessage: (campId: number, id: number) => req<CampNote>(`/api/camps/${campId}/messages/${id}/pin`, { method: 'POST' }),
  listPhotos: (campId: number) => req<Photo[]>(`/api/camps/${campId}/photos`),
  postPhoto: (campId: number, body: { authorName?: string; species: string; caption: string; imageUrl: string; harvestClass?: string; weightLbs?: number | null; antlerScore?: number | null; antlerPoints?: number | null }) => req<Photo>(`/api/camps/${campId}/photos`, { method: 'POST', body: JSON.stringify(body) }),
  updatePhoto: (campId: number, photoId: number, body: Partial<Photo>) => req<Photo>(`/api/camps/${campId}/photos/${photoId}`, { method: 'PUT', body: JSON.stringify(body) }),
  toggleLike: (campId: number, photoId: number, userName?: string) => req<Photo>(`/api/camps/${campId}/photos/${photoId}/like`, { method: 'POST', body: JSON.stringify({ userName }) }),
  addPhotoComment: (campId: number, photoId: number, body: { authorName?: string; body: string }) => req<Photo>(`/api/camps/${campId}/photos/${photoId}/comments`, { method: 'POST', body: JSON.stringify(body) }),
  deletePhoto: (campId: number, photoId: number) => req<{ ok: boolean }>(`/api/camps/${campId}/photos/${photoId}`, { method: 'DELETE' }),
  listGear: () => req<GearItem[]>('/api/gear'),
  createGear: (g: { name: string; category: string; brand?: string; notes?: string }) => req<GearItem>('/api/gear', { method: 'POST', body: JSON.stringify(g) }),
  updateGear: (id: number, g: Partial<GearItem>) => req<GearItem>(`/api/gear/${id}`, { method: 'PUT', body: JSON.stringify(g) }),
  deleteGear: (id: number) => req<{ ok: boolean }>(`/api/gear/${id}`, { method: 'DELETE' }),
  listHunts: () => req<Hunt[]>('/api/hunts'),
  createHunt: (h: { date: string; species: string; stand?: string; notes?: string; harvested?: boolean; campId?: number | null }) => req<Hunt>('/api/hunts', { method: 'POST', body: JSON.stringify(h) }),
  updateHunt: (id: number, h: Partial<Hunt>) => req<Hunt>(`/api/hunts/${id}`, { method: 'PUT', body: JSON.stringify(h) }),
  deleteHunt: (id: number) => req<{ ok: boolean }>(`/api/hunts/${id}`, { method: 'DELETE' }),
  // Licenses & Tags
  listLicenses: () => req<License[]>('/api/licenses'),
  createLicense: (l: Partial<License>) => req<License>('/api/licenses', { method: 'POST', body: JSON.stringify(l) }),
  updateLicense: (id: number, l: Partial<License>) => req<License>(`/api/licenses/${id}`, { method: 'PUT', body: JSON.stringify(l) }),
  deleteLicense: (id: number) => req<{ ok: boolean }>(`/api/licenses/${id}`, { method: 'DELETE' }),
  addTag: (licenseId: number, t: { animal: string; kind?: string; tagNumber: string }) => req<LicenseTag>(`/api/licenses/${licenseId}/tags`, { method: 'POST', body: JSON.stringify(t) }),
  fillTag: (tagId: number) => req<LicenseTag>(`/api/licenses/tags/${tagId}/fill`, { method: 'POST' }),
  deleteTag: (tagId: number) => req<{ ok: boolean }>(`/api/licenses/tags/${tagId}`, { method: 'DELETE' }),
  // Settings & badges
  getSettings: () => req<AppSettings>('/api/settings'),
  updateSettings: (s: Partial<AppSettings>) => req<AppSettings>('/api/settings', { method: 'PUT', body: JSON.stringify(s) }),
  getBadges: () => req<{ badges: Badge[]; earned: number; total: number }>('/api/badges'),
  // Wind / Go-hunt / Hunt now
  getWind: (campId: number, refresh = false) => req<WindData>(`/api/camps/${campId}/wind${refresh ? '?refresh=1' : ''}`),
  getGoHunt: (campId: number) => req<{ campId: number; campName: string; wind: WindData['wind']; score: GoHuntScore }>(`/api/camps/${campId}/go-hunt`),
  getHuntNow: () => req<{ best: HuntNowCamp | null; camps: HuntNowCamp[] }>('/api/hunt-now'),
  // Community
  listGroups: () => req<CommunityGroup[]>('/api/community/groups'),
  createGroup: (g: { name: string; state?: string; description?: string; imageUrl?: string }) => req<CommunityGroup>('/api/community/groups', { method: 'POST', body: JSON.stringify(g) }),
  getGroup: (id: number) => req<CommunityGroupDetail>(`/api/community/groups/${id}`),
  updateGroup: (id: number, g: Partial<CommunityGroup>) => req<CommunityGroup>(`/api/community/groups/${id}`, { method: 'PUT', body: JSON.stringify(g) }),
  deleteGroup: (id: number) => req<{ ok: boolean }>(`/api/community/groups/${id}`, { method: 'DELETE' }),
  joinGroup: (id: number) => req<{ ok: boolean }>(`/api/community/groups/${id}/join`, { method: 'POST' }),
  leaveGroup: (id: number) => req<{ ok: boolean }>(`/api/community/groups/${id}/leave`, { method: 'POST' }),
  removeGroupMember: (groupId: number, memberId: number) => req<{ ok: boolean }>(`/api/community/groups/${groupId}/members/${memberId}/remove`, { method: 'POST' }),
  listCommunityPosts: (groupId?: number | null) => req<CommunityPost[]>(groupId ? `/api/community/posts?groupId=${groupId}` : '/api/community/posts'),
  postCommunity: (body: { groupId?: number | null; species: string; caption: string; imageUrl: string; harvestClass?: string; weightLbs?: number | null; antlerScore?: number | null; antlerPoints?: number | null }) => req<CommunityPost>('/api/community/posts', { method: 'POST', body: JSON.stringify(body) }),
  updateCommunityPost: (postId: number, body: Partial<CommunityPost>) => req<CommunityPost>(`/api/community/posts/${postId}`, { method: 'PUT', body: JSON.stringify(body) }),
  toggleCommunityLike: (postId: number) => req<CommunityPost>(`/api/community/posts/${postId}/like`, { method: 'POST' }),
  addCommunityComment: (postId: number, body: string) => req<CommunityPost>(`/api/community/posts/${postId}/comments`, { method: 'POST', body: JSON.stringify({ body }) }),
  deleteCommunityPost: (postId: number) => req<{ ok: boolean }>(`/api/community/posts/${postId}`, { method: 'DELETE' }),
  getLeaderboard: (q: { scope?: string; state?: string; groupId?: number | null; season?: string }) => {
    const p = new URLSearchParams();
    if (q.scope) p.set('scope', q.scope);
    if (q.state) p.set('state', q.state);
    if (q.groupId) p.set('groupId', String(q.groupId));
    if (q.season) p.set('season', q.season);
    return req<{ entries: LeaderboardEntry[]; yourStanding: { rank: number; score: number; posts: number } | null; biggestBucks: { hunter: string; antlerScore: number | null; antlerPoints: number | null; species: string }[]; seasonLabel: string }>(`/api/community/leaderboard?${p.toString()}`);
  },
  getRecap: (seasonStartYear?: number) => req<SeasonRecap>(seasonStartYear ? `/api/recap?season=${seasonStartYear}` : '/api/recap'),
};
