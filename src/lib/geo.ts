import type {
  CoordFormat,
  GeoPlace,
  NearestRoad,
  ParsedCoords,
  Poi,
  PoiCategory,
  StreetSegment
} from '../types';

const NOMINATIM = 'https://nominatim.openstreetmap.org';

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
];

async function jsonFetch<T>(url: string, signal?: AbortSignal, timeoutMs = 20000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/* ------------------------------------------------------------------ */
/* Math géo                                                            */
/* ------------------------------------------------------------------ */

const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function bearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const y = Math.sin(rad(lon2 - lon1)) * Math.cos(rad(lat2));
  const x =
    Math.cos(rad(lat1)) * Math.sin(rad(lat2)) -
    Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(rad(lon2 - lon1));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

export function cardinal(b: number): string {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round(b / 22.5) % 16];
}

export function fmtMeters(m: number): string {
  if (m < 1000) return `${m.toFixed(0)} m`;
  if (m < 100000) return `${(m / 1000).toFixed(2)} km`;
  return `${(m / 1000).toFixed(0)} km`;
}

export function toDms(v: number, isLat: boolean): string {
  const hemi = isLat ? (v >= 0 ? 'N' : 'S') : v >= 0 ? 'E' : 'W';
  const abs = Math.abs(v);
  const d = Math.floor(abs);
  const mFull = (abs - d) * 60;
  const m = Math.floor(mFull);
  const s = (mFull - m) * 60;
  return `${d}°${String(m).padStart(2, '0')}'${s.toFixed(2).padStart(5, '0')}"${hemi}`;
}

export function toDdm(v: number, isLat: boolean): string {
  const hemi = isLat ? (v >= 0 ? 'N' : 'S') : v >= 0 ? 'E' : 'W';
  const abs = Math.abs(v);
  const d = Math.floor(abs);
  const m = (abs - d) * 60;
  return `${d}°${m.toFixed(3)}'${hemi}`;
}

/* ------------------------------------------------------------------ */
/* Parsing coordonnées : DD / DMS / DDM / signés / colonnes            */
/* ------------------------------------------------------------------ */

const num = '(\\d{1,3}(?:[.,]\\d+)?)';
const sep = "\\s*[°ºd:]?\\s*";
const min = "(?:\\s*['′m:]?\\s*" + num + ")?";
const sec = "(?:\\s*[\"″s]?\\s*" + num + ")?";
const DMS_RE = new RegExp(
  '^\\s*([NS])?' + sep + num + min + sec + '\\s*["″]?\\s*([NS])?' +
  '[\\s,;/]+' +
  '([EW])?' + sep + num + min + sec + '\\s*["″]?\\s*([EW])?\\s*$',
  'i'
);

function toNum(s: string | undefined): number | undefined {
  if (s === undefined) return undefined;
  return parseFloat(s.replace(',', '.'));
}

export function parseCoords(raw: string): ParsedCoords {
  const input = raw.trim();
  if (!input) throw new Error('CHAÎNE VIDE');

  const m = input.match(DMS_RE);
  if (m) {
    const [, ns1, latD, latM, latS, ns2, ew1, lonD, lonM, lonS, ew2] = m;
    let lat = toNum(latD) ?? NaN;
    let lon = toNum(lonD) ?? NaN;
    let format: CoordFormat = 'DD';
    if (latM !== undefined) {
      lat += (toNum(latM) ?? 0) / 60;
      format = 'DDM';
    }
    if (latS !== undefined) {
      lat += (toNum(latS) ?? 0) / 3600;
      format = 'DMS';
    }
    if (lonM !== undefined) lon += (toNum(lonM) ?? 0) / 60;
    if (lonS !== undefined) lon += (toNum(lonS) ?? 0) / 3600;
    const latHemi = (ns2 ?? ns1 ?? '').toUpperCase();
    const lonHemi = (ew2 ?? ew1 ?? '').toUpperCase();
    if (latHemi === 'S') lat = -Math.abs(lat);
    if (lonHemi === 'W') lon = -Math.abs(lon);
    if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon, format, raw: input };
  }

  // Décimal : séparateurs , ; espace / tab
  let tokens = input.split(/[\s,;/]+/).filter(Boolean);
  if (tokens.length === 4) {
    // "48 8584 2 2945" → décimales à virgule espacées
    tokens = [`${tokens[0]}.${tokens[1]}`, `${tokens[2]}.${tokens[3]}`];
  }
  if (tokens.length === 2) {
    const a = parseFloat(tokens[0].replace(',', '.'));
    const b = parseFloat(tokens[1].replace(',', '.'));
    let lat = a;
    let lon = b;
    if (Math.abs(lat) > 90 && Math.abs(lon) <= 90) {
      [lat, lon] = [lon, lat];
    }
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      const format: CoordFormat = /,/.test(input) && !/\./.test(input) ? 'DD' : 'DD';
      return { lat, lon, format, raw: input };
    }
  }

  throw new Error('FORMAT NON RECONNU — DD « 48.8584, 2.2945 » OU DMS « 48°51\'29"N, 2°17\'40"E »');
}

