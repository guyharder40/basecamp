// Weather + Go-hunt score — server side.
// Open-Meteo primary, National Weather Service (api.weather.gov) fallback.
// 1-hour cache in camp_wind_cache. Direction is compass letters/words only —
// NO wind arrows anywhere in this app.

export interface WindPeriod { key: 'morning' | 'afternoon' | 'evening'; label: string; compass: string; dirDeg: number; speedMph: number; }
export interface WindSnapshot {
  asOf: string; timezone: string;
  currentCompass: string; currentDirDeg: number; currentSpeedMph: number; currentGustMph: number;
  currentTempF: number; todayHighF: number; todayLowF: number;
  periods: WindPeriod[]; source: 'open-meteo' | 'nws';
  /** True when this snapshot is a stale cached copy served because a fresh fetch failed. */
  stale?: boolean;
}

export function compassFromDeg(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}
export function compassWord(dir: string): string {
  const map: Record<string, string> = { N: 'North', NE: 'Northeast', E: 'East', SE: 'Southeast', S: 'South', SW: 'Southwest', W: 'West', NW: 'Northwest' };
  return map[dir] ?? dir;
}
export function mphToKmh(mph: number): number { return Math.round(mph * 1.60934 * 10) / 10; }
export function fToC(f: number): number { return Math.round((f - 32) * 5 / 9 * 10) / 10; }

const OM_TIMEOUT_MS = 8000;
// Overall budget for the whole Open-Meteo + NWS chain. The per-fetch
// timeout alone is not enough: the NWS fallback makes up to 4 sequential
// fetches, so one request could take ~40s to fail. Racing the whole chain
// against this budget makes a failed weather call return quickly.
export const WEATHER_TIMEOUT_MS = 12000;

async function fetchJson(url: string, headers: Record<string, string> = {}): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), OM_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Basecamp (hunting app, +https://basecamp-xakz.vercel.app)', ...headers }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally { clearTimeout(t); }
}

function pickPeriod(hours: number[], dirs: number[], speeds: number[], startHour: number, endHour: number): { compass: string; dirDeg: number; speedMph: number } {
  const idx = hours.map((h, i) => ({ h, i })).filter(x => x.h >= startHour && x.h < endHour);
  if (idx.length === 0) return { compass: 'N', dirDeg: 0, speedMph: 0 };
  const avgSpeed = idx.reduce((s, x) => s + (speeds[x.i] ?? 0), 0) / idx.length;
  const mid = idx[Math.floor(idx.length / 2)];
  const deg = dirs[mid.i] ?? 0;
  return { compass: compassFromDeg(deg), dirDeg: deg, speedMph: Math.round(avgSpeed * 10) / 10 };
}

