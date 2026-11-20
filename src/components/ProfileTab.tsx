import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import type { AppSettings, Badge, Friend, FriendRequest, GearItem, License, Profile, Visibility } from '../types';
import { INTEREST_PRESETS, US_STATES, badgeEmoji } from '../types';
import { containsBadLanguage, BAD_LANGUAGE_WARNING } from '../lib/profanity';
import { GearTab } from './SimpleTabs';
import SettingsPage from './SettingsPage';

type SubTab = 'friends' | 'licenses' | 'gear' | 'badges';

export default function ProfileTab({ profile, friends, gear, settings, onProfileChanged, onFriendsChanged, onSettingsChanged }: {
  profile: Profile; friends: Friend[]; gear: GearItem[]; settings: AppSettings;
  onProfileChanged: () => void; onFriendsChanged: () => void; onSettingsChanged: (s: AppSettings) => void;
}) {
  const [sub, setSub] = useState<SubTab>(() => (localStorage.getItem('basecamp-profile-subtab') as SubTab) || 'friends');
  const [showSettings, setShowSettings] = useState(false);
  const [editing, setEditing] = useState(false);
  const [firstName, setFirstName] = useState(profile.firstName);
  const [lastName, setLastName] = useState(profile.lastName);
  const [status, setStatus] = useState(profile.status);
  const [bio, setBio] = useState(profile.bio);
  const [email, setEmail] = useState(profile.email);
  const [emailVis, setEmailVis] = useState<Visibility>(profile.emailVisibility);
  const [phone, setPhone] = useState(profile.phone);
  const [phoneVis, setPhoneVis] = useState<Visibility>(profile.phoneVisibility);
  const [interests, setInterests] = useState<string[]>(profile.interests);
  const [customInterest, setCustomInterest] = useState('');
  const [search, setSearch] = useState('');
  const [fName, setFName] = useState('');
  const [fEmail, setFEmail] = useState('');
  const [fPhone, setFPhone] = useState('');
  const [fNotes, setFNotes] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [licenses, setLicenses] = useState<License[]>([]);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [earnedCount, setEarnedCount] = useState(0);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [badgePop, setBadgePop] = useState<Badge | null>(null);
  const [licState, setLicState] = useState('MD');
  const [licKind, setLicKind] = useState('');
  const [licNumber, setLicNumber] = useState('');
  const [licIssued, setLicIssued] = useState('');
  const [licExpiry, setLicExpiry] = useState('');
  const [licCoverage, setLicCoverage] = useState('');
  const [licNotes, setLicNotes] = useState('');
  const [showLicForm, setShowLicForm] = useState(false);
  const [tagForms, setTagForms] = useState<Record<number, boolean>>({});
  const [tagAnimal, setTagAnimal] = useState('');
  const [tagKind, setTagKind] = useState('');
  const [tagNumber, setTagNumber] = useState('');

  const loadLicenses = useCallback(async () => { try { setLicenses(await api.listLicenses()); } catch { /* empty */ } }, []);
  const loadBadges = useCallback(async () => {
    try { const r = await api.getBadges(); setBadges(r.badges); setEarnedCount(r.earned); } catch { /* empty */ }
  }, []);
  const loadRequests = useCallback(async () => { try { setRequests(await api.listFriendRequests()); } catch { /* empty */ } }, []);
  useEffect(() => { loadLicenses(); loadBadges(); loadRequests(); }, [loadLicenses, loadBadges, loadRequests]);
  useEffect(() => { localStorage.setItem('basecamp-profile-subtab', sub); }, [sub]);

  const showContact = (profile.email && profile.emailVisibility === 'public') || (profile.phone && profile.phoneVisibility === 'public');
  const filteredFriends = friends.filter(f => f.name.toLowerCase().includes(search.toLowerCase()));
  const pinned = profile.pinnedBadges ?? [];
  const badProfileText = containsBadLanguage(status) || containsBadLanguage(bio) || containsBadLanguage(firstName) || containsBadLanguage(lastName);

  async function saveProfile() {
    if (badProfileText) { setErr(BAD_LANGUAGE_WARNING); return; }
    setBusy(true); setErr('');
    try {
      const clean = interests.map(i => i.trim()).filter(Boolean).map(i => i.slice(0, 60));
      await api.updateProfile({ firstName: firstName.trim(), lastName: lastName.trim(), status: status.trim(), bio, email: email.trim(), emailVisibility: emailVis, phone: phone.trim(), phoneVisibility: phoneVis, interests: clean });
      setEditing(false); setMsg('Profile saved.'); onProfileChanged();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save profile.'); }
    finally { setBusy(false); }
  }
  function startEdit() {
    setFirstName(profile.firstName); setLastName(profile.lastName); setStatus(profile.status); setBio(profile.bio);
    setEmail(profile.email); setEmailVis(profile.emailVisibility); setPhone(profile.phone); setPhoneVis(profile.phoneVisibility);
    setInterests(profile.interests); setEditing(true);
  }
  async function addFriend(quickName?: string) {
    const name = (quickName ?? fName).trim();
    if (!name) { setErr('Enter a name to add a friend.'); return; }
    setBusy(true); setErr('');
    try {
      await api.addFriend({ name, email: fEmail || undefined, phone: fPhone || undefined, notes: fNotes || undefined });
      setFName(''); setFEmail(''); setFPhone(''); setFNotes(''); setSearch(''); onFriendsChanged();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not add friend.'); }
    finally { setBusy(false); }
  }
  async function togglePin(badge: Badge) {
    const has = pinned.includes(badge.id);
    const next = has ? pinned.filter(x => x !== badge.id) : pinned.length >= 3 ? pinned : [...pinned, badge.id];
    try {
      await api.updateProfile({ pinnedBadges: next });
      setBadgePop(null);
      onProfileChanged();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not pin that badge.'); }
  }
  const expiring = licenses.filter(l => {
    if (!l.expiryDate) return false;
    const days = Math.round((new Date(l.expiryDate).getTime() - Date.now()) / 86400000);
    return days <= 30;
  });

  if (showSettings) {
    return <SettingsPage profile={profile} settings={settings} onBack={() => setShowSettings(false)} onSettingsChanged={onSettingsChanged} onEditProfile={() => { setShowSettings(false); startEdit(); }} />;
  }

  const visOptions = (['public', 'friends', 'private'] as Visibility[]).map(v => <option key={v} value={v}>{v === 'public' ? 'Public' : v === 'friends' ? 'Friends only' : 'Private'}</option>);

  return (
    <div className="content">
      <div className="card">
        <div className="banner" />
        <div style={{ display: 'flex', marginTop: -32, paddingLeft: 8 }}>
          <div className="avatar" style={{ border: '3px solid #fff' }}>{(profile.displayName || 'H').charAt(0)}</div>
        </div>
        <div style={{ marginTop: 10 }}>
          <div className="row">
            <h2 className="grow" style={{ margin: 0 }}>
              {profile.displayName || 'Hunter'}
              {pinned.length > 0 && (
                <span style={{ marginLeft: 8 }}>
                  {pinned.map(id => <span key={id} title={badges.find(b => b.id === id)?.name ?? id} className="pinned-medal">{badgeEmoji(id)}</span>)}
                </span>
              )}
            </h2>
            {!editing && <button className="btn small" onClick={startEdit}>Edit Profile</button>}
            {!editing && <button className="btn small" aria-label="Settings" onClick={() => setShowSettings(true)}>⚙ Settings</button>}
          </div>
          <p className="status" style={{ margin: '4px 0 0' }}>{profile.status || 'No status set'}</p>
          {profile.bio && <p>{profile.bio}</p>}
          {showContact && (
            <div className="row-wrap" style={{ marginTop: 8 }}>
              {profile.email && profile.emailVisibility === 'public' && <span className="pill">{profile.email}</span>}
              {profile.phone && profile.phoneVisibility === 'public' && <span className="pill">{profile.phone}</span>}
            </div>
          )}
        </div>
        {editing ? (
          <div>
            {err && <p className="err">{err}</p>}
            {badProfileText && <p className="err">{BAD_LANGUAGE_WARNING}</p>}
            <div className="row"><button className="btn primary grow" disabled={busy || badProfileText} onClick={saveProfile}>Save</button><button className="btn" onClick={() => setEditing(false)}>Cancel</button></div>
            <label>First name</label>
            <input value={firstName} onChange={e => setFirstName(e.target.value)} />
            <label>Last name</label>
            <input value={lastName} onChange={e => setLastName(e.target.value)} />
            <label>Status — shows under your name</label>
            <input value={status} onChange={e => setStatus(e.target.value)} placeholder="e.g. In the stand this weekend" />
            <label>About yourself</label>
            <textarea value={bio} onChange={e => setBio(e.target.value)} placeholder="Tell people about yourself…" />
            <label>Email</label>
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" />
            <label>Email visibility</label>
            <select value={emailVis} onChange={e => setEmailVis(e.target.value as Visibility)}>{visOptions}</select>
            <label>Phone</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone" />
            <label>Phone visibility</label>
            <select value={phoneVis} onChange={e => setPhoneVis(e.target.value as Visibility)}>{visOptions}</select>
            <label>Interests</label>
            <div className="row-wrap">
              {INTEREST_PRESETS.map(i => (
                <button key={i} className={`chip ${interests.includes(i) ? 'on' : ''}`} onClick={() => setInterests(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i])}>{i}</button>
              ))}
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <input className="grow" value={customInterest} onChange={e => setCustomInterest(e.target.value)} placeholder="Add a custom interest" />
              <button className="btn" onClick={() => { if (customInterest.trim()) { setInterests(prev => [...prev, customInterest.trim()]); setCustomInterest(''); } }}>Add</button>
            </div>
            {interests.length > 0 && <p className="small">Selected: {interests.join(', ')}</p>}
            <div className="row" style={{ marginTop: 10 }}><button className="btn primary grow" disabled={busy || badProfileText} onClick={saveProfile}>Save</button></div>
          </div>
        ) : (
          <div>
            {msg && <p className="okmsg">{msg}</p>}
            <h3>Interests</h3>
            {profile.interests.length === 0 ? <p className="muted">No interests added yet.</p> : <div className="row-wrap">{profile.interests.map(i => <span key={i} className="pill">{i}</span>)}</div>}
          </div>
        )}
      </div>

      <div className="subtabs" style={{ marginBottom: 10 }}>
        {([
          ['friends', `Friends (${friends.length})`],
          ['licenses', `Licenses & Tags (${licenses.length})`],
          ['gear', `Gear (${gear.length})`],
          ['badges', `Badges (${earnedCount}/25)`],
        ] as [SubTab, string][]).map(([id, label]) => (
          <button key={id} className={sub === id ? 'on' : ''} onClick={() => setSub(id)}>{label}</button>
        ))}
      </div>

      {sub === 'friends' && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Friends ({friends.length})</h2>
          {requests.filter(r => r.status === 'pending').length > 0 && (
            <>
              <h3>Friend requests</h3>
              {requests.filter(r => r.status === 'pending').map(r => (
                <div key={r.id} className="listrow">
                  <span className="grow"><strong>{r.fromName}</strong> wants to be friends</span>
                  <button className="btn small primary" onClick={async () => { await api.acceptFriendRequest(r.id); await loadRequests(); onFriendsChanged(); }}>Accept</button>
                  <button className="btn small" onClick={async () => { await api.declineFriendRequest(r.id); await loadRequests(); }}>Decline</button>
                </div>
              ))}
            </>
          )}
          <label>Search for a name</label>
          <div className="row">
            <input className="grow" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search for a name" />
            {search && <button className="btn" onClick={() => setSearch('')}>Clear</button>}
          </div>
          {search.trim() && !filteredFriends.some(f => f.name.toLowerCase() === search.trim().toLowerCase()) && (
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn grow" onClick={() => addFriend(search)}>+ Add “{search.trim()}” as a friend</button>
            </div>
          )}
          {filteredFriends.length === 0 && friends.length > 0 && <p className="muted">No friends match that search.</p>}
          {filteredFriends.map(f => (
            <div key={f.id} className="listrow">
              <span className="grow"><strong>{f.name}</strong>{f.email ? <><br /><span className="small">{f.email}</span></> : null}{f.notes ? <><br /><span className="small">{f.notes}</span></> : null}</span>
              <button className="btn small danger" onClick={async () => { if (window.confirm(`Remove ${f.name} from friends?`)) { await api.removeFriend(f.id); onFriendsChanged(); } }}>Remove</button>
            </div>
          ))}
          <h3>Add a friend</h3>
          <label>Name</label>
          <input value={fName} onChange={e => setFName(e.target.value)} placeholder="Full name" />
          <label>Email (optional)</label>
          <input value={fEmail} onChange={e => setFEmail(e.target.value)} placeholder="Email" />
          <label>Phone (optional)</label>
          <input value={fPhone} onChange={e => setFPhone(e.target.value)} placeholder="Phone" />
          <label>Notes (optional)</label>
          <input value={fNotes} onChange={e => setFNotes(e.target.value)} placeholder="So you can reach them / invite them to a camp" />
          <div className="row" style={{ marginTop: 8 }}><button className="btn primary grow" disabled={!fName.trim() || busy} onClick={() => addFriend()}>Add friend</button></div>
          {!fName.trim() && <p className="small">Enter a name to add a friend.</p>}
          {err && <p className="err">{err}</p>}
        </div>
      )}

      {sub === 'licenses' && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Licenses &amp; Tags</h2>
          {expiring.length > 0 && (
            <p className="err" style={{ background: '#fef2f2', padding: 8, borderRadius: 8 }}>
              Heads up: {expiring.map(l => `${l.kind} (${l.state}) expires ${l.expiryDate}`).join('; ')}
            </p>
          )}
          {licenses.length === 0 && <p className="muted">No licenses yet. Add your hunting license below.</p>}
          {licenses.map(l => {
            const filled = l.tags.filter(t => t.filled).length;
            const days = l.expiryDate ? Math.round((new Date(l.expiryDate).getTime() - Date.now()) / 86400000) : null;
            const status = !l.expiryDate ? 'No expiry set' : days! < 0 ? 'Expired' : days! <= 30 ? `Expires in ${days} days` : 'Valid';
            return (
              <div key={l.id} style={{ borderTop: '1px solid #eee', paddingTop: 10, marginTop: 10 }}>
                <div className="row">
                  <span className="grow"><strong>{l.kind}</strong> · {l.state}<br /><span className="small">{l.licenseNumber}{l.coverage ? ` · ${l.coverage}` : ''}{l.notes ? ` · ${l.notes}` : ''}</span></span>
                  <span className={`pill ${status === 'Valid' ? '' : 'orange'}`}>{status}</span>
                  <button className="btn small danger" onClick={async () => { if (window.confirm('Delete this license and its tags?')) { await api.deleteLicense(l.id); await loadLicenses(); } }}>Delete</button>
                </div>
                <p className="small">Tags: {filled} filled / {l.tags.length - filled} left</p>
                {l.tags.map(t => (
                  <div key={t.id} className="listrow">
                    <span className="grow"><strong>{t.animal}</strong> · {t.kind} · #{t.tagNumber}<br /><span className="small">{t.filled ? `Filled ${t.filledDate}` : 'Not filled'}</span></span>
                    {!t.filled && <button className="btn small primary" onClick={async () => { await api.fillTag(t.id); await loadLicenses(); }}>Fill tag</button>}
                    <button className="btn small danger" onClick={async () => { await api.deleteTag(t.id); await loadLicenses(); }}>Delete</button>
                  </div>
                ))}
                {!tagForms[l.id] && <button className="btn small" onClick={() => setTagForms(prev => ({ ...prev, [l.id]: true }))}>+ Add a tag</button>}
                {tagForms[l.id] && (
                  <div>
                    <label>Animal</label>
                    <input value={tagAnimal} onChange={e => setTagAnimal(e.target.value)} placeholder="e.g. Whitetail Deer" />
                    <label>Kind</label>
                    <input value={tagKind} onChange={e => setTagKind(e.target.value)} placeholder="e.g. Antlered" />
                    <label>Tag number</label>
                    <input value={tagNumber} onChange={e => setTagNumber(e.target.value)} placeholder="Tag number" />
                    <div className="row" style={{ marginTop: 8 }}>
                      <button className="btn primary grow" disabled={!tagAnimal.trim() || !tagNumber.trim()} onClick={async () => { await api.addTag(l.id, { animal: tagAnimal.trim(), kind: tagKind.trim(), tagNumber: tagNumber.trim() }); setTagAnimal(''); setTagKind(''); setTagNumber(''); setTagForms(prev => ({ ...prev, [l.id]: false })); await loadLicenses(); }}>Add tag</button>
                      <button className="btn" onClick={() => setTagForms(prev => ({ ...prev, [l.id]: false }))}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {!showLicForm && <button className="btn primary" style={{ marginTop: 10 }} onClick={() => setShowLicForm(true)}>+ Add a license</button>}
          {showLicForm && (
            <div>
              <label>State</label>
              <select value={licState} onChange={e => setLicState(e.target.value)}>{US_STATES.map(s => <option key={s} value={s}>{s}</option>)}</select>
              <label>Kind</label>
              <input value={licKind} onChange={e => setLicKind(e.target.value)} placeholder="e.g. Resident Hunting License" />
              <label>License number</label>
              <input value={licNumber} onChange={e => setLicNumber(e.target.value)} placeholder="License number" />
              <label>Issued date</label>
              <input type="date" value={licIssued} onChange={e => setLicIssued(e.target.value)} />
              <label>Expiry date</label>
              <input type="date" value={licExpiry} onChange={e => setLicExpiry(e.target.value)} />
              <label>Coverage</label>
              <input value={licCoverage} onChange={e => setLicCoverage(e.target.value)} placeholder="e.g. Deer, turkey" />
              <label>Notes</label>
              <input value={licNotes} onChange={e => setLicNotes(e.target.value)} placeholder="Notes" />
              <div className="row" style={{ marginTop: 8 }}>
                <button className="btn primary grow" disabled={!licKind.trim() || busy} onClick={async () => {
                  await api.createLicense({ state: licState, kind: licKind.trim(), licenseNumber: licNumber.trim(), issuedDate: licIssued, expiryDate: licExpiry, coverage: licCoverage.trim(), notes: licNotes.trim() });
                  setLicKind(''); setLicNumber(''); setLicIssued(''); setLicExpiry(''); setLicCoverage(''); setLicNotes(''); setShowLicForm(false); await loadLicenses();
                }}>Save license</button>
                <button className="btn" onClick={() => setShowLicForm(false)}>Cancel</button>
              </div>
              {!licKind.trim() && <p className="small">Kind is required.</p>}
            </div>
          )}
        </div>
      )}

      {sub === 'gear' && <GearTab gear={gear} onChanged={onProfileChanged} />}

      {sub === 'badges' && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Badges ({earnedCount} of 25 earned)</h2>
          <p className="muted">Badges are earned automatically from your real activity. Tap one to see it — pin up to 3 beside your name.</p>
          <div className="badge-grid">
            {badges.map(b => (
              <button key={b.id} className={`badge-cell ${b.earned ? 'earned' : 'locked'}`} onClick={() => setBadgePop(b)}>
                <span className="badge-medal">{badgeEmoji(b.id)}</span>
                <span className="badge-name">{b.name}</span>
                <span className="badge-prog">{b.earned ? 'Earned' : `${b.current}/${b.target}`}</span>
                {pinned.includes(b.id) && <span className="badge-pin">📌 Pinned</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {badgePop && (
        <div className="sheet" onClick={() => setBadgePop(null)}>
          <div className="sheet-inner" onClick={e => e.stopPropagation()} style={{ textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0 6px' }}><span className={`badge-medal badge-medal-lg ${badgePop.earned ? '' : 'medal-locked'}`}>{badgeEmoji(badgePop.id)}</span></div>
            <h2 style={{ margin: '8px 0 4px' }}>{badgePop.name}</h2>
            <p>{badgePop.description}</p>
            <p className="muted">{badgePop.earned ? 'Earned' : `Progress: ${badgePop.current} of ${badgePop.target}`}</p>
            {badgePop.earned && (
              <button className="btn primary grow" style={{ width: '100%' }} onClick={() => togglePin(badgePop)}>
                {pinned.includes(badgePop.id) ? 'Unpin from my name' : pinned.length >= 3 ? 'Already 3 pinned — unpin one first' : 'Pin beside my name'}
              </button>
            )}
            <button className="btn" style={{ marginTop: 8 }} onClick={() => setBadgePop(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