/* ------------------------------------------------------------------ */
/* Nominatim                                                           */
/* ------------------------------------------------------------------ */

interface NominatimReverse {
  place_id: number;
  display_name: string;
  name?: string;
  type: string;
  class: string;
  address?: Record<string, string>;
  boundingbox?: string[];
}

export async function reverseGeocode(lat: number, lon: number, signal?: AbortSignal): Promise<GeoPlace> {
  const url =
    `${NOMINATIM}/reverse?format=jsonv2&lat=${lat}&lon=${lon}` +
    `&zoom=18&addressdetails=1&accept-language=fr`;
  const d = await jsonFetch<NominatimReverse>(url, signal);
  const a = d.address ?? {};
  const shortName =
    a.road
      ? `${a.house_number ? a.house_number + ' ' : ''}${a.road}`
      : (d.name ?? a.suburb ?? a.city ?? a.country ?? 'POSITION');
  return {
    id: String(d.place_id),
    displayName: d.display_name,
    shortName,
    lat,
    lon,
    type: d.type,
    class: d.class,
    country: a.country,
    countryCode: a.country_code?.toUpperCase(),
    state: a.state,
    city: a.city ?? a.town ?? a.village ?? a.municipality,
    suburb: a.suburb ?? a.city_district ?? a.neighbourhood,
    road: a.road,
    houseNumber: a.house_number,
    postcode: a.postcode,
    boundingbox: d.boundingbox?.map(Number) as [number, number, number, number] | undefined
  };
}

/* ------------------------------------------------------------------ */
/* Overpass : POI + rues                                               */
/* ------------------------------------------------------------------ */

interface OverpassEl {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
}

const POI_FILTERS: Record<PoiCategory, string> = {
  restaurant: '["amenity"~"^(restaurant|fast_food|food_court)$"]',
  cafe: '["amenity"="cafe"]',
  bar: '["amenity"~"^(bar|pub)$"]',
  fuel: '["amenity"="fuel"]',
  pharmacy: '["amenity"="pharmacy"]',
  hospital: '["amenity"~"^(hospital|clinic|doctors)$"]',
  school: '["amenity"="school"]',
  bank: '["amenity"~"^(bank|atm)$"]',
  police: '["amenity"="police"]',
  hotel: '["tourism"~"^(hotel|motel|hostel|guest_house)$"]',
  supermarket: '["shop"~"^(supermarket|convenience|mall)$"]',
  parking: '["amenity"="parking"]'
};

