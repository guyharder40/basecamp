import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import type { Camp, Pin, Trail, TrailPoint } from '../types';
import { PIN_COLORS, pinSymbol, trailDistanceFt, fmtDistance } from '../types';

export type MapStyle = 'streets' | 'satellite' | 'topo' | 'dark' | 'grayscale';
const STYLES: { id: MapStyle; label: string }[] = [
  { id: 'streets', label: 'Streets' },
  { id: 'satellite', label: 'Satellite' },
  { id: 'topo', label: 'Topo' },
  { id: 'dark', label: 'Dark' },
  { id: 'grayscale', label: 'Grayscale' },
];
function tileFor(style: MapStyle): { url: string; attr: string; cls?: string } {
  switch (style) {
    case 'satellite': return { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attr: 'Esri, Maxar, Earthstar Geographics' };
    case 'topo': return { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', attr: 'Esri, USGS, NOAA' };
    case 'dark': return { url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', attr: '© OpenStreetMap, © CARTO' };
    case 'grayscale': return { url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', attr: '© OpenStreetMap, © CARTO', cls: 'grayscale-tiles' };
    default: return { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attr: '© OpenStreetMap contributors' };
  }
}
function esc(s: string): string { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

interface Props {
  camp: Camp;
  pins: Pin[];
  trails: Trail[];
  selectedPinId?: number | null;
  onSelectPin: (pin: Pin | null) => void;
  onAddPinAt: (lat: number, lng: number) => void;
  onTrailCreated: (points: TrailPoint[], name: string, color: string) => void;
  onPinHold: (pin: Pin) => void;
  readOnly?: boolean;
  slim?: boolean;
  defaultView?: string;
  onMapViewChanged?: (view: MapStyle) => void;
  onFullscreenChange?: (fullscreen: boolean) => void;
}

export default function MapView({ camp, pins, trails, selectedPinId, onSelectPin, onAddPinAt, onTrailCreated, onPinHold, readOnly, slim, defaultView, onMapViewChanged, onFullscreenChange }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const draftRef = useRef<L.Polyline | null>(null);
  // Map view is remembered PER CAMP (server field + per-camp localStorage),
  // falling back to the Default map view setting, then the old global key.
  const [style, setStyle] = useState<MapStyle>(() => {
    const perCamp = localStorage.getItem(`basecamp-map-style-${camp.id}`) as MapStyle | null;
    if (perCamp) return perCamp;
    if (camp.mapView) return camp.mapView as MapStyle;
    if (defaultView) return defaultView as MapStyle;
    return (localStorage.getItem('basecamp-map-style') as MapStyle) || 'streets';
  });
  const [showLabels, setShowLabels] = useState(() => localStorage.getItem('basecamp-map-labels') !== 'off');
  const [showTrails, setShowTrails] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [mode, setMode] = useState<'none' | 'place-pin' | 'draw' | 'gps'>('none');
  const [drawTool, setDrawTool] = useState<'draw' | 'move'>('draw');
  const [drawPoints, setDrawPoints] = useState<TrailPoint[]>([]);
  const [drawColor, setDrawColor] = useState('#C2702E');
  const [trailName, setTrailName] = useState('');
  const [finishing, setFinishing] = useState(false);
  const [gpsPoints, setGpsPoints] = useState<TrailPoint[]>([]);
  const [gpsPaused, setGpsPaused] = useState(false);
  const [gpsError, setGpsError] = useState('');
  const [gpsStart, setGpsStart] = useState<number | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [showTrailOptions, setShowTrailOptions] = useState(false);
  const [hold, setHold] = useState<{ lat: number; lng: number; x: number; y: number } | null>(null);
  const holdTimer = useRef<number | null>(null);
  const holdInfo = useRef<{ lat: number; lng: number; x: number; y: number; pinId: number | null; startX: number; startY: number } | null>(null);
  const suppressClick = useRef(0);
  const tracing = useRef(false);
  const lastTracePt = useRef<{ x: number; y: number } | null>(null);
  const drawPointsRef = useRef<TrailPoint[]>([]);
  const gpsPointsRef = useRef<TrailPoint[]>([]);
  const modeRef = useRef(mode); modeRef.current = mode;
  const drawToolRef = useRef(drawTool); drawToolRef.current = drawTool;
  drawPointsRef.current = drawPoints;
  gpsPointsRef.current = gpsPoints;

  // Init map once
  useEffect(() => {
    if (!wrapRef.current) return;
    const el = wrapRef.current.querySelector('.leaflet-holder') as HTMLElement;
    if (!el || mapRef.current) return;
    const map = L.map(el, { zoomControl: true, attributionControl: true, worldCopyJump: true });
    map.setView([camp.centerLat, camp.centerLng], camp.mapZoom || 14);
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    // press-and-hold via pointer events on the container
    const container = map.getContainer();
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const target = e.target as HTMLElement;
      const pinEl = target.closest?.('[data-pin-id]') as HTMLElement | null;
      const pinId = pinEl ? Number(pinEl.dataset.pinId) : null;
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      const latlng = map.mouseEventToLatLng(e);
      holdInfo.current = { lat: latlng.lat, lng: latlng.lng, x, y, pinId, startX: e.clientX, startY: e.clientY };
      if (modeRef.current === 'draw' && drawToolRef.current === 'draw') {
        tracing.current = true;
        lastTracePt.current = { x: e.clientX, y: e.clientY };
        const pt = { lat: latlng.lat, lng: latlng.lng };
        setDrawPoints(prev => [...prev, pt]);
        return;
      }
      if (modeRef.current !== 'none') return;
      holdTimer.current = window.setTimeout(() => {
        const info = holdInfo.current;
        if (!info) return;
        suppressClick.current = Date.now();
        if (info.pinId) {
          const pin = pins.find(p => p.id === info.pinId);
          if (pin) onPinHold(pin);
        } else if (!readOnly) {
          setHold({ lat: info.lat, lng: info.lng, x: Math.min(info.x, rect.width - 240), y: Math.min(info.y, rect.height - 170) });
        }
        holdInfo.current = null;
      }, 550);
    };
    const onMove = (e: PointerEvent) => {
      if (tracing.current && modeRef.current === 'draw' && drawToolRef.current === 'draw') {
        const last = lastTracePt.current;
        if (last && Math.hypot(e.clientX - last.x, e.clientY - last.y) > 6) {
          lastTracePt.current = { x: e.clientX, y: e.clientY };
          const latlng = map.mouseEventToLatLng(e);
          setDrawPoints(prev => [...prev, { lat: latlng.lat, lng: latlng.lng }]);
        }
        return;
      }
      const info = holdInfo.current;
      if (info && Math.hypot(e.clientX - info.startX, e.clientY - info.startY) > 10) {
        if (holdTimer.current) window.clearTimeout(holdTimer.current);
        holdInfo.current = null;
      }
    };
    const onUp = () => {
      tracing.current = false;
      if (holdTimer.current) window.clearTimeout(holdTimer.current);
      holdInfo.current = null;
    };
    container.addEventListener('pointerdown', onDown);
    container.addEventListener('pointermove', onMove);
    container.addEventListener('pointerup', onUp);
    container.addEventListener('pointercancel', onUp);
    // two-finger drag: re-enable dragging while two fingers are down
    const onTouch = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        map.dragging.enable();
        if (holdTimer.current) window.clearTimeout(holdTimer.current);
        holdInfo.current = null;
        tracing.current = false;
      } else if (e.touches.length < 2 && modeRef.current === 'draw' && drawToolRef.current === 'draw') {
        map.dragging.disable();
      }
    };
    container.addEventListener('touchstart', onTouch, { passive: true });
    container.addEventListener('touchend', onTouch, { passive: true });
    map.on('click', (e: L.LeafletMouseEvent) => {
      if (Date.now() - suppressClick.current < 400) return;
      const m = modeRef.current;
      if (m === 'place-pin') { onAddPinAt(e.latlng.lat, e.latlng.lng); setMode('none'); return; }
      if (m === 'draw' && drawToolRef.current === 'draw') { setDrawPoints(prev => [...prev, { lat: e.latlng.lat, lng: e.latlng.lng }]); return; }
      if (m === 'gps' && gpsPointsRef.current.length === 0) { setGpsPoints([{ lat: e.latlng.lat, lng: e.latlng.lng }]); setGpsStart(Date.now()); return; }
      if (m === 'none' && !readOnly) { setFullscreen(true); }
    });
    return () => {
      container.removeEventListener('pointerdown', onDown);
      container.removeEventListener('pointermove', onMove);
      container.removeEventListener('pointerup', onUp);
      container.removeEventListener('pointercancel', onUp);
      container.removeEventListener('touchstart', onTouch);
      container.removeEventListener('touchend', onTouch);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Camp change -> recenter
  useEffect(() => {
    mapRef.current?.setView([camp.centerLat, camp.centerLng], camp.mapZoom || 14);
  }, [camp.id, camp.centerLat, camp.centerLng, camp.mapZoom]);

  // Tile layer
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    localStorage.setItem(`basecamp-map-style-${camp.id}`, style);
    localStorage.setItem('basecamp-map-style', style);
    onMapViewChanged?.(style);
    if (tileRef.current) tileRef.current.remove();
    const t = tileFor(style);
    tileRef.current = L.tileLayer(t.url, { attribution: t.attr, maxZoom: 19, className: t.cls ?? '' }).addTo(map);
  }, [style]);

  // Labels pref
  useEffect(() => { localStorage.setItem('basecamp-map-labels', showLabels ? 'on' : 'off'); }, [showLabels]);

  // Draw / move tool affects dragging
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    if (mode === 'draw') {
      if (drawTool === 'draw') map.dragging.disable(); else map.dragging.enable();
    } else if (mode === 'none' || mode === 'place-pin') {
      map.dragging.enable();
    }
  }, [mode, drawTool]);

  // Fullscreen -> resize
  useEffect(() => { const t = window.setTimeout(() => mapRef.current?.invalidateSize(), 80); return () => window.clearTimeout(t); }, [fullscreen]);
  useEffect(() => { onFullscreenChange?.(fullscreen); }, [fullscreen]);

  // Markers + trails
  useEffect(() => {
    const map = mapRef.current, layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    pins.forEach(pin => {
      const isSel = selectedPinId === pin.id;
      const html = `<div class="pin-marker" data-pin-id="${pin.id}"><span class="badge" style="background:${pin.color};${isSel ? 'box-shadow:0 0 0 3px #C2702E;' : ''}"><span class="badge-glyph">${pinSymbol(pin.pinType)}</span></span>${showLabels ? `<span class="nametag">${esc(pin.name || pin.label)}</span>` : ''}</div>`;
      const icon = L.divIcon({ html, className: '', iconSize: [30, showLabels ? 54 : 32], iconAnchor: [15, 30] });
      const marker = L.marker([pin.lat, pin.lng], { icon });
      marker.on('click', () => { suppressClick.current = Date.now(); onSelectPin(pin); });
      marker.addTo(layer);
    });
    if (showTrails) {
      trails.forEach(tr => {
        if (tr.points.length < 2) return;
        const latlngs = tr.points.map(p => [p.lat, p.lng] as [number, number]);
        L.polyline(latlngs, { color: tr.color, weight: 3 }).addTo(layer);
        tr.points.forEach(p => L.circleMarker([p.lat, p.lng], { radius: 3, color: tr.color, fillColor: tr.color, fillOpacity: 1, weight: 1 }).addTo(layer));
      });
    }
    // draft trail
    if (draftRef.current) { draftRef.current.remove(); draftRef.current = null; }
    const pts = mode === 'draw' ? drawPoints : gpsPoints;
    if (pts.length >= 2) {
      draftRef.current = L.polyline(pts.map(p => [p.lat, p.lng] as [number, number]), { color: mode === 'draw' ? drawColor : '#16A34A', weight: 3 }).addTo(layer);
      pts.forEach(p => L.circleMarker([p.lat, p.lng], { radius: 3, color: mode === 'draw' ? drawColor : '#16A34A', fillColor: mode === 'draw' ? drawColor : '#16A34A', fillOpacity: 1, weight: 1 }).addTo(layer));
    } else if (pts.length === 1) {
      L.circleMarker([pts[0].lat, pts[0].lng], { radius: 5, color: mode === 'draw' ? drawColor : '#16A34A', fillColor: mode === 'draw' ? drawColor : '#16A34A', fillOpacity: 1, weight: 1 }).addTo(layer);
    }
  }, [pins, trails, showLabels, showTrails, selectedPinId, drawPoints, gpsPoints, drawColor, mode, onSelectPin]);

  // GPS walk
  useEffect(() => {
    if (mode !== 'gps') return;
    if (!('geolocation' in navigator)) { setGpsError('Location is not available in this browser. Allow location access and try again.'); return; }
    setGpsError('');
    const id = navigator.geolocation.watchPosition(
      pos => {
        if (gpsPaused) return;
        const pt = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setGpsAccuracy(pos.coords.accuracy ?? null);
        setGpsPoints(prev => {
          if (prev.length === 0) { setGpsStart(Date.now()); return [pt]; }
          const last = prev[prev.length - 1];
          const d = Math.hypot((pt.lat - last.lat) * 111000, (pt.lng - last.lng) * 111000 * Math.cos(last.lat * Math.PI / 180));
          if (d < 3) return prev;
          return [...prev, pt];
        });
        mapRef.current?.panTo([pt.lat, pt.lng], { animate: true });
      },
      err => setGpsError(err.code === 1 ? 'Location permission denied. Allow location for this site and try again.' : 'Could not get your location. Check GPS signal and try again.'),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [mode, gpsPaused]);

  const gpsElapsed = gpsStart ? Math.max(0, Math.round((Date.now() - gpsStart) / 1000)) : 0;
  const gpsDist = trailDistanceFt(gpsPoints);

  function finishDraw() {
    if (drawPoints.length < 2) return;
    setFinishing(true);
  }
  function saveDrawnTrail() {
    const name = trailName.trim() || `Trail ${trails.length + 1}`;
    onTrailCreated([...drawPoints], name, drawColor);
    setDrawPoints([]); setTrailName(''); setFinishing(false); setMode('none');
  }
  function saveGpsTrail() {
    const name = trailName.trim() || `Walked trail ${trails.length + 1}`;
    onTrailCreated([...gpsPoints], name, drawColor);
    setGpsPoints([]); setTrailName(''); setFinishing(false); setMode('none');
  }

  return (
    <div>
      <div className={`row-wrap ${slim ? 'map-switcher-slim' : ''}`} style={{ marginBottom: 8 }}>
        {STYLES.map(s => (
          <button key={s.id} className={`chip ${style === s.id ? 'on' : ''}`} onClick={() => setStyle(s.id)}>{s.label}</button>
        ))}
        {!slim && (
          <>
            <button className={`chip ${showLabels ? 'on' : ''}`} onClick={() => setShowLabels(v => !v)}>Pin names</button>
            <button className={`chip ${showTrails ? 'on' : ''}`} onClick={() => setShowTrails(v => !v)}>Trails</button>
          </>
        )}
      </div>
      <div className={`map-wrap ${fullscreen ? 'fullscreen' : ''}`} ref={wrapRef}>
        <div className="leaflet-holder" style={{ width: '100%', height: fullscreen ? '100%' : slim ? 440 : 300 }} />
        <div className="map-toolbar">
          {mode === 'draw' && (
            <>
              <button className={`btn small ${drawTool === 'draw' ? 'primary' : ''}`} onClick={() => setDrawTool('draw')}>Draw</button>
              <button className={`btn small ${drawTool === 'move' ? 'primary' : ''}`} onClick={() => setDrawTool('move')}>Move map</button>
              <span className="pill">{drawTool === 'draw' ? 'Drawing — drag or tap to trace' : 'Moving map — two-finger drag works too'}</span>
            </>
          )}
          {mode === 'gps' && <span className="pill">Walking — GPS live {gpsPaused ? '(paused)' : ''}</span>}
          {mode === 'place-pin' && <span className="pill">Tap the map to drop the pin</span>}
        </div>
        <button className="btn small map-fs-btn" onClick={() => setFullscreen(v => !v)}>{fullscreen ? 'Exit fullscreen' : 'Full screen'}</button>
        {hold && (
          <div className="hold-chooser" style={{ left: hold.x, top: hold.y }}>
            <h4>Pin or trail here?</h4>
            <button onClick={() => { onAddPinAt(hold.lat, hold.lng); setHold(null); }}>Place a pin</button>
            <button onClick={() => { setHold(null); setMode('draw'); setDrawTool('draw'); setDrawPoints([]); }}>Draw a trail</button>
            <button onClick={() => { setHold(null); setMode('gps'); setGpsPoints([]); setGpsStart(null); }}>Walk with GPS</button>
            <button onClick={() => setHold(null)}>✕ Close</button>
          </div>
        )}
      </div>
      {!readOnly && (
        <div>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn primary grow" onClick={() => { setMode('place-pin'); setHold(null); }}>+ Add a pin</button>
            <button className="btn primary grow" onClick={() => setShowTrailOptions(v => !v)}>+ Add a trail</button>
          </div>
          {showTrailOptions && (
            <div className="card" style={{ marginTop: 8 }}>
              <h3 style={{ marginTop: 0 }}>How do you want to build it?</h3>
              <div className="row">
                <button className="btn primary grow" onClick={() => { setShowTrailOptions(false); setMode('draw'); setDrawTool('draw'); setDrawPoints([]); }}>Draw on the map</button>
                <button className="btn grow" onClick={() => { setShowTrailOptions(false); setMode('gps'); setGpsPoints([]); setGpsStart(null); }}>Walk it with GPS — live</button>
              </div>
            </div>
          )}
        </div>
      )}
      {mode === 'draw' && (
        <div className="card" style={{ marginTop: 8 }}>
          <div className="row-wrap">
            <span className="pill">Drawing a trail</span>
            <span className="muted">{drawPoints.length} points · {fmtDistance(trailDistanceFt(drawPoints))}</span>
          </div>
          <label>Trail color</label>
          <div className="row">
            <input type="color" value={drawColor} onChange={e => setDrawColor(e.target.value)} style={{ width: 48 }} />
            <div className="swatches">{PIN_COLORS.map(c => <button key={c} className={`swatch ${drawColor === c ? 'on' : ''}`} style={{ background: c }} onClick={() => setDrawColor(c)} aria-label={c} />)}</div>
          </div>
          {finishing ? (
            <div>
              <label>Trail name</label>
              <input value={trailName} onChange={e => setTrailName(e.target.value)} placeholder={`Trail ${trails.length + 1}`} />
              <div className="row" style={{ marginTop: 8 }}>
                <button className="btn primary grow" onClick={saveDrawnTrail}>Save trail</button>
                <button className="btn" onClick={() => setFinishing(false)}>Back</button>
              </div>
            </div>
          ) : (
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn" disabled={drawPoints.length === 0} onClick={() => setDrawPoints(prev => prev.slice(0, -1))}>Undo</button>
              <button className="btn" onClick={() => setDrawPoints([])}>Clear</button>
              <button className="btn primary grow" disabled={drawPoints.length < 2} onClick={finishDraw}>Finish</button>
              <button className="btn" onClick={() => { setDrawPoints([]); setMode('none'); }}>Discard</button>
            </div>
          )}
          <p className="small">Tap or drag on the map to trace. The trail starts where you press — no dot is placed first. Switch to Move map (or use two fingers) to pan without drawing.</p>
        </div>
      )}
      {mode === 'gps' && (
        <div className="card" style={{ marginTop: 8 }}>
          <div className="row-wrap">
            <span className="pill">Walking a trail with GPS</span>
            <span className="muted">{fmtDistance(gpsDist)} · {Math.floor(gpsElapsed / 60)}:{String(gpsElapsed % 60).padStart(2, '0')} · {gpsPoints.length} pts{gpsAccuracy != null ? ` · ±${Math.round(gpsAccuracy)}m` : ''}</span>
          </div>
          {gpsError && <p className="err">{gpsError}</p>}
          {gpsPoints.length === 0 && <p className="small">Tap the map to set your start point, then walk — the line draws live as you go. Keep the camp open while walking.</p>}
          {finishing ? (
            <div>
              <label>Trail name</label>
              <input value={trailName} onChange={e => setTrailName(e.target.value)} placeholder={`Walked trail ${trails.length + 1}`} />
              <div className="row" style={{ marginTop: 8 }}>
                <button className="btn primary grow" onClick={saveGpsTrail}>Save trail</button>
                <button className="btn" onClick={() => setFinishing(false)}>Back</button>
              </div>
            </div>
          ) : (
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn" onClick={() => setGpsPaused(v => !v)}>{gpsPaused ? 'Resume' : 'Pause'}</button>
              <button className="btn primary grow" disabled={gpsPoints.length < 2} onClick={() => setFinishing(true)}>Finish</button>
              <button className="btn" onClick={() => { setGpsPoints([]); setMode('none'); }}>Discard</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
