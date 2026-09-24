import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  BaseLayer,
  GeoPlace,
  HistoryEntry,
  IntelResult,
  LinkGraph,
  LogLine,
  Poi,
  PoiCategory,
  SearchHit,
  SourceStatus,
  StreetSegment,
  ZoneStats
} from '../types';
import { POI_STYLE } from './MapView';
import GraphView from './GraphView';
import { fmtMeters, toDms } from '../lib/geo';

export interface SidebarProps {
  // LOCALISE
  input: string;
  setInput: (v: string) => void;
  onLocalise: () => void;
  busy: boolean;
  err: string | null;
  // Données cible
  place: GeoPlace | null;
  pois: Poi[];
  streets: StreetSegment[];
  nearestRoad: { name: string; distance: number; bearing: number } | null;
  intel: IntelResult | null;
  sources: SourceStatus[];
  // Modules
  poiCats: PoiCategory[];
  togglePoiCat: (c: PoiCategory) => void;
  radius: number;
  setRadius: (r: number) => void;
  baseLayer: BaseLayer;
  setBaseLayer: (b: BaseLayer) => void;
  showRings: boolean;
  setShowRings: (v: boolean) => void;
  showStreets: boolean;
  setShowStreets: (v: boolean) => void;
  showGrid: boolean;
  setShowGrid: (v: boolean) => void;
  showTrails: boolean;
  setShowTrails: (v: boolean) => void;
  history: HistoryEntry[];
  onHistoryGoto: (h: HistoryEntry) => void;
  onHistoryDel: (id: number) => void;
  onScan: () => void;
  onFit: () => void;
  onExport: () => void;
  onCopy: () => void;
  log: LogLine[];
  zoom: number;
  // v4
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  searchHits: SearchHit[];
  searching: boolean;
  onSearch: () => void;
  onSearchGoto: (h: SearchHit) => void;
  mode: 'NONE' | 'ZONE' | 'DIST';
  setMode: (m: 'NONE' | 'ZONE' | 'DIST') => void;
  zoneStats: ZoneStats | null;
  onZoneClear: () => void;
  graph: LinkGraph | null;
  densityOn: boolean;
  setDensityOn: (v: boolean) => void;
}

/* ---------- petits sous-composants ---------- */

function Cat({
  title,
  code,
  open,
  onToggle,
  children
}: {
  title: string;
  code: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={`cat${open ? ' open' : ''}`}>
      <button className="cat-head" onClick={onToggle}>
        <span style={{ color: 'var(--blue)', fontFamily: 'var(--font-mono)', fontSize: 9 }}>
          {code}
        </span>
        <span>{title}</span>
        <span className="chev">▶</span>
      </button>
      {open && <div className="cat-body">{children}</div>}
    </div>
  );
}

function Module({
  id,
  title,
  children
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="module">
      <div className="module-head">
        <span className="mod-id">[{id}]</span>
        <span>{title}</span>
        <span className="spacer" />
        <span style={{ color: 'var(--txt-2)' }}>●</span>
      </div>
      <div className="module-body">{children}</div>
    </div>
  );
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return <button className={`toggle${on ? ' on' : ''}`} onClick={onClick} aria-pressed={on} />;
}

function SourceBadges({ sources }: { sources: SourceStatus[] }) {
  return (
    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
      {sources.map((s) => (
        <span key={s.id} className={`badge ${s.state}`} title={s.detail}>
          {s.state === 'ok' ? '✓' : s.state === 'err' ? '✕' : '··'} {s.label}
        </span>
      ))}
    </div>
  );
}

const CATS = [
  { id: 'localised', title: 'LOCALISED POINT', code: '01' },
  { id: 'intel', title: 'RECONNAISSANCE', code: '02' },
  { id: 'analysis', title: 'ANALYSE', code: '03' },
  { id: 'layers', title: 'COUCHES & FOND', code: '04' },
  { id: 'ops', title: 'OPÉRATIONS', code: '05' },
  { id: 'logs', title: 'JOURNAL', code: '06' }
] as const;
type CatId = (typeof CATS)[number]['id'];

