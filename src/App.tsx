import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import type { AppSettings, Camp, Friend, GearItem, Hunt, HuntNowCamp, Pin, Profile } from './types';
import { fmtSpeed, fmtTempF } from './types';
import CampDetail, { PinSheet } from './components/CampDetail';
import HuntingCalendar from './components/Calendar';
import ProfileTab from './components/ProfileTab';
import CommunityTab from './components/CommunityTab';
import AuthScreen from './components/AuthScreen';
import { GearTab, HuntsTab, MapsTab } from './components/SimpleTabs';
import { loadAuthConfig, getAuthConfig, getSession, sessionUser, subscribeAuth, signOut } from './lib/supabase';
import { containsBadLanguage, BAD_LANGUAGE_WARNING } from './lib/profanity';
import { HERO_DAWN } from './assets/heroDawn';

type Tab = 'hunts' | 'maps' | 'basecamp' | 'community' | 'profile';
const TABS: { id: Tab; label: string }[] = [
  { id: 'hunts', label: 'Hunts' },
  { id: 'maps', label: 'Maps' },
  { id: 'basecamp', label: 'Basecamp' },
  { id: 'community', label: 'Community' },
  { id: 'profile', label: 'Profile' },
];
const DEFAULT_SETTINGS: AppSettings = { theme: 'system', units: 'imperial', defaultMapView: 'streets', profileVisibility: 'friends', discoverable: true, notifyCampChat: true, notifyTrophyActivity: true, notifyStandActivity: true, notifyCommunity: true, notifyBadges: true, notifyWind: true };

function Hero() {
  return (
    <header className="hero" style={{ backgroundImage: `url(${HERO_DAWN})`, backgroundSize: 'cover', backgroundPosition: 'center 32%', backgroundRepeat: 'no-repeat' }}>
      <div className="hero-text">
        <div className="hero-eyebrow">All-in-one hunting HQ</div>
        <h1>Basecamp</h1>
        <p>Build your camp together — map your pins and trails, then log hunts, check your maps, and keep gear ready.</p>
      </div>
    </header>
  );
}

