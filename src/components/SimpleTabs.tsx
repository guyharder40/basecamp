import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Camp, GearItem, Hunt, Profile } from '../types';
import { GEAR_CATEGORIES, fmtDistanceUnits } from '../types';
import { containsBadLanguage, BAD_LANGUAGE_WARNING } from '../lib/profanity';
import MapView from './MapView';
import SeasonRecapPanel from './SeasonRecap';

const SPECIES = ['Whitetail Deer', 'Mule Deer', 'Elk', 'Turkey', 'Bear', 'Waterfowl', 'Upland Birds', 'Small Game', 'Other'];

export function GearTab({ gear, onChanged }: { gear: GearItem[]; onChanged: () => void }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Weapon');
  const [brand, setBrand] = useState('');
  const [notes, setNotes] = useState('');
  const [filter, setFilter] = useState('All');
  const [err, setErr] = useState('');
  const shown = gear.filter(g => filter === 'All' || g.category === filter);
  const badText = containsBadLanguage(name) || containsBadLanguage(brand) || containsBadLanguage(notes);
  async function add() {
    if (!name.trim()) { setErr('Enter a gear name first.'); return; }
    setErr('');
    try { await api.createGear({ name: name.trim(), category, brand: brand || undefined, notes: notes || undefined }); setName(''); setBrand(''); setNotes(''); onChanged(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not add gear.'); }
  }
  return (
    <div className="content">
      <div className="card">
        <h2>Gear Locker</h2>
        <div className="row-wrap">
          {['All', ...GEAR_CATEGORIES].map(c => <button key={c} className={`chip ${filter === c ? 'on' : ''}`} onClick={() => setFilter(c)}>{c}</button>)}
        </div>
        {shown.length === 0 && <p className="muted">No gear here yet.</p>}
        {shown.map(g => (
          <div key={g.id} className="listrow">
            <input type="checkbox" checked={g.packed} onChange={async () => { await api.updateGear(g.id, { packed: !g.packed }); onChanged(); }} aria-label="Packed" />
            <span className="grow"><strong>{g.name}</strong> <span className="pill">{g.category}</span><br /><span className="small">{[g.brand, g.notes].filter(Boolean).join(' · ')}</span></span>
            <button className="btn small danger" onClick={async () => { if (window.confirm(`Delete ${g.name}?`)) { await api.deleteGear(g.id); onChanged(); } }}>Delete</button>
          </div>
        ))}
        <h3>Add gear</h3>
        <label>Name</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. .30-06 rifle" />
        <label>Category</label>
        <select value={category} onChange={e => setCategory(e.target.value)}>{GEAR_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select>
        <label>Brand (optional)</label>
        <input value={brand} onChange={e => setBrand(e.target.value)} />
        <label>Notes (optional)</label>
        <input value={notes} onChange={e => setNotes(e.target.value)} />
        {badText && <p className="err">{BAD_LANGUAGE_WARNING}</p>}
        <div className="row" style={{ marginTop: 8 }}><button className="btn primary grow" disabled={!name.trim() || badText} onClick={add}>Add gear</button></div>
        {!name.trim() && <p className="small">Enter a gear name to add it.</p>}
        {err && <p className="err">{err}</p>}
      </div>
    </div>
  );
}

export function HuntsTab({ hunts, camps, profile, onChanged }: { hunts: Hunt[]; camps: Camp[]; profile: Profile; onChanged: () => void }) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [species, setSpecies] = useState('Whitetail Deer');
  const [stand, setStand] = useState('');
  const [campId, setCampId] = useState<number | null>(null);
  const [harvested, setHarvested] = useState(false);
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState('');
  const badText = containsBadLanguage(notes) || containsBadLanguage(stand);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<'all' | 'harvests' | 'noluck'>('all');
  async function add() {
    setErr('');
    try { await api.createHunt({ date, species, stand: stand || undefined, notes: notes || undefined, harvested, campId }); setNotes(''); setStand(''); setHarvested(false); setShowForm(false); onChanged(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not log hunt.'); }
  }
  const harvestCount = hunts.filter(h => h.harvested).length;
  const shownHunts = hunts.filter(h => filter === 'all' ? true : filter === 'harvests' ? !!h.harvested : !h.harvested);
  return (
    <div className="content">
      <div className="page-head">
        <h1>Hunt Log</h1>
        <p>Every sit, stalk, and harvest — on the record.</p>
      </div>
      <div className="card">
        <div className="row">
          <span className="grow muted">{hunts.length} hunt{hunts.length === 1 ? '' : 's'} · {harvestCount} harvest{harvestCount === 1 ? '' : 's'}</span>
          <button className="btn primary" onClick={() => setShowForm(v => !v)}>+ Log hunt</button>
        </div>
        <div className="row-wrap" style={{ marginTop: 10 }}>
          {([['all', 'All'], ['harvests', 'Harvests'], ['noluck', 'No luck']] as const).map(([id, label]) => (
            <button key={id} className={`chip ${filter === id ? 'on' : ''}`} onClick={() => setFilter(id)}>{label}</button>
          ))}
        </div>
        {shownHunts.length === 0 && (
          <div className="empty-box" style={{ marginTop: 12 }}>
            <div className="empty-title">Nothing here yet</div>
            <p className="muted" style={{ margin: '4px 0 0' }}>Log your first hunt and it will show up here.</p>
          </div>
        )}
        {shownHunts.map(h => (
          <div key={h.id} className="listrow">
            <span className="grow"><strong>{h.species}</strong> — {h.date}{h.harvested ? ' · Harvest' : ''}<br /><span className="small">{[h.stand, camps.find(c => c.id === h.campId)?.name, h.notes].filter(Boolean).join(' · ')}</span></span>
            <button className="btn small" onClick={async () => { await api.updateHunt(h.id, { harvested: !h.harvested }); onChanged(); }}>{h.harvested ? 'Unmark harvest' : 'Mark harvest'}</button>
            <button className="btn small danger" onClick={async () => { if (window.confirm('Delete this hunt log?')) { await api.deleteHunt(h.id); onChanged(); } }}>Delete</button>
          </div>
        ))}
        {showForm && (
        <div>
        <h3>Log a hunt</h3>
        <label>Date</label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} />
        <label>Species</label>
        <select value={species} onChange={e => setSpecies(e.target.value)}>{SPECIES.map(s => <option key={s} value={s}>{s}</option>)}</select>
        <label>Camp (optional)</label>
        <select value={campId ?? ''} onChange={e => setCampId(e.target.value ? Number(e.target.value) : null)}>
          <option value="">No camp</option>
          {camps.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <label>Stand (optional)</label>
        <input value={stand} onChange={e => setStand(e.target.value)} placeholder="Which stand?" />
        <label>
          <input type="checkbox" checked={harvested} onChange={e => setHarvested(e.target.checked)} /> Harvested on this hunt
        </label>
        <label>Notes (optional)</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="What happened out there?" />
        {badText && <p className="err">{BAD_LANGUAGE_WARNING}</p>}
        <div className="row" style={{ marginTop: 8 }}><button className="btn primary grow" disabled={badText} onClick={add}>Log hunt</button></div>
        {err && <p className="err">{err}</p>}
        </div>
        )}
      </div>
      <SeasonRecapPanel profile={profile} />
    </div>
  );
}

export function MapsTab({ camps, onPinSheet, onTrailCreated }: {
  camps: Camp[];
  onPinSheet: (campId: number, pin: import('../types').Pin | null, lat: number, lng: number) => void;
  onTrailCreated: (campId: number, points: { lat: number; lng: number }[], name: string, color: string) => void;
}) {
  const [campId, setCampId] = useState<number | null>(camps[0]?.id ?? null);
  const [pins, setPins] = useState<import('../types').Pin[]>([]);
  const [trails, setTrails] = useState<import('../types').Trail[]>([]);
  const [selectedPinId, setSelectedPinId] = useState<number | null>(null);
  const [pinHold, setPinHold] = useState<import('../types').Pin | null>(null);
  const camp = camps.find(c => c.id === campId) ?? camps[0];
  const [units] = useState<'imperial' | 'metric'>('imperial');
  useEffect(() => {
    if (!camp) return;
    api.getCampDetail(camp.id).then(d => { setPins(d.pins); setTrails(d.trails); setSelectedPinId(null); }).catch(() => { setPins([]); setTrails([]); });
  }, [camp?.id]);
  if (!camp) return <div className="content"><div className="card"><p>No camps yet. Create one on the Basecamp tab first.</p></div></div>;
  return (
    <div className="content" style={{ paddingBottom: 12 }}>
      <select value={camp.id} onChange={e => setCampId(Number(e.target.value))} style={{ height: 44, borderRadius: 999, marginBottom: 10, fontWeight: 600 }}>
        {camps.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <div>
        <MapView
          camp={camp} pins={pins} trails={trails} selectedPinId={selectedPinId} slim
          onSelectPin={p => setSelectedPinId(p?.id ?? null)}
          onAddPinAt={(lat, lng) => onPinSheet(camp.id, null, lat, lng)}
          onTrailCreated={(points, name, color) => { onTrailCreated(camp.id, points, name, color); api.getCampDetail(camp.id).then(d => { setPins(d.pins); setTrails(d.trails); }); }}
          onPinHold={p => setPinHold(p)}
        />
        {pinHold && (
          <div className="card" style={{ marginTop: 8 }}>
            <strong>{pinHold.name}</strong> <span className="pill">{pinHold.pinType}</span>
            <p className="small">{pinHold.notes || 'No notes.'}{pinHold.bestWinds.length ? ` · Best winds: ${pinHold.bestWinds.join(', ')}` : ''}</p>
            <div className="row">
              <button className="btn small" onClick={() => { onPinSheet(camp.id, pinHold, pinHold.lat, pinHold.lng); setPinHold(null); }}>Edit pin</button>
              <button className="btn small" onClick={() => setPinHold(null)}>Close</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
