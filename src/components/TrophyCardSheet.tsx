import { useState } from 'react';
import { buildTrophyCard, downloadPng, sharePng } from '../lib/trophyCard';
import type { CommunityPost, Photo } from '../types';
import { HARVEST_CLASSES } from '../types';
import { fmtDate } from '../types';

export function harvestChips(p: { harvestClass?: string; weightLbs?: number | null; antlerScore?: number | null; antlerPoints?: number | null; species?: string }): string[] {
  const chips: string[] = [];
  if (p.harvestClass) chips.push(p.harvestClass);
  if (p.weightLbs) chips.push(`${p.weightLbs} lbs`);
  if (p.antlerScore) chips.push(`${p.antlerScore}" antlers`);
  if (p.antlerPoints) chips.push(`${p.antlerPoints} pts`);
  return chips;
}

export function HarvestChips({ post }: { post: Photo | CommunityPost }) {
  const chips = harvestChips(post);
  if (chips.length === 0) return null;
  return (
    <div className="row-wrap" style={{ marginTop: 6 }}>
      {chips.map(c => <span key={c} className="pill orange">{c}</span>)}
    </div>
  );
}

export function HarvestForm({ initial, onSave, onCancel, saving }: {
  initial: { harvestClass?: string; weightLbs?: number | null; antlerScore?: number | null; antlerPoints?: number | null };
  onSave: (v: { harvestClass: string; weightLbs: number | null; antlerScore: number | null; antlerPoints: number | null }) => void;
  onCancel: () => void; saving?: boolean;
}) {
  const [cls, setCls] = useState(initial.harvestClass ?? '');
  const [weight, setWeight] = useState(initial.weightLbs != null ? String(initial.weightLbs) : '');
  const [score, setScore] = useState(initial.antlerScore != null ? String(initial.antlerScore) : '');
  const [points, setPoints] = useState(initial.antlerPoints != null ? String(initial.antlerPoints) : '');
  return (
    <div>
      <label>Buck / doe class</label>
      <select value={cls} onChange={e => setCls(e.target.value)}>
        {HARVEST_CLASSES.map(c => <option key={c} value={c}>{c || 'Not set'}</option>)}
      </select>
      <label>Weight (lbs)</label>
      <input value={weight} onChange={e => setWeight(e.target.value)} inputMode="decimal" placeholder="e.g. 140" />
      <label>Antler score (inches)</label>
      <input value={score} onChange={e => setScore(e.target.value)} inputMode="decimal" placeholder="e.g. 132" />
      <label>Antler points</label>
      <input value={points} onChange={e => setPoints(e.target.value)} inputMode="numeric" placeholder="e.g. 8" />
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn primary grow" disabled={!!saving} onClick={() => onSave({
          harvestClass: cls,
          weightLbs: weight ? Number(weight) : null,
          antlerScore: score ? Number(score) : null,
          antlerPoints: points ? Number(points) : null,
        })}>Save details</button>
        <button className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

export function TrophyCardButton({ photo, place, hunter }: { photo: Photo | CommunityPost; place: string; hunter?: string }) {
  const [open, setOpen] = useState(false);
  const [dataUrl, setDataUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [shared, setShared] = useState(false);

  async function build() {
    setOpen(true); setBusy(true); setErr('');
    try {
      const url = await buildTrophyCard({
        imageUrl: photo.imageUrl,
        animal: photo.species || 'Trophy',
        hunter: hunter ?? photo.authorName,
        date: fmtDate(photo.createdAt),
        place,
        comment: photo.caption ?? '',
      });
      setDataUrl(url);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not build the card.'); }
    finally { setBusy(false); }
  }
  const fileName = `basecamp-trophy-${photo.id}.png`;
  return (
    <>
      <button className="btn small" onClick={build}>Trophy card</button>
      {open && (
        <div className="sheet" onClick={() => setOpen(false)}>
          <div className="sheet-inner" onClick={e => e.stopPropagation()}>
            <h2 style={{ marginTop: 0 }}>Trophy card</h2>
            {busy && <p>Building your card…</p>}
            {err && <p className="err">{err}</p>}
            {dataUrl && <img src={dataUrl} alt="Trophy card preview" style={{ width: '100%', borderRadius: 10 }} />}
            {dataUrl && (
              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn primary grow" onClick={() => downloadPng(dataUrl, fileName)}>Download card</button>
                <button className="btn grow" onClick={async () => { const ok = await sharePng(dataUrl, fileName, 'Basecamp trophy card'); setShared(ok); if (!ok) setErr('Sharing is not available on this device — use Download card instead.'); }}>Share card</button>
                <button className="btn" onClick={() => setOpen(false)}>Close</button>
              </div>
            )}
            {shared && <p className="okmsg">Card shared.</p>}
          </div>
        </div>
      )}
    </>
  );
}