export async function fetchPois(
  lat: number,
  lon: number,
  radius: number,
  cats: PoiCategory[],
  signal?: AbortSignal
): Promise<Poi[]> {
  if (cats.length === 0) return [];
  const body = cats.map((c) => `nwr(around:${radius},${lat},${lon})${POI_FILTERS[c]};`).join('');
  const q = `[out:json][timeout:25];(${body});out center 300;`;
  const data = await overpass(q, signal);
  const pois: Poi[] = [];
  for (const el of data.elements) {
    const pLat = el.lat ?? el.center?.lat;
    const pLon = el.lon ?? el.center?.lon;
    if (pLat === undefined || pLon === undefined) continue;
    const cat = categorize(el.tags ?? {});
    pois.push({
      id: el.id,
      lat: pLat,
      lon: pLon,
      category: cat,
      name: el.tags?.name,
      distance: haversine(lat, lon, pLat, pLon)
    });
  }
  pois.sort((a, b) => a.distance - b.distance);
  return pois.slice(0, 250);
}

function categorize(tags: Record<string, string>): PoiCategory {
  const a = tags.amenity ?? '';
  if (a === 'cafe') return 'cafe';
  if (a === 'bar' || a === 'pub') return 'bar';
  if (a === 'fuel') return 'fuel';
  if (a === 'pharmacy') return 'pharmacy';
  if (a === 'hospital' || a === 'clinic' || a === 'doctors') return 'hospital';
  if (a === 'school') return 'school';
  if (a === 'bank' || a === 'atm') return 'bank';
  if (a === 'police') return 'police';
  if (a === 'parking') return 'parking';
  if (a === 'restaurant' || a === 'fast_food' || a === 'food_court') return 'restaurant';
  if (tags.tourism === 'hotel' || tags.tourism === 'motel' || tags.tourism === 'hostel' || tags.tourism === 'guest_house') return 'hotel';
  if (tags.shop === 'supermarket' || tags.shop === 'convenience' || tags.shop === 'mall') return 'supermarket';
  return 'restaurant';
}

export async function fetchStreets(
  lat: number,
  lon: number,
  radius: number,
  signal?: AbortSignal
): Promise<StreetSegment[]> {
  const q =
    `[out:json][timeout:25];way(around:${radius},${lat},${lon})` +
    `["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|living_street|` +
    `pedestrian|unclassified|service|motorway_link|trunk_link|primary_link|secondary_link|footway|cycleway)$"];` +
    `out geom 500;`;
  const data = await overpass(q, signal);
  const segs: StreetSegment[] = [];
  for (const el of data.elements) {
    const pts = (el.geometry ?? []).map((g) => [g.lat, g.lon] as [number, number]);
    if (pts.length < 2) continue;
    let minD = Infinity;
    for (const [py, px] of pts) minD = Math.min(minD, haversine(lat, lon, py, px));
    segs.push({
      name: el.tags?.name ?? el.tags?.ref ?? 'SECTEUR NON NOMMÉ',
      points: pts,
      distance: minD,
      surface: el.tags?.surface
    });
  }
  segs.sort((a, b) => a.distance - b.distance);
  return segs.slice(0, 160);
}

export function deriveNearestRoad(target: [number, number], segs: StreetSegment[]): NearestRoad | null {
  if (segs.length === 0) return null;
  const best = segs[0];
  let bPt: [number, number] = best.points[0];
  let bD = Infinity;
  const [tLat, tLon] = target;
  for (const [py, px] of best.points) {
    const d = haversine(tLat, tLon, py, px);
    if (d < bD) {
      bD = d;
      bPt = [py, px];
    }
  }
  const p0 = best.points[0];
  const p1 = best.points[Math.min(1, best.points.length - 1)];
  const brg = bearing(p0[0], p0[1], p1[0], p1[1]);
  return { name: best.name, distance: bD, point: bPt, bearing: brg };
}

async function overpass(query: string, signal?: AbortSignal): Promise<{ elements: OverpassEl[] }> {
  let lastErr: unknown = null;
  for (const ep of OVERPASS_ENDPOINTS) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 30000);
      const onAbort = () => ctrl.abort();
      signal?.addEventListener('abort', onAbort);
      try {
        const res = await fetch(ep, {
          method: 'POST',
          signal: ctrl.signal,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'data=' + encodeURIComponent(query)
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as { elements: OverpassEl[] };
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
      }
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`OVERPASS INJOIGNABLE — ${lastErr instanceof Error ? lastErr.message : 'erreur réseau'}`);
}
