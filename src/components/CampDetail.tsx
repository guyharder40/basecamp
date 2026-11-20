import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { AppSettings, CampDetail, CampMessage, CampNote, Checkin, Friend, GoHuntScore, Photo, Pin, Profile, Reservation, WindData } from '../types';
import { PIN_COLORS, PIN_TYPES, WIND_DIRS, fmtDistanceUnits, fmtSpeed, fmtTempF, fmtTime, pinSymbol, pinTypeLabel, trailDistanceFt } from '../types';
import { containsBadLanguage, BAD_LANGUAGE_WARNING } from '../lib/profanity';
import MapView from './MapView';
import { HarvestChips, HarvestForm, TrophyCardButton } from './TrophyCardSheet';

interface Props { campId: number; profile: Profile; friends: Friend[]; settings: AppSettings; onBack: () => void; onFriendsChanged: () => void; onCampsChanged: () => void; }
const SESSIONS = [{ id: 'morning', label: 'Morning' }, { id: 'afternoon', label: 'Afternoon' }, { id: 'evening', label: 'Evening' }, { id: 'all_day', label: 'All day' }];
const SPECIES = ['Whitetail Deer', 'Mule Deer', 'Elk', 'Turkey', 'Bear', 'Waterfowl', 'Upland Birds', 'Small Game', 'Other'];
const JUMP_TABS = [
  { id: 'map', label: 'Map' }, { id: 'wind', label: 'Wind' }, { id: 'stands', label: 'Stands' },
  { id: 'notes', label: 'Notes' }, { id: 'chat', label: 'Chat' }, { id: 'trophies', label: 'Trophies' }, { id: 'crew', label: 'Crew' },
] as const;

