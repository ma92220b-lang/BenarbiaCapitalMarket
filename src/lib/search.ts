import L from 'leaflet';
import type {
  BuildingAddress,
  IntelEstablishment,
  Poi,
  SearchHit,
  StreetSegment,
  ZoneStats
} from '../types';

const NOMINATIM = 'https://nominatim.openstreetmap.org';
const PHOTON = 'https://photon.komoot.io';

async function getJson<T>(url: string, signal?: AbortSignal, timeoutMs = 15000): Promise<T> {
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
/* Recherche nominative multi-géocodeurs                               */
/* ------------------------------------------------------------------ */

interface NomSearch {
  place_id: number;
  display_name: string;
  name?: string;
  type: string;
  lat: string;
  lon: string;
}

export async function searchPlaces(
  query: string,
  signal?: AbortSignal,
  limit = 6
): Promise<SearchHit[]> {
  const hits: SearchHit[] = [];

  try {
    const d = await getJson<NomSearch[]>(
      `${NOMINATIM}/search?format=jsonv2&q=${encodeURIComponent(query)}&limit=${limit}&addressdetails=0&accept-language=fr`,
      signal
    );
    for (const r of d) {
      hits.push({
        id: `n${r.place_id}`,
        displayName: r.display_name,
        shortName: r.name ?? r.display_name.split(',')[0],
        lat: parseFloat(r.lat),
        lon: parseFloat(r.lon),
        type: r.type
      });
    }
  } catch {
    /* Nominatim down → Photon seul */
  }

  if (hits.length < 3) {
    try {
      const d = await getJson<{
        features: {
          geometry: { coordinates: [number, number] };
          properties: { osm_id?: number; name?: string; street?: string; city?: string; country?: string; postcode?: string; type?: string };
        }[];
      }>(
        `${PHOTON}/api?q=${encodeURIComponent(query)}&limit=${limit}&lang=fr`,
        signal
      );
      const seen = new Set(hits.map((h) => h.shortName.toLowerCase()));
      for (const f of d.features) {
        const p = f.properties;
        const label =
          p.name ?? [p.street, p.city].filter(Boolean).join(', ') ?? 'INCONNU';
        const short = label.split(',')[0];
        if (seen.has(short.toLowerCase())) continue;
        seen.add(short.toLowerCase());
        hits.push({
          id: `p${p.osm_id ?? label}`,
          displayName: [label, p.postcode, p.city, p.country].filter(Boolean).join(', '),
          shortName: short,
          lat: f.geometry.coordinates[1],
          lon: f.geometry.coordinates[0],
          type: p.type ?? 'place'
        });
      }
    } catch {
      /* les deux échouent → liste vide */
    }
  }

  return hits;
}

/* ------------------------------------------------------------------ */
/* Géométrie : surface, périmètre, point-in-polygon (ray casting)      */
/* ------------------------------------------------------------------ */

export function polygonAreaM2(pts: [number, number][]): number {
  if (pts.length < 3) return 0;
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  let total = 0;
  for (let i = 0; i < pts.length; i++) {
    const [y1, x1] = pts[i];
    const [y2, x2] = pts[(i + 1) % pts.length];
    total += rad(x2 - x1) * (2 + Math.sin(rad(y1)) + Math.sin(rad(y2)));
  }
  return Math.abs((total * R * R) / 2);
}

export function pathLengthM(pts: [number, number][]): number {
  let d = 0;
  for (let i = 1; i < pts.length; i++) {
    d += L.latLng(pts[i - 1]).distanceTo(L.latLng(pts[i]));
  }
  return d;
}

export function pointInPolygon(pt: [number, number], poly: [number, number][]): boolean {
  const [y, x] = pt;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i];
    const [yj, xj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/* ------------------------------------------------------------------ */
/* Analyse de zone : tout le contenu d'un polygone                     */
/* ------------------------------------------------------------------ */

export function analyzeZone(
  polygon: [number, number][],
  pois: Poi[],
  establishments: IntelEstablishment[],
  addresses: BuildingAddress[],
  streets: StreetSegment[]
): ZoneStats {
  const insidePois: Poi[] = [];
  const insideEst: IntelEstablishment[] = [];
  const insideAddr: BuildingAddress[] = [];
  const streetsInside = new Set<string>();
  const byCat: Record<string, number> = {};

  for (const poi of pois) {
    if (pointInPolygon([poi.lat, poi.lon], polygon)) {
      insidePois.push(poi);
      byCat[poi.category] = (byCat[poi.category] ?? 0) + 1;
    }
  }
  for (const e of establishments) {
    if (pointInPolygon([e.lat, e.lon], polygon)) insideEst.push(e);
  }
  for (const a of addresses) {
    if (pointInPolygon([a.lat, a.lon], polygon)) insideAddr.push(a);
  }
  for (const s of streets) {
    for (const pt of s.points) {
      if (pointInPolygon(pt, polygon)) {
        streetsInside.add(s.name);
        break;
      }
    }
  }

  return {
    polygon,
    areaM2: polygonAreaM2(polygon),
    perimeterM: pathLengthM([...polygon, polygon[0]]),
    poiCount: insidePois.length,
    establishmentCount: insideEst.length,
    addressCount: insideAddr.length,
    streetsInside: [...streetsInside],
    poiByCategory: byCat
  };
}