export default function Sidebar(p: SidebarProps) {
  const [open, setOpen] = useState<Record<CatId, boolean>>({
    localised: true,
    intel: true,
    analysis: true,
    layers: false,
    ops: false,
    logs: false
  });
  const toggle = (id: CatId) => setOpen((o) => ({ ...o, [id]: !o[id] }));

  const logRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [p.log]);

  const catDist = useMemo(() => {
    const m = new Map<PoiCategory, number>();
    for (const poi of p.pois) m.set(poi.category, (m.get(poi.category) ?? 0) + 1);
    return m;
  }, [p.pois]);

  const streetNames = useMemo(() => {
    const seen = new Set<string>();
    const names: string[] = [];
    for (const s of p.streets) {
      if (s.name && !seen.has(s.name) && s.name !== 'SECTEUR NON NOMMÉ') {
        seen.add(s.name);
        names.push(s.name);
      }
      if (names.length >= 12) break;
    }
    return names;
  }, [p.streets]);

  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const iv = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(iv);
  }, []);

  const missionId = useMemo(
    () => `MSN-${String(Date.now()).slice(-6)}-${p.place?.countryCode ?? '—'}`,
    [p.place]
  );

  return (
    <aside className="sidebar">
      <div className="sidebar-scroll">
        {/* ================= 01 LOCALISED POINT ================= */}
        <Cat title="LOCALISED POINT" code="01" open={open.localised} onToggle={() => toggle('localised')}>
          <div className="opt">
            <button className="opt-label active">
              <span className="idx">1.0</span> LOCALISE
            </button>

            <div className="field-row">
              <input
                className="coord-input"
                placeholder="48.8584, 2.2945 · 48°51'29&quot;N 2°17'40&quot;E"
                value={p.input}
                onChange={(e) => p.setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !p.busy) p.onLocalise();
                }}
                spellCheck={false}
                disabled={p.busy}
              />
              <button className="btn" onClick={p.onLocalise} disabled={p.busy || !p.input.trim()}>
                {p.busy ? '···' : 'LOCK'}
              </button>
            </div>

            {p.err && (
              <div className="hint" style={{ color: 'var(--err)' }}>
                ✕ {p.err}
              </div>
            )}

            <div className="hint">
              <b>FORMATS</b> : DD « 48.8584, 2.2945 » · DMS « 48°51'29"N, 2°17'40"E » · DDM · S/W auto
            </div>
          </div>

          {/* --- Dossier cible --- */}
          {p.place && (
            <div className="dossier">
              <div className="dossier-tag">DOSSIER CIBLE // {missionId}</div>
              <div className="dossier-name">{p.place.shortName}</div>
              <div className="dossier-addr">{p.place.displayName}</div>
              <div style={{ marginTop: 8 }}>
                <div className="kv">
                  <span className="k">LAT</span>
                  <span className="v hl">{p.place.lat.toFixed(6)}</span>
                </div>
                <div className="kv">
                  <span className="k">LON</span>
                  <span className="v hl">{p.place.lon.toFixed(6)}</span>
                </div>
                <div className="kv">
                  <span className="k">DMS</span>
                  <span className="v">{toDms(p.place.lat, true)} {toDms(p.place.lon, false)}</span>
                </div>
                <div className="kv">
                  <span className="k">TYPE</span>
                  <span className="v">{p.place.class}/{p.place.type}</span>
                </div>
                <div className="kv">
                  <span className="k">PAYS</span>
                  <span className="v">{p.place.country ?? '—'} [{p.place.countryCode ?? '—'}]</span>
                </div>
                {p.nearestRoad && (
                  <div className="kv">
                    <span className="k">AXE PROCHE</span>
                    <span className="v">{p.nearestRoad.name} · {fmtMeters(p.nearestRoad.distance)}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </Cat>

        {/* ================= 02 RECONNAISSANCE ================= */}
        <Cat title="RECONNAISSANCE" code="02" open={open.intel} onToggle={() => toggle('intel')}>
          {/* 2.1 Sources croisées */}
          <Module id="2.1" title="SOURCES CROISÉES">
            <SourceBadges sources={p.sources} />
            {p.intel && p.intel.verify.agreementMeters !== null && (
              <div className="kv" style={{ marginTop: 8 }}>
                <span className="k">ÉCART GÉOCODEURS</span>
                <span className="v hl">{p.intel.verify.agreementMeters.toFixed(0)} m</span>
              </div>
            )}
            <div className="hint">
              Nominatim + Photon (adresses) · Overpass (contacts, voirie, numéros).
              Croisement sur un périmètre de {Math.max(p.radius, 300)} m.
            </div>
          </Module>

          {/* 2.2 Fiches établissements */}
          <Module id="2.2" title={`ÉTABLISSEMENTS [${p.intel?.establishments.length ?? 0}]`}>
            {(!p.intel || p.intel.establishments.length === 0) && (
              <div className="hint">Aucun établissement répertorié dans le périmètre.</div>
            )}
            {p.intel?.establishments.slice(0, 12).map((e, i) => (
              <div key={`${e.name}-${i}`} className="fiche">
                <div className="fiche-name">{e.name}</div>
                <div className="fiche-cat">
                  {e.category === 'other' ? 'POINT D\u2019INTÉRÊT' : POI_STYLE[e.category].label}
                  {' · '}
                  {fmtMeters(e.distance)}
                </div>
                <div className="fiche-rows">
                  {e.address && (
                    <div className="kv">
                      <span className="k">ADRESSE</span>
                      <span className="v">{e.address}</span>
                    </div>
                  )}
                  {e.phone && (
                    <div className="kv">
                      <span className="k">TÉL</span>
                      <span className="v hl">
                        <a href={`tel:${e.phone.replace(/\\s/g, '')}`} style={{ color: 'inherit' }}>
                          {e.phone}
                        </a>
                      </span>
                    </div>
                  )}
                  {e.website && (
                    <div className="kv">
                      <span className="k">WEB</span>
                      <span className="v" style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <a href={e.website} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>
                          {e.website.replace(/^https?:\//, '')}
                        </a>
                      </span>
                    </div>
                  )}
                  {e.openingHours && (
                    <div className="kv">
                      <span className="k">HORAIRES</span>
                      <span className="v">{e.openingHours}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </Module>

          {/* 2.3 Adresses numérotées */}
          <Module id="2.3" title={`ADRESSES RELEVÉES [${p.intel?.addresses.length ?? 0}]`}>
            {(!p.intel || p.intel.addresses.length === 0) && (
              <div className="hint">Aucun numéro relevé dans le périmètre.</div>
            )}
            {p.intel?.addresses.slice(0, 20).map((a, i) => (
              <div key={`${a.street}-${a.housenumber}-${i}`} className="addr-item">
                <span className="addr-n">{fmtMeters(a.distance)}</span>
                {' · '}
                <span className="addr-street">{a.housenumber} {a.street}</span>
              </div>
            ))}
          </Module>

          {/* 2.4 Voirie */}
          <Module id="2.4" title={`VOIRIE [${streetNames.length}]`}>
            {streetNames.length === 0 && <div className="hint">Maillage non résolu.</div>}
            {streetNames.map((n, i) => (
              <div key={n + i} className="kv">
                <span className="k">R{i + 1}</span>
                <span className="v">{n}</span>
              </div>
            ))}
          </Module>

          {/* 2.5 Signaux POI */}
          <Module id="2.5" title="SIGNAUX POI">
            <div className="chip-grid">
              {(Object.keys(POI_STYLE) as PoiCategory[]).map((c) => {
                const n = catDist.get(c) ?? 0;
                const on = p.poiCats.includes(c);
                return (
                  <button
                    key={c}
                    className={`chip${on ? ' on' : ''}`}
                    style={{ '--c': POI_STYLE[c].color } as React.CSSProperties}
                    onClick={() => p.togglePoiCat(c)}
                  >
                    <span className="dot" />
                    {POI_STYLE[c].label}
                    <span className="n">{n}</span>
                  </button>
                );
              })}
            </div>
          </Module>
        </Cat>

        {/* ================= 03 ANALYSE ================= */}
        <Cat title="ANALYSE" code="03" open={open.analysis} onToggle={() => toggle('analysis')}>
          {/* 3.1 Recherche nominative */}
          <Module id="3.1" title="RECHERCHE NOMINATIVE">
            <div className="field-row">
              <input
                className="coord-input"
                placeholder="« 12 rue de Rivoli, Paris » · « Tour Eiffel »"
                value={p.searchQuery}
                onChange={(e) => p.setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !p.searching) p.onSearch();
                }}
                spellCheck={false}
              />
              <button className="btn" onClick={p.onSearch} disabled={p.searching || !p.searchQuery.trim()}>
                {p.searching ? '···' : 'SCAN'}
              </button>
            </div>
            {p.searchHits.map((h) => (
              <button key={h.id} className="hist-item" onClick={() => p.onSearchGoto(h)}>
                <span className="h-dot" />
                <span className="h-main">
                  <span className="h-label">{h.shortName}</span>
                  <span className="h-coords">
                    {h.lat.toFixed(5)}, {h.lon.toFixed(5)} · {h.type}
                  </span>
                </span>
              </button>
            ))}
            {p.searchHits.length === 0 && <div className="hint">Nominatim + Photon · tapez une adresse ou un lieu.</div>}
          </Module>

          {/* 3.2 Outils carte */}
          <Module id="3.2" title="OUTILS CARTE">
            <div className="chip-grid">
              <button
                className={`chip${p.mode === 'ZONE' ? ' on' : ''}`}
                style={{ '--c': '#3b82c4' } as React.CSSProperties}
                onClick={() => p.setMode(p.mode === 'ZONE' ? 'NONE' : 'ZONE')}
              >
                <span className="dot" />
                ZONE (clic·clic·dbl)
              </button>
              <button
                className={`chip${p.mode === 'DIST' ? ' on' : ''}`}
                style={{ '--c': '#3b82c4' } as React.CSSProperties}
                onClick={() => p.setMode(p.mode === 'DIST' ? 'NONE' : 'DIST')}
              >
                <span className="dot" />
                DISTANCE
              </button>
            </div>
            {p.mode !== 'NONE' && (
              <div className="hint">
                Cliquez les sommets puis double-cliquez pour terminer. Mode actif : {p.mode === 'ZONE' ? 'ZONE' : 'DISTANCE'}
              </div>
            )}
          </Module>

          {/* 3.3 Analyse de zone */}
          <Module id="3.3" title="ANALYSE DE ZONE">
            {!p.zoneStats && <div className="hint">Dessinez une zone avec l'outil [3.2] pour inventorier son contenu.</div>}
            {p.zoneStats && (
              <>
                <div className="kv">
                  <span className="k">SURFACE</span>
                  <span className="v hl">
                    {p.zoneStats.areaM2 < 10000
                      ? `${p.zoneStats.areaM2.toFixed(0)} m²`
                      : `${(p.zoneStats.areaM2 / 10000).toFixed(2)} ha`}
                  </span>
                </div>
                <div className="kv">
                  <span className="k">PÉRIMÈTRE</span>
                  <span className="v">{fmtMeters(p.zoneStats.perimeterM)}</span>
                </div>
                <div className="kv">
                  <span className="k">SIGNAUX</span>
                  <span className="v">{p.zoneStats.poiCount}</span>
                </div>
                <div className="kv">
                  <span className="k">ÉTABLISSEMENTS</span>
                  <span className="v">{p.zoneStats.establishmentCount}</span>
                </div>
                <div className="kv">
                  <span className="k">ADRESSES</span>
                  <span className="v">{p.zoneStats.addressCount}</span>
                </div>
                {p.zoneStats.streetsInside.length > 0 && (
                  <div className="kv">
                    <span className="k">VOIES</span>
                    <span className="v">{p.zoneStats.streetsInside.slice(0, 3).join(', ')}</span>
                  </div>
                )}
                <button className="btn full" onClick={p.onZoneClear}>
                  EFFACER LA ZONE
                </button>
              </>
            )}
          </Module>

          {/* 3.4 Graphe de liens */}
          <Module id="3.4" title="LIENS LOGIQUES">
            {p.graph && <GraphView graph={p.graph} selectedId={null} onNodeClick={() => undefined} />}
            {!p.graph && <div className="hint">Verrouillez une cible pour construire le graphe.</div>}
            {p.graph && p.graph.links.length > 0 && (
              <div className="hint">
                Trait plein : contact partagé (tél/site/email) · tirets : voie commune ou proximité.
              </div>
            )}
          </Module>

          {/* 3.5 Densité */}
          <Module id="3.5" title="DENSITÉ SECTORIELLE">
            <div className="layer-row">
              <span>AFFICHER LA CARTE DE DENSITÉ</span>
              <Toggle on={p.densityOn} onClick={() => p.setDensityOn(!p.densityOn)} />
            </div>
            <div className="hint">Cercles proportionnels au nombre de signaux par secteur.</div>
          </Module>
        </Cat>

        {/* ================= 04 COUCHES & FOND ================= */}
        <Cat title="COUCHES & FOND" code="04" open={open.layers} onToggle={() => toggle('layers')}>
          <Module id="4.1" title="RAYON D'ANALYSE">
            <div className="field-row" style={{ alignItems: 'center' }}>
              <input
                type="range"
                min={100}
                max={1500}
                step={50}
                value={p.radius}
                onChange={(e) => p.setRadius(Number(e.target.value))}
                style={{ flex: 1, accentColor: '#3b82c4' }}
              />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, minWidth: 52, textAlign: 'right' }}>
                {p.radius} m
              </span>
            </div>
          </Module>

          <Module id="4.2" title="FOND DE CARTE">
            <div className="chip-grid">
              {(['SAT', 'NIGHT', 'STREETS'] as BaseLayer[]).map((b) => (
                <button
                  key={b}
                  className={`chip${p.baseLayer === b ? ' on' : ''}`}
                  style={{ '--c': '#3b82c4' } as React.CSSProperties}
                  onClick={() => p.setBaseLayer(b)}
                >
                  <span className="dot" />
                  {b === 'SAT' ? 'SAT IMAGERIE' : b === 'NIGHT' ? 'NIGHT' : 'STREETS'}
                </button>
              ))}
            </div>
          </Module>

          <Module id="4.3" title="OVERLAYS">
            <div className="layer-row">
              <span>PÉRIMÈTRE RADAR</span>
              <Toggle on={p.showRings} onClick={() => p.setShowRings(!p.showRings)} />
            </div>
            <div className="layer-row">
              <span>MAILLAGE RUES</span>
              <Toggle on={p.showStreets} onClick={() => p.setShowStreets(!p.showStreets)} />
            </div>
            <div className="layer-row">
              <span>GRILLE MÉRIDIENS</span>
              <Toggle on={p.showGrid} onClick={() => p.setShowGrid(!p.showGrid)} />
            </div>
            <div className="layer-row">
              <span>TRACE DÉPLACEMENTS</span>
              <Toggle on={p.showTrails} onClick={() => p.setShowTrails(!p.showTrails)} />
            </div>
          </Module>

          <Module id="4.4" title={`HISTORIQUE [${p.history.length}]`}>
            {p.history.length === 0 && <div className="hint">Aucun point verrouillé.</div>}
            {p.history.map((h) => (
              <button key={h.id} className="hist-item" onClick={() => p.onHistoryGoto(h)}>
                <span className="h-dot" />
                <span className="h-main">
                  <span className="h-label">{h.label}</span>
                  <span className="h-coords">
                    {h.lat.toFixed(5)}, {h.lon.toFixed(5)}
                  </span>
                </span>
                <span
                  className="h-x"
                  onClick={(e) => {
                    e.stopPropagation();
                    p.onHistoryDel(h.id);
                  }}
                >
                  ✕
                </span>
              </button>
            ))}
          </Module>
        </Cat>

        {/* ================= 04 OPÉRATIONS ================= */}
        <Cat title="OPÉRATIONS" code="05" open={open.ops} onToggle={() => toggle('ops')}>
          <Module id="5.1" title="ACTIONS">
            <div className="chip-grid">
              <button className="btn" onClick={p.onFit} disabled={p.pois.length === 0}>
                CADRER ZONE
              </button>
              <button className="btn" onClick={p.onCopy} disabled={!p.place}>
                COPIER GPS
              </button>
            </div>
            <button className="btn amber full" onClick={p.onExport} disabled={!p.place}>
              EXPORTER RAPPORT (JSON)
            </button>
          </Module>

          <Module id="5.2" title="ÉTAT SYSTÈME">
            <div className="kv">
              <span className="k">ZOOM</span>
              <span className="v">Z{p.zoom.toFixed(1)}</span>
            </div>
            <div className="kv">
              <span className="k">SIGNAUX</span>
              <span className="v">{p.pois.length}</span>
            </div>
            <div className="kv">
              <span className="k">SEGMENTS VOIRIE</span>
              <span className="v">{p.streets.length}</span>
            </div>
            <div className="kv">
              <span className="k">HORODATAGE</span>
              <span className="v">{clock.toLocaleTimeString('fr-FR')}</span>
            </div>
          </Module>
        </Cat>

        {/* ================= 05 JOURNAL ================= */}
        <Cat title="JOURNAL" code="06" open={open.logs} onToggle={() => toggle('logs')}>
          <div className="module">
            <div className="module-head">
              <span className="mod-id">[5.1]</span>
              <span>FLUX TEMPS RÉEL</span>
            </div>
            <div className="module-body" ref={logRef}>
              <div className="log">
                {p.log.length === 0 && <div className="hint">Flux vide — en attente.</div>}
                {p.log.map((l) => (
                  <div key={l.id} className={`log-line ${l.level}`}>
                    <span className="t">
                      {new Date(l.ts).toLocaleTimeString('fr-FR', { hour12: false })}
                    </span>
                    <span className="lv">{l.level}</span>
                    <span className="m">{l.msg}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Cat>
      </div>
    </aside>
  );
}