export default function CampDetail({ campId, profile, friends, settings, onBack, onFriendsChanged, onCampsChanged }: Props) {
  const [detail, setDetail] = useState<CampDetail | null>(null);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [notes, setNotes] = useState<CampNote[]>([]);
  const [messages, setMessages] = useState<CampMessage[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedPin, setSelectedPin] = useState<Pin | null>(null);
  const [pinSheet, setPinSheet] = useState<{ mode: 'create' | 'edit'; pin?: Pin; lat?: number; lng?: number } | null>(null);
  const [standId, setStandId] = useState<number | null>(null);
  const [standNote, setStandNote] = useState('');
  const [resDate, setResDate] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); });
  const [resSession, setResSession] = useState('morning');
  const [resStandId, setResStandId] = useState<number | null>(null);
  const [resNote, setResNote] = useState('');
  const [noteForm, setNoteForm] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteBody, setNoteBody] = useState('');
  const [editingNote, setEditingNote] = useState<CampNote | null>(null);
  const [chatBody, setChatBody] = useState('');
  const [photoSpecies, setPhotoSpecies] = useState('Whitetail Deer');
  const [photoCaption, setPhotoCaption] = useState('');
  const [photoData, setPhotoData] = useState('');
  const [photoBroken, setPhotoBroken] = useState<Record<number, boolean>>({});
  const [photoHarvest, setPhotoHarvest] = useState<{ harvestClass: string; weightLbs: number | null; antlerScore: number | null; antlerPoints: number | null }>({ harvestClass: '', weightLbs: null, antlerScore: null, antlerPoints: null });
  const [showPhotoHarvest, setShowPhotoHarvest] = useState(false);
  const [inviteRole, setInviteRole] = useState('editor');
  const [inviteSearch, setInviteSearch] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePhone, setInvitePhone] = useState('');
  const [locLat, setLocLat] = useState('');
  const [locLng, setLocLng] = useState('');
  const [locZoom, setLocZoom] = useState('14');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [wind, setWind] = useState<WindData | null>(null);
  const [windErr, setWindErr] = useState('');
  const [windLoading, setWindLoading] = useState(false);
  const [goHunt, setGoHunt] = useState<GoHuntScore | null>(null);
  const [activeSection, setActiveSection] = useState<string>('map');
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const load = useCallback(async (quiet = false) => {
    try {
      if (!quiet) setLoading(true);
      const [d, ci, r, n, m, ph] = await Promise.all([
        api.getCampDetail(campId), api.listCheckins(campId), api.listReservations(campId),
        api.listNotes(campId), api.listMessages(campId), api.listPhotos(campId),
      ]);
      setDetail(d); setCheckins(ci); setReservations(r); setNotes(n); setMessages(m); setPhotos(ph);
      setLocLat(String(d.camp.centerLat)); setLocLng(String(d.camp.centerLng)); setLocZoom(String(d.camp.mapZoom));
      setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load this camp.'); }
    finally { if (!quiet) setLoading(false); }
  }, [campId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = window.setInterval(() => load(true), 10000);
    return () => window.clearInterval(t);
  }, [load]);

  const loadWind = useCallback(async (refresh = false) => {
    setWindLoading(true); setWindErr('');
    try {
      const w = await api.getWind(campId, refresh);
      setWind(w);
      const g = await api.getGoHunt(campId);
      setGoHunt(g.score);
    } catch (e) { setWindErr(e instanceof Error ? e.message : 'Weather is unavailable right now.'); }
    finally { setWindLoading(false); }
  }, [campId]);
  useEffect(() => { loadWind(); }, [loadWind]);

  // Scroll-spy for the jump tabs
  useEffect(() => {
    function onScroll() {
      const pos = window.scrollY + 120;
      let current = 'map';
      for (const t of JUMP_TABS) {
        const el = sectionRefs.current[t.id];
        if (el && el.offsetTop <= pos) current = t.id;
      }
      setActiveSection(current);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  function jumpTo(id: string) {
    setActiveSection(id);
    sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const camp = detail?.camp;
  const pins = detail?.pins ?? [];
  const trails = detail?.trails ?? [];
  const members = detail?.members ?? [];
  const isOwner = !!camp && (camp.ownerUserId === profile.ownerUserId || (!camp.ownerUserId && profile.displayName === camp.ownerName) || profile.displayName === camp.ownerName);
  const standPins = pins.filter(p => p.pinType === 'stand' || p.pinType === 'blind');
  const activeCheckins = checkins.filter(c => c.isActive);
  const pastCheckins = checkins.filter(c => !c.isActive).slice(0, 5);
  const myName = profile.displayName || 'Hunter';
  const today = new Date().toISOString().slice(0, 10);
  const units = settings.units;

  // Wind-aware stand ordering: good-for-today stands first.
  const goodToday = new Set((wind?.stands ?? []).filter(s => s.goodToday).map(s => s.id));
  const sortedStands = [...standPins].sort((a, b) => Number(goodToday.has(b.id)) - Number(goodToday.has(a.id)));

  async function run(fn: () => Promise<unknown>, label: string) {
    setBusy(label); setMsg(''); setError('');
    try { await fn(); await load(true); onCampsChanged(); } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong.'); }
    finally { setBusy(''); }
  }
  function flash(text: string) { setMsg(text); window.setTimeout(() => setMsg(''), 4000); }

  if (loading && !detail) return <div className="content"><p>Opening camp…</p></div>;
  if (!camp) return <div className="content"><div className="card"><p>Could not load this camp.</p><p className="err">{error}</p><button className="btn" onClick={() => load()}>Try again</button> <button className="btn" onClick={onBack}>← All camps</button></div></div>;

  const selectedStand = standPins.find(p => p.id === standId) ?? null;
  const resStand = standPins.find(p => p.id === resStandId) ?? null;
  const myActive = activeCheckins.find(c => c.userName === myName);
  const badChat = containsBadLanguage(chatBody);
  const badNote = containsBadLanguage(noteTitle) || containsBadLanguage(noteBody);
  const badCaption = containsBadLanguage(photoCaption);

  return (
    <div className="content">
      <button className="btn ghost" onClick={onBack}>← All camps</button>
      {msg && <p className="okmsg">{msg}</p>}
      {error && <p className="err">{error}</p>}
      <div className="card" style={{ marginTop: 8 }}>
        <h2>{camp.name}</h2>
        <p className="muted">{camp.location} · {camp.acres} acres</p>
        <div className="row-wrap">
          <span className="pill">Share code: {camp.shareCode}</span>
          {isOwner && <span className="pill orange">You own this camp</span>}
          <button className="btn small" onClick={() => { navigator.clipboard?.writeText(camp.shareCode).catch(() => undefined); flash('Share code copied.'); }}>Copy invite</button>
          {isOwner && <button className="btn small danger" onClick={async () => { if (window.confirm(`Delete ${camp.name} and everything in it?`)) { await api.deleteCamp(camp.id); onCampsChanged(); onBack(); } }}>Delete camp</button>}
        </div>
      </div>

      {!mapFullscreen && (
        <nav className="jump-tabs" aria-label="Camp sections">
          {JUMP_TABS.map(t => (
            <button key={t.id} className={activeSection === t.id ? 'on' : ''} onClick={() => jumpTo(t.id)}>{t.label}</button>
          ))}
        </nav>
      )}

      <div className="card" ref={el => { sectionRefs.current.map = el; }}>
        <h3>Location</h3>
        <p className="muted">Map location set: {camp.centerLat.toFixed(5)}, {camp.centerLng.toFixed(5)} · zoom {camp.mapZoom}</p>
        <div className="row">
          <input value={locLat} onChange={e => setLocLat(e.target.value)} placeholder="Latitude" inputMode="decimal" />
          <input value={locLng} onChange={e => setLocLng(e.target.value)} placeholder="Longitude" inputMode="decimal" />
          <input value={locZoom} onChange={e => setLocZoom(e.target.value)} placeholder="Zoom" inputMode="numeric" style={{ maxWidth: 70 }} />
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn grow" onClick={() => run(() => api.setCampLocation(camp.id, { centerLat: Number(locLat), centerLng: Number(locLng), mapZoom: Number(locZoom) || 14 }), 'Saving location…')}>Save location</button>
          <button className="btn" onClick={() => {
            if (!('geolocation' in navigator)) { setError('Location is not available in this browser.'); return; }
            navigator.geolocation.getCurrentPosition(pos => { setLocLat(String(pos.coords.latitude)); setLocLng(String(pos.coords.longitude)); }, () => setError('Could not get your location. Allow location access and try again.'));
          }}>Use my location</button>
        </div>
      </div>

      <div className="card" ref={el => { sectionRefs.current.map = el; }}>
        <h3>Camp map</h3>
        <MapView
          camp={camp} pins={pins} trails={trails} selectedPinId={selectedPin?.id ?? null}
          defaultView={settings.defaultMapView}
          onMapViewChanged={v => { api.setCampMapView(camp.id, v).catch(() => undefined); }}
          onFullscreenChange={setMapFullscreen}
          onSelectPin={setSelectedPin}
          onAddPinAt={(lat, lng) => setPinSheet({ mode: 'create', lat, lng })}
          onTrailCreated={(points, name, color) => run(() => api.createTrail(camp.id, { name, color, points }), 'Saving trail…')}
          onPinHold={pin => setPinSheet({ mode: 'edit', pin })}
        />
        {selectedPin && (
          <div className="card" style={{ marginTop: 8, marginBottom: 0 }}>
            <div className="row"><span style={{ fontSize: 22 }}>{pinSymbol(selectedPin.pinType)}</span><strong className="grow">{selectedPin.name}</strong><span className="pill">{pinTypeLabel(selectedPin.pinType)}</span></div>
            <p className="muted">{selectedPin.lat.toFixed(5)}, {selectedPin.lng.toFixed(5)}{selectedPin.notes ? ` · ${selectedPin.notes}` : ''}</p>
            {selectedPin.bestWinds.length > 0 && <p>Best winds: <strong>{selectedPin.bestWinds.join(', ')}</strong></p>}
            <div className="row">
              <button className="btn grow" onClick={() => setPinSheet({ mode: 'edit', pin: selectedPin })}>Edit pin</button>
              <button className="btn" onClick={() => setSelectedPin(null)}>Close</button>
            </div>
          </div>
        )}
        <h3>Pin symbols in this camp</h3>
        <div className="row-wrap">{PIN_TYPES.map(t => <span key={t.type} className="pill">{t.symbol} {t.label}</span>)}</div>
        <h3>Pins ({pins.length})</h3>
        {pins.length === 0 && <p className="muted">No pins yet. Press and hold the map, or tap + Add a pin.</p>}
        {pins.map(pin => (
          <div key={pin.id} className={`listrow ${selectedPin?.id === pin.id ? 'selected' : ''}`} style={{ borderRadius: 8, padding: '8px 6px' }} onClick={() => setSelectedPin(pin)}>
            <span style={{ fontSize: 20 }}>{pinSymbol(pin.pinType)}</span>
            <span className="grow"><strong>{pin.name}</strong> <span className="muted">· {pinTypeLabel(pin.pinType)}</span><br /><span className="small">{pin.bestWinds.length > 0 ? `Best winds: ${pin.bestWinds.join(', ')}` : ''}{pin.notes ? ` · ${pin.notes}` : ''}</span></span>
            <span style={{ width: 16, height: 16, borderRadius: '50%', background: pin.color, flex: 'none' }} />
            <button className="btn small" onClick={e => { e.stopPropagation(); setPinSheet({ mode: 'edit', pin }); }}>Edit</button>
          </div>
        ))}
        <h3>Trails ({trails.length})</h3>
        {trails.length === 0 && <p className="muted">No trails yet.</p>}
        {trails.map(tr => (
          <div key={tr.id} className="listrow">
            <input type="color" value={tr.color} onChange={e => run(() => api.updateTrailColor(camp.id, tr.id, e.target.value), 'Saving color…')} style={{ width: 40 }} aria-label="Trail color" />
            <span className="grow"><strong>{tr.name}</strong><br /><span className="small">{fmtDistanceUnits(tr.distanceFt || trailDistanceFt(tr.points), units)} · {tr.points.length} points</span></span>
            <button className="btn small danger" onClick={() => { if (window.confirm(`Delete trail ${tr.name}?`)) run(() => api.deleteTrail(camp.id, tr.id), 'Deleting…'); }}>Delete</button>
          </div>
        ))}
      </div>

      <div ref={el => { sectionRefs.current.wind = el; }}>
        <div className="wind-go-grid">
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Today's wind</h2>
            {windLoading && !wind && <p>Checking the wind…</p>}
            {windErr && !wind && (
              <div>
                <p className="err">{windErr}</p>
                <button className="btn" onClick={() => loadWind(true)}>Try again</button>
              </div>
            )}
            {wind && (
              <>
                <p style={{ fontSize: 18, margin: '4px 0' }}>
                  <strong>{wind.wind.currentCompass}</strong> ({wind.compassWord}) · {fmtSpeed(wind.wind.currentSpeedMph, units)}
                  {wind.wind.currentGustMph ? ` · gusts ${fmtSpeed(wind.wind.currentGustMph, units)}` : ''}
                </p>
                <p className="muted" style={{ margin: '2px 0' }}>{fmtTempF(wind.wind.currentTempF, units)} now · high {fmtTempF(wind.wind.todayHighF, units)} / low {fmtTempF(wind.wind.todayLowF, units)}</p>
                <div className="row-wrap" style={{ marginTop: 8 }}>
                  {wind.wind.periods.map(p => (
                    <span key={p.key} className="pill">{p.label}: {p.compass} {fmtSpeed(p.speedMph, units)}</span>
                  ))}
                </div>
                <p style={{ marginTop: 10 }}>
                  {wind.matchingStandNames.length > 0
                    ? <>Good for today's wind: <strong>{wind.matchingStandNames.join(', ')}</strong></>
                    : 'No stand lists today’s wind as a best wind.'}
                </p>
                <p className="small">Wind from {wind.wind.source === 'nws' ? 'National Weather Service' : 'Open-Meteo'} · as of {fmtTime(wind.wind.asOf)}</p>
                {(wind.stale || wind.wind.stale) && <p className="err">Showing the last saved wind — it may be out of date. Refresh to try again.</p>}
                <button className="btn small" disabled={windLoading} onClick={() => loadWind(true)}>Refresh wind</button>
              </>
            )}
          </div>
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Go hunt score</h2>
            {goHunt ? (
              <>
                <p style={{ fontSize: 34, margin: '2px 0', fontWeight: 800 }}>{goHunt.score} <span style={{ fontSize: 16, fontWeight: 400 }}>/ 10</span></p>
                <p style={{ margin: '2px 0' }}><strong>{goHunt.verdict}</strong></p>
                <p className="muted">{goHunt.reason}</p>
                {goHunt.bestStandName && <p>Best stand today: <strong>{goHunt.bestStandName}</strong></p>}
                <p className="small">{goHunt.rutLabel} · {profile.huntingState || '—'} · Moon: {goHunt.moonName}</p>
              </>
            ) : (
              <p className="muted">Scoring today’s hunt…</p>
            )}
          </div>
        </div>
      </div>

      <div className="card" ref={el => { sectionRefs.current.stands = el; }}>
        <h2 style={{ marginTop: 0 }}>Stands — check-in &amp; reservations</h2>
        {standPins.length === 0 && <p className="muted">Add a stand or blind pin on the map to check in here.</p>}
        {standPins.length > 0 && (
          <>
            <label>Check in to a stand</label>
            <div className="row-wrap">
              {sortedStands.map(p => {
                const occupied = activeCheckins.some(c => c.pinId === p.id);
                const isSel = standId === p.id;
                const good = goodToday.has(p.id);
                return (
                  <button key={p.id} className={`chip ${isSel ? 'on selected' : ''} ${!good && wind ? 'dimmed' : ''}`} disabled={occupied && activeCheckins.find(c => c.pinId === p.id)?.userName !== myName} onClick={() => setStandId(p.id)}>
                    {pinSymbol(p.pinType)} {p.name}{good ? ' · Good for today’s wind' : ''}{isSel ? ' · Selected' : ''}{occupied ? ' · Occupied' : ''}
                  </button>
                );
              })}
            </div>
            {selectedStand && selectedStand.bestWinds.length > 0 && <p className="small">Best winds for {selectedStand.name}: <strong>{selectedStand.bestWinds.join(', ')}</strong></p>}
            <label>Note (optional)</label>
            <input value={standNote} onChange={e => setStandNote(e.target.value)} placeholder="e.g. Evening sit" />
            {containsBadLanguage(standNote) && <p className="err">{BAD_LANGUAGE_WARNING}</p>}
            <div className="row" style={{ marginTop: 8 }}>
              {myActive ? (
                <button className="btn primary grow" disabled={!!busy} onClick={() => run(() => api.checkOut(camp.id, myActive.id), 'Checking out…')}>Check out of {myActive.pinLabel}</button>
              ) : (
                <button className="btn primary grow" disabled={!standId || !!busy || containsBadLanguage(standNote)} onClick={() => run(() => api.checkIn(camp.id, { pinId: standId!, notes: standNote }), 'Checking in…')}>Check in{selectedStand ? ` to ${selectedStand.name}` : ''}</button>
              )}
            </div>
            <h3>Who is in a stand now</h3>
            {activeCheckins.length === 0 && <p className="muted">Nobody is checked in right now.</p>}
            {activeCheckins.map(c => (
              <div key={c.id} className="listrow">
                <span className="grow"><strong>{c.pinLabel}</strong><br /><span className="small">Since {fmtTime(c.checkedInAt)}{c.notes ? ` · ${c.notes}` : ''}</span></span>
                <span className="pill orange">Occupied</span>
              </div>
            ))}
            {pastCheckins.length > 0 && (
              <>
                <h3>Recent check-outs</h3>
                {pastCheckins.map(c => <p key={c.id} className="small">{c.pinLabel} · {fmtTime(c.checkedInAt)}</p>)}
              </>
            )}
            <h3>Reserve a stand ahead</h3>
            <label>Hunt day</label>
            <input type="date" value={resDate} onChange={e => setResDate(e.target.value)} />
            <label>Session</label>
            <select value={resSession} onChange={e => setResSession(e.target.value)}>{SESSIONS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
            <label>Stand</label>
            <div className="row-wrap">
              {sortedStands.map(p => {
                const taken = reservations.some(r => r.pinId === p.id && r.date === resDate && (r.session === 'all_day' || resSession === 'all_day' || r.session === resSession));
                const good = goodToday.has(p.id);
                return (
                  <button key={p.id} className={`chip ${resStandId === p.id ? 'on selected' : ''} ${!good && wind ? 'dimmed' : ''}`} disabled={taken} onClick={() => setResStandId(p.id)}>
                    {pinSymbol(p.pinType)} {p.name}{good ? ' · Good for today’s wind' : ''}{resStandId === p.id ? ' · Selected' : ''}{taken ? ' · Booked' : ''}
                  </button>
                );
              })}
            </div>
            {resStand && resStand.bestWinds.length > 0 && <p className="small">Best winds for {resStand.name}: <strong>{resStand.bestWinds.join(', ')}</strong></p>}
            <label>Note for the crew (optional)</label>
            <input value={resNote} onChange={e => setResNote(e.target.value)} placeholder="e.g. First sit of the season" />
            {containsBadLanguage(resNote) && <p className="err">{BAD_LANGUAGE_WARNING}</p>}
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn primary grow" disabled={!resStandId || !resDate || !!busy || containsBadLanguage(resNote)} onClick={() => run(async () => { await api.reserveStand(camp.id, { pinId: resStandId!, date: resDate, session: resSession, note: resNote }); flash('Stand reserved.'); }, 'Reserving…')}>Reserve stand</button>
            </div>
            <h3>Upcoming reservations</h3>
            {reservations.length === 0 && <p className="muted">No upcoming reservations.</p>}
            {reservations.map(r => (
              <div key={r.id} className="listrow">
                <span className="grow"><strong>{r.pinLabel}</strong><br /><span className="small">{r.date} · {SESSIONS.find(s => s.id === r.session)?.label}{r.note ? ` · ${r.note}` : ''}</span></span>
                {r.date === today && r.userName === myName && !myActive && <button className="btn small primary" onClick={() => run(() => api.checkIn(camp.id, { pinId: r.pinId, notes: r.note }), 'Checking in…')}>Check in now</button>}
                {r.userName === myName && <button className="btn small" onClick={() => run(() => api.cancelReservation(camp.id, r.id), 'Cancelling…')}>Cancel</button>}
              </div>
            ))}
          </>
        )}
      </div>

      <div className="card" ref={el => { sectionRefs.current.notes = el; }}>
        <h2 style={{ marginTop: 0 }}>Pinned camp notes</h2>
        <p className="muted">Gate code, rules, dates — the stuff everyone needs, pinned here instead of buried in chat.</p>
        {notes.length === 0 && <p className="muted">No pinned notes yet.</p>}
        {notes.map(n => (
          <div key={n.id} className="listrow">
            <span className="grow"><span className="pill">Pinned</span> <strong>{n.title}</strong><br />{n.body}<br /><span className="small">{fmtTime(n.updatedAt || n.createdAt)}</span></span>
            <button className="btn small" onClick={() => { setEditingNote(n); setNoteTitle(n.title); setNoteBody(n.body); setNoteForm(true); }}>Edit</button>
            <button className="btn small danger" onClick={() => { if (window.confirm('Remove this pinned note?')) run(() => api.deleteNote(camp.id, n.id), 'Removing…'); }}>Remove</button>
          </div>
        ))}
        {!noteForm && <button className="btn" onClick={() => { setEditingNote(null); setNoteTitle(''); setNoteBody(''); setNoteForm(true); }}>+ Pin a note</button>}
        {noteForm && (
          <div>
            <label>Title</label>
            <input value={noteTitle} onChange={e => setNoteTitle(e.target.value)} placeholder="e.g. Gate code" />
            <label>Details</label>
            <textarea value={noteBody} onChange={e => setNoteBody(e.target.value)} placeholder="Gate code, rules, dates, directions…" />
            {badNote && <p className="err">{BAD_LANGUAGE_WARNING}</p>}
            {!noteTitle.trim() && <p className="small">A title is required to save the note.</p>}
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn primary grow" disabled={!noteTitle.trim() || !!busy || badNote} onClick={() => run(async () => {
                if (editingNote) await api.updateNote(camp.id, editingNote.id, { title: noteTitle.trim(), body: noteBody });
                else await api.createNote(camp.id, { title: noteTitle.trim(), body: noteBody });
                setNoteForm(false); setEditingNote(null);
              }, 'Saving note…')}>Save note</button>
              <button className="btn" onClick={() => { setNoteForm(false); setEditingNote(null); }}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      <div className="card" ref={el => { sectionRefs.current.chat = el; }}>
        <h2 style={{ marginTop: 0 }}>Camp chat</h2>
        {messages.length === 0 && <p className="muted">No messages yet. Say hello to the crew.</p>}
        {messages.map(m => (
          <div key={m.id} className="listrow">
            <span className="grow"><span className="small">{fmtTime(m.createdAt)}</span><br />{m.body}</span>
            <button className="btn small" onClick={() => run(() => api.pinMessage(camp.id, m.id), 'Pinning…')}>Pin</button>
            <button className="btn small danger" onClick={() => { if (window.confirm('Delete this message?')) run(() => api.deleteMessage(camp.id, m.id), 'Deleting…'); }}>Delete</button>
          </div>
        ))}
        {badChat && <p className="err">{BAD_LANGUAGE_WARNING}</p>}
        <div className="row" style={{ marginTop: 8 }}>
          <input className="grow" value={chatBody} onChange={e => setChatBody(e.target.value)} placeholder="Message the crew…" onKeyDown={e => { if (e.key === 'Enter' && chatBody.trim() && !badChat) { run(() => api.sendMessage(camp.id, { body: chatBody.trim() }), 'Sending…'); setChatBody(''); } }} />
          <button className="btn primary" disabled={!chatBody.trim() || !!busy || badChat} onClick={() => { run(() => api.sendMessage(camp.id, { body: chatBody.trim() }), 'Sending…'); setChatBody(''); }}>Send</button>
        </div>
        {!chatBody.trim() && <p className="small">Write a message to send it.</p>}
      </div>

      <div className="card" ref={el => { sectionRefs.current.trophies = el; }}>
        <h2 style={{ marginTop: 0 }}>Trophy feed</h2>
        <label>Species</label>
        <select value={photoSpecies} onChange={e => setPhotoSpecies(e.target.value)}>{SPECIES.map(s => <option key={s} value={s}>{s}</option>)}</select>
        <label>Your comment</label>
        <input value={photoCaption} onChange={e => setPhotoCaption(e.target.value)} placeholder="Tell the story of this harvest…" />
        {badCaption && <p className="err">{BAD_LANGUAGE_WARNING}</p>}
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => {
          const f = e.target.files?.[0]; if (!f) return;
          const reader = new FileReader();
          reader.onload = () => setPhotoData(String(reader.result));
          reader.readAsDataURL(f);
        }} />
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn grow" onClick={() => fileRef.current?.click()}>{photoData ? 'Photo ready ✓ — tap to change' : 'Choose a photo'}</button>
          <button className="btn" onClick={() => setShowPhotoHarvest(v => !v)}>Harvest details</button>
        </div>
        {showPhotoHarvest && (
          <HarvestForm initial={photoHarvest} onSave={v => { setPhotoHarvest(v); setShowPhotoHarvest(false); }} onCancel={() => setShowPhotoHarvest(false)} />
        )}
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn primary grow" disabled={!photoData || !!busy || badCaption || !photoCaption.trim()} onClick={() => run(async () => { await api.postPhoto(camp.id, { species: photoSpecies, caption: photoCaption, imageUrl: photoData, ...photoHarvest }); setPhotoData(''); setPhotoCaption(''); setPhotoHarvest({ harvestClass: '', weightLbs: null, antlerScore: null, antlerPoints: null }); }, 'Posting…')}>Post trophy</button>
        </div>
        {!photoCaption.trim() && <p className="small">Add your comment to post the trophy.</p>}
        {photos.length === 0 && <p className="muted" style={{ marginTop: 10 }}>No trophy photos yet.</p>}
        {photos.map(ph => (
          <PhotoCard key={ph.id} photo={ph} campId={camp.id} campName={camp.name} myName={myName} broken={!!photoBroken[ph.id]} onBroken={() => setPhotoBroken(prev => ({ ...prev, [ph.id]: true }))} onChanged={() => load(true)} />
        ))}
      </div>

      <div className="card" ref={el => { sectionRefs.current.crew = el; }}>
        <h2 style={{ marginTop: 0 }}>Camp Crew</h2>
        <div className="listrow">
          <span className="avatar" style={{ width: 40, height: 40, fontSize: 16 }}>★</span>
          <span className="grow"><strong>Camp owner</strong><br /><span className="small">Created this camp</span></span>
          <span className="pill orange">Owner</span>
        </div>
        {members.map(m => (
          <div key={m.id} className="listrow">
            <span className="grow"><strong>{m.name}</strong>{m.name === myName ? ' (You)' : ''}<br /><span className="small">{m.role}{m.joined ? ' · Joined' : ' · Invited'}</span></span>
            {!isOwner && m.name !== myName && (
              friends.some(f => f.name === m.name)
                ? <span className="pill">Friends ✓</span>
                : <button className="btn small" onClick={() => run(async () => { await api.addFriend({ name: m.name, email: m.email, phone: m.phone }); onFriendsChanged(); flash(`${m.name} added to your friends.`); }, 'Adding friend…')}>+ Add as friend</button>
            )}
            {isOwner && <button className="btn small danger" onClick={() => { if (window.confirm(`Remove ${m.name} from this camp?`)) run(() => api.removeMember(camp.id, m.id), 'Removing…'); }}>Remove</button>}
          </div>
        ))}
        {members.length === 0 && <p className="muted">Only the owner is in this camp so far.</p>}
        {isOwner ? (
          <div>
            <h3>Invite from friends</h3>
            <label>Role</label>
            <select value={inviteRole} onChange={e => setInviteRole(e.target.value)}>
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
            <label>Search your friends</label>
            <input value={inviteSearch} onChange={e => setInviteSearch(e.target.value)} placeholder="Search for a name" />
            {friends.filter(f => f.name.toLowerCase().includes(inviteSearch.toLowerCase())).map(f => (
              <div key={f.id} className="listrow">
                <span className="grow"><strong>{f.name}</strong>{f.email ? <><br /><span className="small">{f.email}</span></> : null}</span>
                {members.some(m => m.name === f.name)
                  ? <span className="pill">In this camp</span>
                  : <button className="btn small primary" onClick={() => run(async () => { await api.inviteMember(camp.id, { name: f.name, email: f.email, phone: f.phone, role: inviteRole }); flash(`${f.name} invited to ${camp.name}.`); }, 'Inviting…')}>Invite</button>}
              </div>
            ))}
            {friends.length === 0 && <p className="muted">No friends yet — add friends on the Profile tab first.</p>}
            <h3>Or invite by name</h3>
            <label>Name</label>
            <input value={inviteName} onChange={e => setInviteName(e.target.value)} placeholder="Full name" />
            <label>Email (optional)</label>
            <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="Email" />
            <label>Phone (optional)</label>
            <input value={invitePhone} onChange={e => setInvitePhone(e.target.value)} placeholder="Phone" />
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn primary grow" disabled={!inviteName.trim() || !!busy} onClick={() => run(async () => { await api.inviteMember(camp.id, { name: inviteName.trim(), email: inviteEmail || undefined, phone: invitePhone || undefined, role: inviteRole }); setInviteName(''); setInviteEmail(''); setInvitePhone(''); flash('Invite sent.'); }, 'Inviting…')}>Send invite</button>
            </div>
            {!inviteName.trim() && <p className="small">Enter a name to send an invite.</p>}
          </div>
        ) : (
          <p className="small">Only the camp owner can invite people. You can see the crew here and add crewmates as friends.</p>
        )}
      </div>

      {pinSheet && (
        <PinSheet
          sheet={pinSheet}
          onClose={() => setPinSheet(null)}
          onSaved={() => { setPinSheet(null); setSelectedPin(null); load(true); onCampsChanged(); }}
          campId={camp.id}
        />
      )}
    </div>
  );
}

function PhotoCard({ photo, campId, campName, myName, broken, onBroken, onChanged }: { photo: Photo; campId: number; campName: string; myName: string; broken: boolean; onBroken: () => void; onChanged: () => void }) {
  const [comment, setComment] = useState('');
  const [err, setErr] = useState('');
  const [full, setFull] = useState(false);
  const [editing, setEditing] = useState(false);
  const liked = photo.likedBy.includes(myName);
  const badComment = containsBadLanguage(comment);
  const isMine = photo.authorName === myName;
  return (
    <div style={{ borderTop: '1px solid #eee', paddingTop: 12, marginTop: 12 }}>
      <p><span className="small">{fmtTime(photo.createdAt)}</span> · <span className="pill">{photo.species}</span></p>
      <div className="feed-img-wrap" onClick={() => setFull(true)} style={{ cursor: 'pointer' }}>
        {broken || !photo.imageUrl || photo.imageUrl.startsWith('./blobs/') ? (
          <div className="img-fallback">{photo.species} — photo needs re-upload</div>
        ) : (
          <img className="feed-img" src={photo.imageUrl} alt={photo.caption || photo.species} onError={onBroken} />
        )}
      </div>
      {photo.caption && <p style={{ margin: '8px 0 4px' }}>{photo.caption}</p>}
      <HarvestChips post={photo} />
      <div className="row" style={{ marginTop: 8 }}>
        <button className={`btn small ${liked ? 'selected' : ''}`} onClick={async () => { try { await api.toggleLike(campId, photo.id); onChanged(); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not like.'); } }}>
          {liked ? '♥ Liked' : '♡ Like'} ({photo.likeCount})
        </button>
        <TrophyCardButton photo={photo} place={campName} />
        {isMine && <button className="btn small" onClick={() => setEditing(v => !v)}>{photo.harvestClass || photo.weightLbs ? 'Edit harvest details' : 'Add harvest details'}</button>}
        {isMine && <button className="btn small danger" onClick={async () => { if (window.confirm('Delete this trophy photo?')) { try { await api.deletePhoto(campId, photo.id); onChanged(); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not delete.'); } } }}>Delete</button>}
      </div>
      {editing && (
        <HarvestForm
          initial={photo}
          onSave={async v => { try { await api.updatePhoto(campId, photo.id, v); setEditing(false); onChanged(); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save details.'); } }}
          onCancel={() => setEditing(false)}
        />
      )}
      {err && <p className="err">{err}</p>}
      {photo.comments.map(c => <p key={c.id} className="small" style={{ margin: '6px 0' }}>{c.body}</p>)}
      <div className="row" style={{ marginTop: 6 }}>
        <input className="grow" value={comment} onChange={e => setComment(e.target.value)} placeholder="Add a comment…" />
        <button className="btn small" disabled={!comment.trim() || badComment} onClick={async () => { try { await api.addPhotoComment(campId, photo.id, { body: comment.trim() }); setComment(''); onChanged(); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not comment.'); } }}>Post</button>
      </div>
      {badComment && <p className="err">{BAD_LANGUAGE_WARNING}</p>}
      {full && (
        <div className="sheet" onClick={() => setFull(false)}>
          <div className="sheet-inner" onClick={e => e.stopPropagation()}>
            {broken || !photo.imageUrl || photo.imageUrl.startsWith('./blobs/') ? (
              <div className="img-fallback">{photo.species} — photo needs re-upload</div>
            ) : (
              <img className="feed-img" src={photo.imageUrl} alt={photo.caption || photo.species} />
            )}
            <p style={{ marginTop: 10 }}><strong>{photo.species}</strong> · {fmtTime(photo.createdAt)}</p>
            {photo.caption && <p>{photo.caption}</p>}
            <HarvestChips post={photo} />
            <div className="row" style={{ marginTop: 10 }}>
              <TrophyCardButton photo={photo} place={campName} />
              <button className="btn" onClick={() => setFull(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function PinSheet({ sheet, onClose, onSaved, campId }: { sheet: { mode: 'create' | 'edit'; pin?: Pin; lat?: number; lng?: number }; onClose: () => void; onSaved: () => void; campId: number }) {
  const pin = sheet.pin;
  const [name, setName] = useState(pin?.name ?? '');
  const [type, setType] = useState(pin?.pinType ?? 'stand');
  const [color, setColor] = useState(pin?.color ?? '#C2702E');
  const [notes, setNotes] = useState(pin?.notes ?? '');
  const [winds, setWinds] = useState<string[]>(pin?.bestWinds ?? []);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const lat = pin?.lat ?? sheet.lat ?? 0;
  const lng = pin?.lng ?? sheet.lng ?? 0;
  const isStand = type === 'stand' || type === 'blind';
  const badText = containsBadLanguage(name) || containsBadLanguage(notes);

  async function save() {
    setBusy(true); setErr('');
    try {
      const body = { name: name.trim() || pin?.label || 'Pin', pinType: type, color, notes, bestWinds: isStand ? winds : [], lat, lng };
      if (sheet.mode === 'edit' && pin) await api.updatePin(campId, pin.id, body);
      else await api.createPin(campId, body);
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save pin.'); }
    finally { setBusy(false); }
  }
  return (
    <div className="sheet" onClick={onClose}>
      <div className="sheet-inner" onClick={e => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>{sheet.mode === 'edit' ? `Pin settings: ${pin?.name ?? ''}` : 'Drop a pin here?'}</h2>
        <p className="muted">{lat.toFixed(5)}, {lng.toFixed(5)}</p>
        <label>Name</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. North Ridge Stand" />
        <label>Pin type</label>
        <div className="symbol-grid">
          {PIN_TYPES.map(t => (
            <button key={t.type} className={type === t.type ? 'on selected' : ''} onClick={() => setType(t.type)}>{t.symbol}<br />{t.label}</button>
          ))}
        </div>
        <label>Color</label>
        <div className="row">
          <input type="color" value={color} onChange={e => setColor(e.target.value)} style={{ width: 48 }} />
          <div className="swatches">{PIN_COLORS.map(c => <button key={c} className={`swatch ${color === c ? 'on' : ''}`} style={{ background: c }} onClick={() => setColor(c)} aria-label={c} />)}</div>
        </div>
        {isStand && (
          <>
            <label>Best winds — tap the directions this stand works best in</label>
            <div className="compass">
              {WIND_DIRS.map(d => <button key={d} className={winds.includes(d) ? 'on selected' : ''} onClick={() => setWinds(prev => prev.includes(d) ? prev.filter(w => w !== d) : [...prev, d])}>{d}</button>)}
            </div>
          </>
        )}
        <label>Notes</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes about this spot…" />
        {badText && <p className="err">{BAD_LANGUAGE_WARNING}</p>}
        {err && <p className="err">{err}</p>}
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn primary grow" disabled={busy || badText} onClick={save}>Save pin</button>
          <button className="btn" onClick={onClose}>Cancel</button>
        </div>
        {sheet.mode === 'edit' && pin && (
          <div style={{ marginTop: 10 }}>
            {confirmDelete ? (
              <div className="row">
                <button className="btn danger grow" onClick={async () => { setBusy(true); try { await api.deletePin(campId, pin.id); onSaved(); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not delete pin.'); } finally { setBusy(false); } }}>Yes, delete this pin</button>
                <button className="btn" onClick={() => setConfirmDelete(false)}>Keep it</button>
              </div>
            ) : (
              <button className="btn danger" onClick={() => setConfirmDelete(true)}>Delete pin</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
