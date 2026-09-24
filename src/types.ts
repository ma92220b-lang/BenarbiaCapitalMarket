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
  distance: number; // mètres depuis la cible
}

export interface StreetSegment {
  name: string;
  points: [number, number][];
  distance: number; // distance min de la cible
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
