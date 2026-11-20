import { useState } from 'react';
import { api } from '../api';
import type { AppSettings, Profile } from '../types';
import { US_STATES } from '../types';

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button className={`toggle ${on ? 'on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}>
      <span className="toggle-knob" />
    </button>
  );
}

export default function SettingsPage({ profile, settings, onBack, onSettingsChanged, onEditProfile }: {
  profile: Profile; settings: AppSettings; onBack: () => void; onSettingsChanged: (s: AppSettings) => void; onEditProfile: () => void;
}) {
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  async function save(patch: Partial<AppSettings>) {
    setSaving(true); setErr('');
    try {
      const next = await api.updateSettings(patch);
      onSettingsChanged(next);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save that setting.'); }
    finally { setSaving(false); }
  }
  return (
    <div className="content">
      <button className="btn ghost" onClick={onBack}>← Profile</button>
      <div className="card" style={{ marginTop: 8 }}>
        <h2 style={{ marginTop: 0 }}>Settings</h2>
        {err && <p className="err">{err}</p>}
        <h3>Account</h3>
        <p><strong>{profile.displayName || 'Hunter'}</strong><br /><span className="small">{profile.email || 'No email on file'}{profile.phone ? ` · ${profile.phone}` : ''}</span></p>
        <p className="small">Hunting calendar state: <strong>{profile.huntingState || 'Not set'}</strong> (set on your profile)</p>
        <button className="btn" onClick={onEditProfile}>Edit profile</button>

        <h3>Notifications</h3>
        <p className="muted">Basecamp does not send push notifications yet — these are saved as your standing choices for when it does.</p>
        {([
          ['notifyCampChat', 'Camp chat'],
          ['notifyTrophyActivity', 'Trophy likes & comments'],
          ['notifyStandActivity', 'Stand check-ins & reservations'],
          ['notifyCommunity', 'Community'],
          ['notifyBadges', 'Badges'],
          ['notifyWind', 'Good-wind stands'],
        ] as const).map(([key, label]) => (
          <div key={key} className="listrow">
            <span className="grow">{label}</span>
            <Toggle on={settings[key]} onChange={v => save({ [key]: v })} label={label} />
          </div>
        ))}

        <h3>Privacy</h3>
        <label>Who can see your profile</label>
        <select value={settings.profileVisibility} disabled={saving} onChange={e => save({ profileVisibility: e.target.value as AppSettings['profileVisibility'] })}>
          <option value="public">Everyone</option>
          <option value="friends">Friends only</option>
          <option value="private">Only me</option>
        </select>
        <div className="listrow" style={{ marginTop: 8 }}>
          <span className="grow">Discoverable in community group lists</span>
          <Toggle on={settings.discoverable} onChange={v => save({ discoverable: v })} label="Discoverable in community group lists" />
        </div>
        <p className="small">Email and phone visibility are set on your profile (public / friends-only / private, default private).</p>

        <h3>Preferences</h3>
        <label>Appearance</label>
        <select value={settings.theme} disabled={saving} onChange={e => save({ theme: e.target.value as AppSettings['theme'] })}>
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
        <label>Units</label>
        <select value={settings.units} disabled={saving} onChange={e => save({ units: e.target.value as AppSettings['units'] })}>
          <option value="imperial">mph / miles</option>
          <option value="metric">km/h / km</option>
        </select>
        <label>Default map view</label>
        <select value={settings.defaultMapView} disabled={saving} onChange={e => save({ defaultMapView: e.target.value })}>
          {['streets', 'satellite', 'topo', 'dark', 'grayscale'].map(v => <option key={v} value={v}>{v[0].toUpperCase() + v.slice(1)}</option>)}
        </select>

        <h3>About</h3>
        <p className="muted">Basecamp is an all-in-one hunting app: shared camps with maps, pins and trails, stand check-in and reservations, camp chat and trophy sharing, a hunting calendar, and a community of hunters. Your data is stored on your own account and is never sold. Season dates in the Hunting Calendar are approximate — always verify with the state agency before you hunt.</p>
        <p className="small">State agencies: {US_STATES.length} states supported in the calendar.</p>
      </div>
    </div>
  );
}