async function fetchOpenMeteo(lat: number, lng: number): Promise<WindSnapshot> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m&hourly=temperature_2m,wind_speed_10m,wind_direction_10m&daily=temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&forecast_days=1`;
  const d = await fetchJson(url);
  const hours: number[] = (d.hourly?.time ?? []).map((t: string) => Number(t.slice(11, 13)));
  const dirs: number[] = d.hourly?.wind_direction_10m ?? [];
  const speeds: number[] = d.hourly?.wind_speed_10m ?? [];
  const m = pickPeriod(hours, dirs, speeds, 5, 11);
  const a = pickPeriod(hours, dirs, speeds, 11, 16);
  const e = pickPeriod(hours, dirs, speeds, 16, 21);
  return {
    asOf: new Date().toISOString(), timezone: d.timezone ?? 'local',
    currentCompass: compassFromDeg(d.current?.wind_direction_10m ?? 0),
    currentDirDeg: d.current?.wind_direction_10m ?? 0,
    currentSpeedMph: Math.round((d.current?.wind_speed_10m ?? 0) * 10) / 10,
    currentGustMph: Math.round((d.current?.wind_gusts_10m ?? 0) * 10) / 10,
    currentTempF: Math.round(d.current?.temperature_2m ?? 0),
    todayHighF: Math.round(d.daily?.temperature_2m_max?.[0] ?? 0),
    todayLowF: Math.round(d.daily?.temperature_2m_min?.[0] ?? 0),
    periods: [
      { key: 'morning', label: 'Morning', ...m },
      { key: 'afternoon', label: 'Afternoon', ...a },
      { key: 'evening', label: 'Evening', ...e },
    ],
    source: 'open-meteo',
  };
}

async function fetchNws(lat: number, lng: number): Promise<WindSnapshot> {
  const point = await fetchJson(`https://api.weather.gov/points/${lat.toFixed(4)},${lng.toFixed(4)}`);
  const forecastUrl: string = point?.properties?.forecastHourly;
  const obsUrl: string = point?.properties?.observationStations;
  if (!forecastUrl) throw new Error('NWS point lookup failed');
  const hourly = await fetchJson(forecastUrl);
  const periods = hourly?.properties?.periods ?? [];
  const toMph = (s: string | number) => {
    const n = typeof s === 'number' ? s : parseFloat(String(s).replace(/[^0-9.]/g, '')) || 0;
    return Math.round(n * 10) / 10;
  };
  const toF = (v: number, unit: string) => unit === 'wmoUnit:degC' ? Math.round(v * 9 / 5 + 32) : Math.round(v);
  const pick = (startHour: number, endHour: number) => {
    const slice = periods.filter((p: any) => {
      const h = new Date(p.startTime).getHours();
      return h >= startHour && h < endHour;
    });
    const p = slice[Math.floor(slice.length / 2)] ?? periods[0];
    if (!p) return { compass: 'N', dirDeg: 0, speedMph: 0 };
    return { compass: p.windDirection ?? 'N', dirDeg: 0, speedMph: toMph(p.windSpeed) };
  };
  let current: any = periods[0] ?? {};
  let tempF = 0, highF = 0, lowF = 0, gustMph = 0;
  if (obsUrl) {
    try {
      const stations = await fetchJson(obsUrl);
      const stUrl: string | undefined = stations?.features?.[0]?.id;
      if (stUrl) {
        const obs = await fetchJson(`${stUrl}/observations/latest`);
        const o = obs?.properties ?? {};
        if (o.temperature?.value != null) tempF = toF(o.temperature.value, o.temperature.unitCode);
        if (o.windSpeed?.value != null) current = { ...current, windSpeed: o.windSpeed.value * 2.23694 };
        if (o.windDirection?.value != null) current = { ...current, windDirection: compassFromDeg(o.windDirection.value) };
        if (o.windGust?.value != null) gustMph = Math.round(o.windGust.value * 2.23694 * 10) / 10;
      }
    } catch { /* observations are best-effort; hourly forecast still works */ }
  }
  const temps = periods.slice(0, 24).map((p: any) => toF(p.temperature, p.temperatureUnit));
  highF = Math.max(...temps, 0); lowF = Math.min(...temps, 0);
  if (!tempF) tempF = temps[0] ?? 0;
  const m = pick(5, 11), a = pick(11, 16), e = pick(16, 21);
  return {
    asOf: new Date().toISOString(), timezone: 'local',
    currentCompass: current.windDirection ?? 'N',
    currentDirDeg: 0,
    currentSpeedMph: toMph(current.windSpeed ?? periods[0]?.windSpeed ?? 0),
    currentGustMph: gustMph,
    currentTempF: tempF, todayHighF: highF, todayLowF: lowF,
    periods: [
      { key: 'morning', label: 'Morning', ...m },
      { key: 'afternoon', label: 'Afternoon', ...a },
      { key: 'evening', label: 'Evening', ...e },
    ],
    source: 'nws',
  };
}

function firstSuccess<T>(promises: Promise<T>[]): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let remaining = promises.length;
    const errors: string[] = [];
    promises.forEach((p, i) => {
      p.then(resolve, (e: unknown) => {
        errors[i] = e instanceof Error ? e.message : String(e);
        remaining -= 1;
        if (remaining === 0) reject(new Error(`All weather sources failed: ${errors.filter(Boolean).join('; ')}`));
      });
    });
  });
}

export async function fetchWind(lat: number, lng: number): Promise<WindSnapshot> {
  // Race both providers and take the first success. Open-Meteo is a single
  // fast fetch, so it wins whenever it is healthy; if a shared egress IP is
  // rate-limited there (HTTP 429 from a cloud host), the National Weather
  // Service still answers and the hunt score keeps working.
  const om = (async (): Promise<WindSnapshot> => {
    try { return await fetchOpenMeteo(lat, lng); }
    catch (e) {
      console.warn('Open-Meteo failed, retrying once:', e instanceof Error ? e.message : e);
      await new Promise(r => setTimeout(r, 600));
      return fetchOpenMeteo(lat, lng);
    }
  })();
  const nws = (async (): Promise<WindSnapshot> => fetchNws(lat, lng))();
  const first = firstSuccess([om, nws]);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('Weather request timed out')), WEATHER_TIMEOUT_MS);
  });
  try {
    return await Promise.race([first, budget]);
  } finally {
    if (timer) clearTimeout(timer);
    // Losing chains keep running until their own per-fetch timeouts fire;
    // their results are discarded. Swallow any late rejections so they
    // never surface as unhandled rejections.
    first.catch(() => {});
    om.catch(() => {});
    nws.catch(() => {});
  }
}

// --- Moon phase (0 = new, 0.5 = full) ---
export function moonPhase(date = new Date()): { phase: number; name: string } {
  const synodic = 29.530588853;
  const knownNew = Date.UTC(2000, 0, 6, 18, 14);
  const days = (date.getTime() - knownNew) / 86400000;
  const phase = ((days % synodic) + synodic) % synodic / synodic;
  const names = ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'];
  return { phase, name: names[Math.round(phase * 8) % 8] };
}

