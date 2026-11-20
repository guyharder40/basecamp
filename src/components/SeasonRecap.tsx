import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Profile, SeasonRecap } from '../types';
import { buildRecapCard, downloadPng, sharePng } from '../lib/trophyCard';

export default function SeasonRecapPanel({ profile }: { profile: Profile }) {
  const [open, setOpen] = useState(() => localStorage.getItem('basecamp-recap-open') === '1');
  const [recap, setRecap] = useState<SeasonRecap | null>(null);
  const [seasonYear, setSeasonYear] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [picked, setPicked] = useState<number[]>([]);
  const [cardUrl, setCardUrl] = useState('');
  const [cardBusy, setCardBusy] = useState(false);
  const [showCard, setShowCard] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.getRecap(seasonYear)
      .then(r => { setRecap(r); setErr(''); setPicked([]); })
      .catch(e => setErr(e instanceof Error ? e.message : 'Could not load the season recap.'))
      .finally(() => setLoading(false));
  }, [seasonYear]);

  function toggleOpen() {
    const next = !open;
    setOpen(next);
    localStorage.setItem('basecamp-recap-open', next ? '1' : '0');
  }
  function togglePick(id: number) {
    setPicked(prev => prev.includes(id) ? prev.filter(x => x !== id) : prev.length >= 4 ? prev : [...prev, id]);
  }
  async function buildCard() {
    if (!recap) return;
    setCardBusy(true); setErr('');
    try {
      const photos = recap.photos.filter(p => picked.includes(p.id));
      const url = await buildRecapCard({
        name: profile.displayName || 'Hunter',
        season: recap.season,
        state: profile.huntingState || '',
        photoUrls: photos.map(p => p.imageUrl),
        stats: [
          { label: 'Hunts', value: String(recap.hunts) },
          { label: 'Harvests', value: String(recap.harvests) },
          { label: 'Success', value: `${recap.successRate}%` },
          { label: 'Days afield', value: String(recap.daysAfield) },
          { label: 'Check-ins', value: String(recap.checkins) },
          { label: 'Season score', value: String(recap.seasonScore) },
        ],
        speciesLine: recap.species.length ? `Species: ${recap.species.join(', ')}` : '',
        highlightLines: [
          recap.biggestBuck ? `Biggest buck: ${recap.biggestBuck}"` : '',
          recap.heaviestLbs ? `Heaviest harvest: ${recap.heaviestLbs} lbs` : '',
        ].filter(Boolean),
        badges: recap.badgesEarned.map(b => b.name),
      });
      setCardUrl(url);
      setShowCard(true);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not build the recap card.'); }
    finally { setCardBusy(false); }
  }

  return (
    <div className="card">
      <div className="row">
        <div className="grow">
          <h2 style={{ margin: 0 }}>Season recap</h2>
          <p className="muted" style={{ margin: '2px 0 0' }}>
            {recap ? `${recap.season} season${recap.inProgress ? ' · In progress' : ''}` : 'Your season by the numbers'}
          </p>
        </div>
        <button className="round-arrow" aria-expanded={open} aria-label={open ? 'Collapse season recap' : 'Expand season recap'} onClick={toggleOpen}>
          {open ? '⌃' : '⌄'}
        </button>
      </div>
      {open && (
        <div style={{ marginTop: 10 }}>
          {loading && <p>Loading the season…</p>}
          {err && <p className="err">{err}</p>}
          {recap && (
            <>
              {recap.availableSeasons.length > 1 && (
                <div className="row-wrap" style={{ marginBottom: 8 }}>
                  {recap.availableSeasons.map(y => (
                    <button key={y} className={`chip ${(seasonYear ?? recap.startYear) === y ? 'on' : ''}`} onClick={() => setSeasonYear(y)}>
                      {`${y}–${String(y + 1).slice(2)}`}{y === recap.startYear && recap.inProgress ? ' · In progress' : ''}
                    </button>
                  ))}
                </div>
              )}
              {!recap.hasActivity && <p className="muted">Nothing recorded this season yet — hunts, trophies and check-ins will show up here.</p>}
              <div className="stat-grid">
                <div className="stat-tile"><strong>{recap.hunts}</strong><span>Hunts</span></div>
                <div className="stat-tile"><strong>{recap.harvests}</strong><span>Harvests</span></div>
                <div className="stat-tile"><strong>{recap.successRate}%</strong><span>Success rate</span></div>
                <div className="stat-tile"><strong>{recap.daysAfield}</strong><span>Days afield</span></div>
                <div className="stat-tile"><strong>{recap.trophyPosts}</strong><span>Trophy posts</span></div>
                <div className="stat-tile"><strong>{recap.seasonScore}</strong><span>Season score</span></div>
              </div>
              {recap.species.length > 0 && <p>Species: <strong>{recap.species.join(', ')}</strong></p>}
              <p className="small">
                {recap.likes} likes · {recap.comments} comments on your trophy posts
                {recap.biggestBuck ? ` · Biggest buck ${recap.biggestBuck}"` : ''}
                {recap.heaviestLbs ? ` · Heaviest harvest ${recap.heaviestLbs} lbs` : ''}
              </p>
              <p className="small">{recap.checkins} stand check-ins · {recap.standsHunted} stand{recap.standsHunted === 1 ? '' : 's'} hunted · {recap.reservations} reservations</p>
              {recap.badgesEarned.length > 0 && (
                <p>Badges earned this season: <strong>{recap.badgesEarned.map(b => b.name).join(', ')}</strong></p>
              )}
              {recap.photos.length > 0 && (
                <>
                  <h3>Photos from this season</h3>
                  <p className="muted">Tap up to 4 photos for your recap card.</p>
                  <div className="row-wrap">
                    {recap.photos.map(p => (
                      <button key={p.id} className={`recap-photo ${picked.includes(p.id) ? 'selected' : ''}`} onClick={() => togglePick(p.id)} aria-pressed={picked.includes(p.id)}>
                        {p.imageUrl && !p.imageUrl.startsWith('./blobs/')
                          ? <img src={p.imageUrl} alt={p.caption || p.species} />
                          : <span className="recap-photo-fallback">{p.species}</span>}
                        <span className="recap-photo-cap">{p.caption || p.species}</span>
                      </button>
                    ))}
                  </div>
                  <div className="row" style={{ marginTop: 10 }}>
                    <button className="btn primary grow" disabled={cardBusy} onClick={buildCard}>Build recap card</button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
      {showCard && cardUrl && (
        <div className="sheet" onClick={() => setShowCard(false)}>
          <div className="sheet-inner" onClick={e => e.stopPropagation()}>
            <h2 style={{ marginTop: 0 }}>Season recap card</h2>
            <img src={cardUrl} alt="Season recap card preview" style={{ width: '100%', borderRadius: 10 }} />
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn primary grow" onClick={() => downloadPng(cardUrl, `basecamp-recap-${recap?.season ?? 'season'}.png`)}>Download card</button>
              <button className="btn grow" onClick={async () => { const ok = await sharePng(cardUrl, `basecamp-recap-${recap?.season ?? 'season'}.png`, 'Basecamp season recap'); if (!ok) setErr('Sharing is not available on this device — use Download card instead.'); }}>Share card</button>
              <button className="btn" onClick={() => setShowCard(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
