import { useMemo, useState } from 'react';
import { getStateSeasons, seasonStatus } from '../data/seasons';
import { US_STATES } from '../types';
import type { Profile } from '../types';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
function monthOf(iso: string): number { return new Date(iso + 'T00:00:00').getMonth(); }
function fmtShort(iso: string): string { const d = new Date(iso + 'T00:00:00'); return `${MONTHS[d.getMonth()].slice(0,3)} ${d.getDate()}`; }

export default function HuntingCalendar({ profile, onStateChange }: { profile: Profile; onStateChange: (state: string) => void }) {
  const [state, setState] = useState(profile.huntingState || 'MD');
  const [species, setSpecies] = useState('All');
  const [hideEnded, setHideEnded] = useState(() => localStorage.getItem('basecamp-hide-ended') === '1');
  const data = useMemo(() => getStateSeasons(state), [state]);
  const today = new Date();
  const withStatus = data.seasons.map(s => ({ ...s, ...seasonStatus(s, today) }));
  const filtered = withStatus.filter(s => (species === 'All' || s.species === species) && (!hideEnded || s.status !== 'ended'));
  const openNow = withStatus.filter(s => s.status === 'open');
  const upcoming = withStatus.filter(s => s.status === 'upcoming').sort((a, b) => a.days - b.days);
  const next = upcoming[0];
  const speciesList = ['All', ...Array.from(new Set(data.seasons.map(s => s.species)))];
  const byMonth = new Map<number, typeof filtered>();
  filtered.forEach(s => { const m = monthOf(s.open); if (!byMonth.has(m)) byMonth.set(m, []); byMonth.get(m)!.push(s); });
  const months = [...byMonth.keys()].sort((a, b) => a - b);

  function pick(nextState: string) {
    setState(nextState);
    onStateChange(nextState);
  }
  return (
    <div className="card">
      <h2>Hunting Calendar</h2>
      <label>State</label>
      <select value={state} onChange={e => pick(e.target.value)}>
        {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <p className="muted">{data.agency}</p>
      {next && <p><strong>Next opener:</strong> {next.species} {next.name} — {fmtShort(next.open)} (in {next.days} day{next.days === 1 ? '' : 's'})</p>}
      <p className="muted">{openNow.length} season{openNow.length === 1 ? '' : 's'} open now.</p>
      <div className="row-wrap">
        {speciesList.map(sp => <button key={sp} className={`chip ${species === sp ? 'on' : ''}`} onClick={() => setSpecies(sp)}>{sp}</button>)}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
          <input type="checkbox" checked={hideEnded} onChange={e => { setHideEnded(e.target.checked); localStorage.setItem('basecamp-hide-ended', e.target.checked ? '1' : '0'); }} /> Hide ended
        </label>
      </div>
      {months.length === 0 && <p className="muted">No seasons to show with these filters.</p>}
      {months.map(m => (
        <div key={m}>
          <h3>{MONTHS[m]}</h3>
          {byMonth.get(m)!.map(s => (
            <div key={s.name + s.open} className="listrow">
              <span className="grow"><strong>{s.species} — {s.name}</strong><br /><span className="small">{fmtShort(s.open)} – {fmtShort(s.close)}</span></span>
              {s.status === 'open' && <span className="pill">Open now · {s.days} days left</span>}
              {s.status === 'upcoming' && <span className="pill">Opens in {s.days} day{s.days === 1 ? '' : 's'}</span>}
              {s.status === 'ended' && <span className="pill gray">Ended</span>}
            </div>
          ))}
        </div>
      ))}
      <p className="small">Season dates are approximate — verify before you hunt. <a href={data.url} target="_blank" rel="noreferrer">{data.agency} regulations</a></p>
    </div>
  );
}
