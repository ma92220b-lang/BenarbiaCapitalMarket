/** Format d'entrée des coordonnées acceptées par le terminal. */
export type CoordFormat = 'DD' | 'DMS' | 'DDM';

export interface ParsedCoords {
  lat: number;
  lon: number;
  format: CoordFormat;
  raw: string;
}

export interface GeoPlace {
  id: string;
  displayName: string;
  shortName: string;
  lat: number;
  lon: number;
  type: string;
  class: string;
  country?: string;
  countryCode?: string;
  state?: string;
  city?: string;
  suburb?: string;
  road?: string;
  houseNumber?: string;
  postcode?: string;
  boundingbox?: [number, number, number, number]; // south, north, west, east
}

export type PoiCategory =
  | 'restaurant'
  | 'cafe'
  | 'bar'
  | 'fuel'
  | 'pharmacy'
  | 'hospital'
  | 'school'
  | 'bank'
  | 'police'
  | 'hotel'
  | 'supermarket'
  | 'parking';

export interface Poi {
  id: number;
  lat: number;
  lon: number;
  category: PoiCategory;
  name?: string;
  distance: number;
  phone?: string;
  website?: string;
  osmId?: string; // ex: "n123456" / "w98765" — traçabilité OSM
}

export interface StreetSegment {
  name: string;
  points: [number, number][];
  distance: number;
  surface?: string;
}

export interface NearestRoad {
  name: string;
  distance: number;
  point: [number, number];
  bearing: number;
}

export interface TargetPoint {
  coords: ParsedCoords;
  place: GeoPlace | null;
  poi: Poi[];
  streets: StreetSegment[];
  nearestRoad: NearestRoad | null;
  ts: number;
}

export type Phase = 'IDLE' | 'GEOCODING' | 'ACQUIRED' | 'STREET_LEVEL' | 'IMMERSED';

export interface LogLine {
  id: number;
  ts: number;
  level: 'INFO' | 'OK' | 'WARN' | 'ERR' | 'SYS';
  msg: string;
}

export interface HistoryEntry {
  id: number;
  raw: string;
  lat: number;
  lon: number;
  label: string;
  ts: number;
}

export type BaseLayer = 'SAT' | 'NIGHT' | 'STREETS';

/* ------------------------------------------------------------------ */
/* Reconnaissance croisée                                              */
/* ------------------------------------------------------------------ */

export interface IntelEstablishment {
  name: string;
  category: PoiCategory | 'other';
  lat: number;
  lon: number;
  distance: number;
  phone?: string;
  website?: string;
  email?: string;
  openingHours?: string;
  address?: string;
  osmId?: string;
  sources: string[];
}

export interface BuildingAddress {
  street: string;
  housenumber: string;
  lat: number;
  lon: number;
  distance: number;
}

export interface IntelResult {
  establishments: IntelEstablishment[];
  addresses: BuildingAddress[];
  streetNames: string[];
  verify: {
    nominatim: boolean;
    photon: boolean;
    agreementMeters: number | null;
    osmAddress: boolean;
  };
}

export interface SourceStatus {
  id: string;
  label: string;
  state: 'pend' | 'ok' | 'warn' | 'err';
  detail?: string;
}

/* ------------------------------------------------------------------ */
/* v4 — Recherche nominative                                           */
/* ------------------------------------------------------------------ */

export interface SearchHit {
  id: string;
  displayName: string;
  shortName: string;
  lat: number;
  lon: number;
  type: string;
}

/* ------------------------------------------------------------------ */
/* v4 — Analyse de zone (polygone dessiné)                             */
/* ------------------------------------------------------------------ */

export interface ZoneStats {
  polygon: [number, number][];
  areaM2: number;
  perimeterM: number;
  poiCount: number;
  establishmentCount: number;
  addressCount: number;
  streetsInside: string[];
  poiByCategory: Record<string, number>;
}

/* ------------------------------------------------------------------ */
/* v4 — Liens logiques entre entités                                   */
/* ------------------------------------------------------------------ */

export type LinkKind =
  | 'phone-shared'
  | 'website-shared'
  | 'email-shared'
  | 'same-street'
  | 'nearby'
  | 'same-name';

export interface EntityNode {
  id: string; // 'est:...' | 'addr:...' | 'target'
  kind: 'establishment' | 'address' | 'target';
  label: string;
  lat: number;
  lon: number;
}

export interface EntityLink {
  from: string;
  to: string;
  kind: LinkKind;
  weight: number; // 1 = fort, 3 = faible
  detail: string;
}

export interface LinkGraph {
  nodes: EntityNode[];
  links: EntityLink[];
}

/* ------------------------------------------------------------------ */
/* v4 — Densité sectorielle                                            */
/* ------------------------------------------------------------------ */

export interface DensityCell {
  lat: number;
  lon: number;
  count: number;
}