// --- Whitetail rut: peak-breeding windows compiled from state agency
// conception data. Day-of-year windows; outside them the rut score tapers.
// These are approximate — the live app uses the same agency windows.
const RUT_PEAK: Record<string, [number, number]> = {
  MD: [305, 325], VA: [305, 325], PA: [305, 325], DE: [305, 325], NJ: [305, 325],
  NY: [305, 320], OH: [305, 322], WV: [305, 325], KY: [305, 325], TN: [305, 325],
  NC: [310, 330], SC: [310, 335], GA: [310, 335], AL: [330, 365], MS: [330, 365],
  FL: [340, 365], LA: [340, 365], TX: [320, 350], AR: [310, 330], MO: [305, 325],
  IL: [305, 322], IN: [305, 322], MI: [305, 320], WI: [300, 320], MN: [300, 318],
  IA: [305, 322], KS: [305, 325], OK: [305, 330], NE: [305, 322], SD: [300, 318],
  ND: [300, 315], MT: [300, 318], WY: [300, 318], CO: [300, 318], ID: [300, 318],
  WA: [305, 320], OR: [305, 320], CA: [310, 335], AZ: [320, 345], NM: [320, 345],
  ME: [300, 315], NH: [300, 318], VT: [300, 318], MA: [305, 320], CT: [305, 320],
  RI: [305, 320],
};
export function rutStage(state: string, date = new Date()): { stage: string; score: number; label: string } {
  const [start, end] = RUT_PEAK[state] ?? [305, 325];
  const startOfYear = new Date(date.getFullYear(), 0, 0);
  const doy = Math.floor((date.getTime() - startOfYear.getTime()) / 86400000);
  const inWindow = doy >= start && doy <= end;
  const nearWindow = doy >= start - 14 && doy <= end + 14;
  if (inWindow) return { stage: 'peak', score: 3.5, label: 'Peak rut' };
  if (nearWindow) return { stage: 'near', score: 2.5, label: doy < start ? 'Pre-rut' : 'Post-rut' };
  if (doy >= start - 35 && doy <= end + 35) return { stage: 'shoulder', score: 1.5, label: 'Rut shoulder' };
  return { stage: 'off', score: 0.5, label: 'Outside rut' };
}

export interface GoHuntInput {
  wind: WindSnapshot;
  stands: { id: number; name: string; bestWinds: string[] }[];
  huntingState: string;
  date?: Date;
}
export interface GoHuntScore {
  score: number; verdict: string; reason: string; bestStandId: number | null; bestStandName: string | null;
  breakdown: { wind: number; rut: number; temp: number; moon: number };
  rutLabel: string; moonName: string;
}

export function scoreGoHunt(input: GoHuntInput): GoHuntScore {
  const date = input.date ?? new Date();
  const windDir = input.wind.currentCompass;
  let windPoints = 0;
  let bestStand: { id: number; name: string } | null = null;
  for (const s of input.stands) {
    if (s.bestWinds.includes(windDir)) { bestStand = s; break; }
  }
  if (bestStand) windPoints = 3.5;
  else if (input.stands.length === 0) windPoints = 1.5;
  else windPoints = 1.0;
  const rut = rutStage(input.huntingState, date);
  const temp = input.wind.currentTempF;
  let tempPoints = 0;
  if (temp >= 35 && temp <= 50) tempPoints = 2;
  else if (temp >= 28 && temp <= 60) tempPoints = 1.4;
  else if (temp >= 20 && temp <= 68) tempPoints = 0.8;
  else tempPoints = 0.3;
  const moon = moonPhase(date);
  // Moon is a deliberately minor factor: rut timing is driven by day length.
  const moonPoints = moon.phase > 0.35 && moon.phase < 0.65 ? 1 : moon.phase > 0.2 && moon.phase < 0.8 ? 0.6 : 0.3;
  const total = Math.round((windPoints + rut.score + tempPoints + moonPoints) * 10) / 10;
  const verdict = total >= 8 ? 'Great day to hunt' : total >= 6.5 ? 'Worth going' : total >= 5 ? 'Fair — pick your spot' : 'Slow day — hunt smart';
  const parts: string[] = [];
  if (bestStand) parts.push(`wind is ${windDir}, good for ${bestStand.name}`);
  else if (input.stands.length) parts.push(`wind is ${windDir} and no stand lists it as a best wind`);
  parts.push(`${rut.label.toLowerCase()} in ${input.huntingState}`);
  parts.push(`${temp}°F`);
  return {
    score: Math.min(10, total), verdict,
    reason: parts.join(' · ') + '.',
    bestStandId: bestStand?.id ?? null, bestStandName: bestStand?.name ?? null,
    breakdown: { wind: windPoints, rut: rut.score, temp: tempPoints, moon: moonPoints },
    rutLabel: rut.label, moonName: moon.name,
  };
}