export default function App() {
  const [tab, setTab] = useState<Tab>(() => (localStorage.getItem('basecamp-tab') as Tab) || 'basecamp');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [camps, setCamps] = useState<Camp[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [gear, setGear] = useState<GearItem[]>([]);
  const [hunts, setHunts] = useState<Hunt[]>([]);
  const [openCampId, setOpenCampId] = useState<number | null>(() => {
    const v = localStorage.getItem('basecamp-open-camp');
    return v ? Number(v) : null;
  });
  const [loading, setLoading] = useState(true);
  const [slowLoading, setSlowLoading] = useState(false);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [campName, setCampName] = useState('');
  const [campLocation, setCampLocation] = useState('');
  const [campAcres, setCampAcres] = useState('');
  const [campLat, setCampLat] = useState('');
  const [campLng, setCampLng] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [huntNow, setHuntNow] = useState<{ best: HuntNowCamp | null; camps: HuntNowCamp[] } | null>(null);
  const [huntNowErr, setHuntNowErr] = useState('');
  const [mapsPinSheet, setMapsPinSheet] = useState<{ campId: number; pin?: Pin; lat: number; lng: number } | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  // Runtime auth config (fetched from GET /api/auth/config — never a
  // build-time constant, so the sign-in UI can't be tree-shaken out).
  const [authConfiguredState, setAuthConfiguredState] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [authUnreachable, setAuthUnreachable] = useState(false);
  const [needsProfile, setNeedsProfile] = useState(false);
  const [setupFirst, setSetupFirst] = useState('');
  const [setupLast, setSetupLast] = useState('');
  const [setupUsername, setSetupUsername] = useState('');
  const [setupState, setSetupState] = useState('MD');
  const [setupInterests, setSetupInterests] = useState<string[]>([]);
  const [setupErr, setSetupErr] = useState('');

  // Auth session — decided at RUNTIME from /api/auth/config. In local dev
  // mode (server reports not configured) there is no sign-in screen and
  // the local user is signed in. If the config endpoint can't be reached
  // we fall back to local mode for reading, but flag it visibly (below)
  // instead of silently pretending sign-in isn't configured.
  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    (async () => {
      const cfg = await loadAuthConfig();
      if (cancelled) return;
      setAuthConfiguredState(cfg.configured);
      setAuthUnreachable(!!cfg.unreachable);
      if (!cfg.configured) { setSignedIn(true); setAuthReady(true); return; }
      // A device that has signed in before goes straight to the app —
      // authReady waits for the session check so the sign-in screen
      // never flashes for a returning hunter.
      const session = await getSession();
      if (cancelled) return;
      setSignedIn(!!session);
      unsubscribe = await subscribeAuth(s => { if (!cancelled) setSignedIn(s); });
      if (!cancelled) setAuthReady(true);
    })();
    return () => { cancelled = true; unsubscribe?.(); };
  }, []);

  const loadAll = useCallback(async () => {
    try {
      const [p, c, f, g, h, s] = await Promise.all([api.getProfile(), api.listCamps(), api.listFriends(), api.listGear(), api.listHunts(), api.getSettings()]);
      setProfile(p); setCamps(c); setFriends(f); setGear(g); setHunts(h); setSettings(s);
      setNeedsProfile(!!getAuthConfig()?.configured && !p.firstName.trim());
      setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load Basecamp. Is the server running?'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (!authReady) return; if (signedIn) loadAll(); else setLoading(false); }, [signedIn, loadAll, authReady]);

  // 5s "Still loading…" escalation
  useEffect(() => {
    if (!loading) { setSlowLoading(false); return; }
    const t = window.setTimeout(() => setSlowLoading(true), 5000);
    return () => window.clearTimeout(t);
  }, [loading]);

  // Persist the current tab + open camp across refresh/reopen
  useEffect(() => { localStorage.setItem('basecamp-tab', tab); }, [tab]);
  useEffect(() => {
    if (openCampId) localStorage.setItem('basecamp-open-camp', String(openCampId));
    else localStorage.removeItem('basecamp-open-camp');
  }, [openCampId]);

  // Apply the Appearance setting (System / Light / Dark) for real
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      if (settings.theme === 'dark') root.setAttribute('data-theme', 'dark');
      else if (settings.theme === 'light') root.setAttribute('data-theme', 'light');
      else root.setAttribute('data-theme', window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    };
    apply();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [settings.theme]);

  // Hunt now strip data (home tab)
  useEffect(() => {
    if (tab !== 'basecamp' || openCampId !== null || !profile) return;
    api.getHuntNow()
      .then(setHuntNow)
      .catch(e => setHuntNowErr(e instanceof Error ? e.message : 'Weather is unavailable right now.'));
  }, [tab, openCampId, profile]);

  async function createCamp() {
    if (!campName.trim()) { setError('Enter a camp name first.'); return; }
    if (containsBadLanguage(campName) || containsBadLanguage(campLocation)) { setError(BAD_LANGUAGE_WARNING); return; }
    // Optional map coordinates: if either box is filled, both must be
    // valid numbers in range — the camp map opens at that spot.
    let centerLat = 39.8283;
    let centerLng = -98.5795;
    if (campLat.trim() || campLng.trim()) {
      const lat = Number(campLat);
      const lng = Number(campLng);
      if (!campLat.trim() || !campLng.trim() || Number.isNaN(lat) || Number.isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        setError('Check the map coordinates: latitude runs -90 to 90 and longitude -180 to 180 — or clear both boxes to set the location later.');
        return;
      }
      centerLat = lat;
      centerLng = lng;
    }
    setBusy(true); setError('');
    try {
      const camp = await api.createCamp({ name: campName.trim(), location: campLocation.trim() || 'Not set', acres: campAcres.trim() || '', centerLat, centerLng, mapZoom: 14 });
      setCampName(''); setCampLocation(''); setCampAcres(''); setCampLat(''); setCampLng(''); setShowCreate(false);
      await loadAll();
      setOpenCampId(camp.id);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not create camp.'); }
    finally { setBusy(false); }
  }
  async function joinCamp() {
    if (!joinCode.trim()) { setError('Enter a share code first.'); return; }
    setBusy(true); setError('');
    try {
      const camp = await api.joinCamp(joinCode.trim());
      setJoinCode(''); setShowJoin(false);
      await loadAll();
      setOpenCampId(camp.id);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not join with that code.'); }
    finally { setBusy(false); }
  }
  async function checkInToBest(c: HuntNowCamp) {
    if (!c.bestStandId) return;
    setBusy(true); setError('');
    try { await api.checkIn(c.campId, { pinId: c.bestStandId }); setOpenCampId(c.campId); setTab('basecamp'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not check in.'); }
    finally { setBusy(false); }
  }
  // Prefill the first-run setup from the account itself: the name and
  // username typed on the create-account form ride along as sign-up
  // metadata, so a new hunter doesn't have to type them twice.
  const setupPrefilled = useRef(false);
  useEffect(() => {
    if (!needsProfile || setupPrefilled.current) return;
    setupPrefilled.current = true;
    (async () => {
      const u = await sessionUser();
      if (!u) return;
      if (u.firstName) setSetupFirst(prev => prev || u.firstName);
      if (u.lastName) setSetupLast(prev => prev || u.lastName);
      if (u.username) setSetupUsername(prev => prev || u.username);
    })();
  }, [needsProfile]);

  async function saveSetupProfile() {
    if (!setupFirst.trim() || !setupLast.trim()) { setSetupErr('First and last name are required.'); return; }
    if (!setupUsername.trim()) { setSetupErr('Pick a username — other hunters find you by it.'); return; }
    if (containsBadLanguage(setupFirst) || containsBadLanguage(setupLast) || containsBadLanguage(setupUsername)) { setSetupErr(BAD_LANGUAGE_WARNING); return; }
    setBusy(true); setSetupErr('');
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      // A stuck save must surface a message instead of hanging forever
      // with the button disabled and no request sent (seen 2026-11-19:
      // the token lookup before the request could stall, so Save did
      // nothing, showed no error, and left no trace in the logs).
      await Promise.race([
        api.updateProfile({ firstName: setupFirst.trim(), lastName: setupLast.trim(), username: setupUsername.trim(), huntingState: setupState, interests: setupInterests }),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Save is taking too long — please check your connection and try again.')), 20_000); }),
      ]);
      setNeedsProfile(false);
      await loadAll();
    } catch (e) { setSetupErr(e instanceof Error ? e.message : 'Could not save your profile.'); }
    finally { clearTimeout(timer); setBusy(false); }
  }

  const best = huntNow?.best ?? null;

  return (
    <div className="app">
      {authUnreachable && (
        <div className="content">
          <p className="err">Could not reach the Basecamp server to check sign-in status. If this deployment uses sign-in, it may be unavailable — check your connection and refresh. Showing the app without signing in for now.</p>
        </div>
      )}
      {!authReady && (
        <div className="content"><p>Loading Basecamp…</p></div>
      )}
      {!authReady && <div className="content"><p>Loading Basecamp…</p></div>}
      {authReady && !signedIn && authConfiguredState && <AuthScreen onSignedIn={() => { setSignedIn(true); setLoading(true); loadAll(); }} />}
      {signedIn && needsProfile && profile && (
        <div className="content">
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Set up your hunter profile</h2>
            <p className="muted">This is your first sign-in — tell Basecamp who you are. Your name is pulled from here everywhere in the app.</p>
            <label htmlFor="setup-first">First name</label>
            <input id="setup-first" value={setupFirst} onChange={e => setSetupFirst(e.target.value)} placeholder="First name" />
            <label htmlFor="setup-last">Last name</label>
            <input id="setup-last" value={setupLast} onChange={e => setSetupLast(e.target.value)} placeholder="Last name" />
            <label htmlFor="setup-username">Username</label>
            <input id="setup-username" value={setupUsername} onChange={e => setSetupUsername(e.target.value)} placeholder="e.g. ridge_hunter" />
            <p className="small">Unique across Basecamp — other hunters find you by it. 3–20 characters: letters, numbers and underscores.</p>
            <label htmlFor="setup-state">Hunting state</label>
            <select id="setup-state" value={setupState} onChange={e => setSetupState(e.target.value)}>
              {['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', display: 'block', margin: '10px 0 4px' }}>Interests</div>
            <div className="row-wrap">
              {['Bow Hunting', 'Rifle Hunting', 'Shotgun Hunting', 'Whitetail Deer', 'Turkey', 'Waterfowl', 'Elk'].map(i => (
                <button key={i} className={`chip ${setupInterests.includes(i) ? 'on' : ''}`} onClick={() => setSetupInterests(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i])}>{i}</button>
              ))}
            </div>
            {setupErr && <p className="err">{setupErr}</p>}
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn primary grow" disabled={busy || !setupFirst.trim() || !setupLast.trim() || !setupUsername.trim()} onClick={saveSetupProfile}>Save profile</button>
              {authConfiguredState && <button className="btn" onClick={async () => { await signOut(); setSignedIn(false); }}>Sign out</button>}
            </div>
            {!setupFirst.trim() && <p className="small">First and last name are required.</p>}
          </div>
        </div>
      )}
      {signedIn && !needsProfile && loading && (
        <div className="content">
          <p>{slowLoading ? 'Still loading…' : 'Loading Basecamp…'}</p>
          {slowLoading && <button className="btn" onClick={() => { setLoading(true); setSlowLoading(false); loadAll(); }}>Try again</button>}
        </div>
      )}
      {signedIn && !needsProfile && error && !loading && <div className="content"><p className="err">{error}</p><button className="btn" onClick={() => { setLoading(true); loadAll(); }}>Try again</button></div>}
      {signedIn && !needsProfile && !loading && !error && profile && (
        <>
          {tab === 'basecamp' && openCampId === null && (
            <>
            <Hero />
            <div className="content">
              {/* Hunt now strip — best place to hunt today, first thing seen */}
              <div className="card hunt-now">
                <div className="hunt-now-head">
                  <h2>Hunt now</h2>
                  <span className="dateline">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} · Live · {new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
                </div>
                {huntNowErr && !best && <p className="err">{huntNowErr}</p>}
                {!huntNow && !huntNowErr && <p className="muted">Scoring today’s camps…</p>}
                {huntNow && !best && (
                  <div>
                    <p>No camp has a map location yet — set one on a camp to get a hunt score.</p>
                    {camps[0] && <button className="btn primary" onClick={() => setOpenCampId(camps[0].id)}>Open a camp to set its location</button>}
                  </div>
                )}
                {best && best.unavailable && (
                  <div>
                    <p>Weather is unavailable right now for {best.campName}.</p>
                    {best.detail && <p className="small" style={{ color: '#f19a90' }}>{best.detail}</p>}
                    <button className="btn" onClick={() => { setHuntNow(null); api.getHuntNow().then(setHuntNow).catch(e => setHuntNowErr(e instanceof Error ? e.message : 'Weather is unavailable right now.')); }}>Try again</button>
                  </div>
                )}
                {best && !best.unavailable && (
                  <div>
                    <div className="hunt-now-body">
                      <div className="score-circle"><span className="score-num">{best.score}</span><span className="score-of">OF 10</span></div>
                      <div className="grow">
                        <div className="verdict">{best.verdict} — at {best.campName}</div>
                        <p className="muted" style={{ margin: 0 }}>{best.reason}</p>
                      </div>
                    </div>
                    <div className="fact-chips">
                      <span className="fact-chip">Wind {best.windCompass}{best.windSpeedMph != null ? ` · ${fmtSpeed(best.windSpeedMph, settings.units)}` : ''}</span>
                      {best.tempF != null && <span className="fact-chip">Now {fmtTempF(best.tempF, settings.units)}</span>}
                      {best.rutLabel && <span className="fact-chip">{best.rutLabel}</span>}
                      {best.bestStandName && <span className="fact-chip">Best stand: {best.bestStandName}</span>}
                    </div>
                    <div className="row-wrap" style={{ marginTop: 12 }}>
                      <button className="btn primary" onClick={() => setOpenCampId(best.campId)}>Open {best.campName} →</button>
                      {best.bestStandId && <button className="btn" disabled={busy} onClick={() => checkInToBest(best)}>Check in to {best.bestStandName}</button>}
                    </div>
                    {huntNow && huntNow.camps.length > 1 && (
                      <div className="row-wrap" style={{ marginTop: 10 }}>
                        {huntNow.camps.filter(c => c.campId !== best.campId && !c.unavailable).map(c => (
                          <button key={c.campId} className="chip" onClick={() => setOpenCampId(c.campId)}>{c.campName}: {c.score}/10</button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="card">
                <h2>Your camps</h2>
                <p className="muted" style={{ marginTop: 0 }}>Every camp you've built or joined. Tap a camp to open it — its map, pins, trails, chat, and trophy feed live inside.</p>
                {camps.length === 0 && <p className="muted">No camps yet. Create your first camp below — then invite your crew with the share code.</p>}
                {camps.map(c => (
                  <div key={c.id} className="camp-row" onClick={() => setOpenCampId(c.id)}>
                    <span className="grow">
                      <span className="camp-name">{c.name}</span><br />
                      <span className="small">{c.location} · {c.acres ? `${c.acres} acres · ` : ''}{c.memberCount ?? 1} member{(c.memberCount ?? 1) === 1 ? '' : 's'} · {c.pinCount ?? 0} pins</span><br />
                      <span className="pill" style={{ marginTop: 4 }}>Share code: {c.shareCode}</span>
                    </span>
                    <span className="pill">{(c.pinCount ?? 0) > 0 ? 'Map set' : 'No map yet'}</span>
                  </div>
                ))}
                <div className="row" style={{ marginTop: 10 }}>
                  <button className="btn primary grow" onClick={() => setShowCreate(v => !v)}>+ Create a camp</button>
                  <button className="btn grow" onClick={() => setShowJoin(v => !v)}>Join by code</button>
                </div>
                {showCreate && (
                  <div>
                    <label>Camp name</label>
                    <input value={campName} onChange={e => setCampName(e.target.value)} placeholder="e.g. Pine Ridge Camp" />
                    <label>Location</label>
                    <input value={campLocation} onChange={e => setCampLocation(e.target.value)} placeholder="e.g. City, State" />
                    <label>Acres</label>
                    <input value={campAcres} onChange={e => setCampAcres(e.target.value)} placeholder="e.g. 50" inputMode="decimal" />
                    <div className="row">
                      <span className="grow">
                        <label>Latitude</label>
                        <input value={campLat} onChange={e => setCampLat(e.target.value)} placeholder="e.g. 39.5000" inputMode="decimal" />
                      </span>
                      <span className="grow">
                        <label>Longitude</label>
                        <input value={campLng} onChange={e => setCampLng(e.target.value)} placeholder="e.g. -98.3500" inputMode="decimal" />
                      </span>
                    </div>
                    <p className="small">Optional — if you give coordinates, the camp map opens right at that spot. Leave both blank to set the location later from inside the camp.</p>
                    {containsBadLanguage(campName) && <p className="err">{BAD_LANGUAGE_WARNING}</p>}
                    {!campName.trim() && <p className="small">Enter a camp name to create it.</p>}
                    <div className="row" style={{ marginTop: 8 }}><button className="btn primary grow" disabled={!campName.trim() || busy || containsBadLanguage(campName)} onClick={createCamp}>Create camp</button></div>
                  </div>
                )}
                {showJoin && (
                  <div>
                    <label>Share code</label>
                    <input value={joinCode} onChange={e => setJoinCode(e.target.value)} placeholder="e.g. CAMP-XXXXXX" />
                    {!joinCode.trim() && <p className="small">Enter a share code to join.</p>}
                    <div className="row" style={{ marginTop: 8 }}><button className="btn primary grow" disabled={!joinCode.trim() || busy} onClick={joinCamp}>Join camp</button></div>
                  </div>
                )}
              </div>
              <HuntingCalendar profile={profile} onStateChange={async state => { await api.updateProfile({ huntingState: state }); setProfile(prev => prev ? { ...prev, huntingState: state } : prev); }} />
            </div>
            </>
          )}
          {tab === 'basecamp' && openCampId !== null && (
            <CampDetail campId={openCampId} profile={profile} friends={friends} settings={settings} onBack={() => setOpenCampId(null)} onFriendsChanged={loadAll} onCampsChanged={loadAll} />
          )}
          {tab === 'hunts' && <HuntsTab hunts={hunts} camps={camps} profile={profile} onChanged={loadAll} />}
          {tab === 'maps' && <MapsTab camps={camps} onPinSheet={(campId, pin, lat, lng) => setMapsPinSheet({ campId, pin: pin ?? undefined, lat, lng })} onTrailCreated={async (campId, points, name, color) => { await api.createTrail(campId, { name, color, points }); await loadAll(); }} />}
          {tab === 'community' && <CommunityTab profile={profile} />}
          {tab === 'profile' && <ProfileTab profile={profile} friends={friends} gear={gear} settings={settings} onProfileChanged={loadAll} onFriendsChanged={loadAll} onSettingsChanged={setSettings} />}
        </>
      )}
      {mapsPinSheet && (
        <PinSheet
          sheet={mapsPinSheet.pin ? { mode: 'edit', pin: mapsPinSheet.pin } : { mode: 'create', lat: mapsPinSheet.lat, lng: mapsPinSheet.lng }}
          campId={mapsPinSheet.campId}
          onClose={() => setMapsPinSheet(null)}
          onSaved={() => { setMapsPinSheet(null); loadAll(); }}
        />
      )}
      <nav className="bottomnav">
        {TABS.map(t => (
          t.id === 'basecamp' ? (
            <button key={t.id} className={`medallion ${tab === t.id ? 'active' : ''}`} onClick={() => { setTab(t.id); }} aria-label="Basecamp">
              <span className="medallion-word">BASE</span>
              <span className="medallion-word">CAMP</span>
            </button>
          ) : (
            <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => { setTab(t.id); if (t.id !== 'basecamp') setOpenCampId(null); }}>{t.label}</button>
          )
        ))}
      </nav>
    </div>
  );
}
