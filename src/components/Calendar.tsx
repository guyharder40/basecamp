import { useMemo, useState } from 'react';
import { getStateSeasons, seasonStatus } from '../data/seasons';
import { US_STATES } from '../types';
import type { Profile } from '../types';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas',
  KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon',
  PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas',
  UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};
function fmtFull(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}, ${d.getFullYear()}`;
}
function durationDays(open: string, close: string): number {
  return Math.round((new Date(close + 'T00:00:00').getTime() - new Date(open + 'T00:00:00').getTime()) / 86400000) + 1;
}

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
  const stateName = STATE_NAMES[state] ?? state;
  const years = useMemo(() => {
    const ys = data.seasons.flatMap(s => [Number(s.open.slice(0, 4)), Number(s.close.slice(0, 4))]);
    return { first: Math.min(...ys), last: Math.max(...ys) };
  }, [data]);
  // Group by the month the season OPENS, in calendar order across the
  // season span (September first, spring last) — not by month number.
  const byMonth = new Map<string, typeof filtered>();
  [...filtered].sort((a, b) => a.open.localeCompare(b.open)).forEach(s => {
    const key = s.open.slice(0, 7);
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key)!.push(s);
  });
  const monthKeys = [...byMonth.keys()].sort();

  function pick(nextState: string) {
    setState(nextState);
    onStateChange(nextState);
  }
  return (
    <div className="card">
      <div className="cal-eyebrow">Seasons · {years.first}–{years.last}</div>
      <h2>Hunting Calendar</h2>
      <p className="muted" style={{ marginTop: 0 }}>Pick your state and the calendar fills in with that state's deer and turkey season dates — what's open now, what opens next, and when it closes.</p>
      <div className="stat-tiles">
        <div className="stat-tile"><div className="stat-num">{openNow.length}</div><div className="stat-label">Open now</div></div>
        <div className="stat-tile"><div className="stat-num">{data.seasons.length}</div><div className="stat-label">Seasons</div></div>
      </div>
      <label>Your hunting state</label>
      <select className="state-select" value={state} onChange={e => pick(e.target.value)}>
        {US_STATES.map(s => <option key={s} value={s}>{STATE_NAMES[s] ?? s}</option>)}
      </select>
      <p className="small">Saved on your profile — it'll still be {stateName} next time you open Basecamp, until you change it here.</p>
      <h3 style={{ marginTop: 18 }}>{stateName} — {years.first}–{years.last} seasons</h3>
      <p className="muted" style={{ marginTop: 0 }}>{data.agency}</p>
      {next && (
        <div className="next-opener"><strong>Next opener:</strong> {next.species} — {next.name} — {fmtFull(next.open)} (in {next.days} day{next.days === 1 ? '' : 's'})</div>
      )}
      <div className="row-wrap" style={{ marginTop: 14 }}>
        {speciesList.map(sp => <button key={sp} className={`chip ${species === sp ? 'on' : ''}`} onClick={() => setSpecies(sp)}>{sp}</button>)}
      </div>
      <label className="checkrow hide-check" style={{ marginTop: 10 }}>
        <input type="checkbox" checked={hideEnded} onChange={e => { setHideEnded(e.target.checked); localStorage.setItem('basecamp-hide-ended', e.target.checked ? '1' : '0'); }} /> Hide ended
      </label>
      {monthKeys.length === 0 && <p className="muted">No seasons to show with these filters.</p>}
      {monthKeys.map(key => {
        const d = new Date(key + '-01T00:00:00');
        return (
          <div key={key}>
            <div className="month-label">{MONTHS[d.getMonth()]} {d.getFullYear()} openers</div>
            {byMonth.get(key)!.map(s => (
              <div key={s.name + s.open} className="season-row">
                <div className="row">
                  <span className="species-pill">{s.species}</span>
                  <strong className="grow">{s.species} — {s.name}</strong>
                  {s.status === 'open' && <span className="pill open">● Open now · {s.days}d left</span>}
                  {s.status === 'upcoming' && <span className="pill">Opens in {s.days} day{s.days === 1 ? '' : 's'}</span>}
                  {s.status === 'ended' && <span className="pill gray">Ended</span>}
                </div>
                <div className="small" style={{ marginTop: 6 }}>{fmtFull(s.open)} – {fmtFull(s.close)} · {durationDays(s.open, s.close)} days</div>
              </div>
            ))}
          </div>
        );
      })}
      <p className="small">Season dates are approximate — verify before you hunt. <a href={data.url} target="_blank" rel="noreferrer">{data.agency} regulations</a></p>
    </div>
  );
}
