import { useEffect, useMemo, useRef, useState } from 'react';
import type { BaseLayer, GeoPlace, HistoryEntry, LogLine, Poi, PoiCategory, StreetSegment } from '../types';
import { POI_STYLE } from './MapView';
import { cardinal, fmtMeters, toDms } from '../lib/geo';

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
        <span className="idx" style={{ color: 'var(--cyan)', fontFamily: 'var(--font-mono)', fontSize: 9 }}>
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
  children,
  accent
}: {
  id: string;
  title: string;
  children: React.ReactNode;
  accent?: string;
}) {
  return (
    <div className="module" style={accent ? { borderColor: `${accent}55` } : undefined}>
      <div className="module-head">
        <span className="mod-id">[{id}]</span>
        <span>{title}</span>
        <span className="spacer" />
        <span style={{ color: 'var(--green)' }}>●</span>
      </div>
      <div className="module-body">{children}</div>
    </div>
  );
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      className={`toggle${on ? ' on' : ''}`}
      onClick={onClick}
      aria-pressed={on}
    />
  );
}

const CATS = [
  { id: 'localised', title: 'LOCALISED POINT', code: '01' },
  { id: 'layers', title: 'COUCHES & FOND', code: '02' },
  { id: 'intel', title: 'RENSEIGNEMENT', code: '03' },
  { id: 'ops', title: 'OPÉRATIONS', code: '04' },
  { id: 'logs', title: 'JOURNAL TÉLÉMÉTRIE', code: '05' }
] as const;
type CatId = (typeof CATS)[number]['id'];

export default function Sidebar(p: SidebarProps) {
  const [open, setOpen] = useState<Record<CatId, boolean>>({
    localised: true,
    layers: true,
    intel: true,
    ops: false,
    logs: false
  });
  const toggle = (id: CatId) => setOpen((o) => ({ ...o, [id]: !o[id] }));

  const logRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [p.log]);

  const topPois = useMemo(() => p.pois.slice(0, 5), [p.pois]);

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
          {/* --- Option : LOCALISE --- */}
          <div className="opt">
            <button className="opt-label active">
              <span className="idx">1.0</span> LOCALISE
              <span style={{ marginLeft: 'auto', color: 'var(--teal)', fontSize: 9 }}>◉ ACTIVE</span>
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
              <div className="hint" style={{ color: 'var(--red)' }}>
                ⚠ {p.err}
              </div>
            )}

            <div className="hint">
              <b>FORMATS</b> : DD « 48.8584, 2.2945 » · DMS « 48°51'29"N, 2°17'40"E » · DDM · signés ·
              ordinata S/W auto
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
                  <span className="v">
                    {toDms(p.place.lat, true)} {toDms(p.place.lon, false)}
                  </span>
                </div>
                <div className="kv">
                  <span className="k">TYPE</span>
                  <span className="v">
                    {p.place.class}/{p.place.type}
                  </span>
                </div>
                <div className="kv">
                  <span className="k">PAYS</span>
                  <span className="v">
                    {p.place.country ?? '—'} [{p.place.countryCode ?? '—'}]
                  </span>
                </div>
                {p.nearestRoad && (
                  <div className="kv">
                    <span className="k">AXE PROCHE</span>
                    <span className="v">
                      {p.nearestRoad.name} · {fmtMeters(p.nearestRoad.distance)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </Cat>

        {/* ================= 02 COUCHES & FOND ================= */}
        <Cat title="COUCHES & FOND" code="02" open={open.layers} onToggle={() => toggle('layers')}>
          {/* 2.1 Scan radar */}
          <Module id="2.1" title="SCAN RADAR">
            <button className="btn full" onClick={p.onScan} disabled={!p.place}>
              ◉ LANCER SWEEP RADAR
            </button>
            <div className="hint">3 ondes concentriques émises depuis la cible verrouillée.</div>
          </Module>

          {/* 2.2 Fond de carte */}
          <Module id="2.2" title="FOND DE CARTE">
            <div className="chip-grid">
              {(['SAT', 'NIGHT', 'STREETS'] as BaseLayer[]).map((b) => (
                <button
                  key={b}
                  className={`chip${p.baseLayer === b ? ' on' : ''}`}
                  style={{ '--c': b === 'SAT' ? '#ffb454' : b === 'NIGHT' ? '#00e5ff' : '#a2e85b' } as React.CSSProperties}
                  onClick={() => p.setBaseLayer(b)}
                >
                  <span className="dot" />
                  {b === 'SAT' ? 'SAT IMAGERIE' : b === 'NIGHT' ? 'NIGHT OPS' : 'STREETS OSM'}
                </button>
              ))}
            </div>
          </Module>

          {/* 2.3 Overlays */}
          <Module id="2.3" title="OVERLAYS TACTIQUES">
            <div className="layer-row">
              <span>ANNEAUX RADAR</span>
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
              <span>TRACE DRONE</span>
              <Toggle on={p.showTrails} onClick={() => p.setShowTrails(!p.showTrails)} />
            </div>
          </Module>

          {/* 2.4 Historique */}
          <Module id="2.4" title={`HISTORIQUE [${p.history.length}]`}>
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

        {/* ================= 03 RENSEIGNEMENT ================= */}
        <Cat title="RENSEIGNEMENT" code="03" open={open.intel} onToggle={() => toggle('intel')}>
          {/* 3.1 Catégories POI */}
          <Module id="3.1" title="SIGNAUX POI">
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

          {/* 3.2 Rayon d'analyse */}
          <Module id="3.2" title="RAYON D'ANALYSE">
            <div className="field-row" style={{ alignItems: 'center' }}>
              <input
                type="range"
                min={100}
                max={1500}
                step={50}
                value={p.radius}
                onChange={(e) => p.setRadius(Number(e.target.value))}
                style={{ flex: 1, accentColor: '#00ffcc' }}
              />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--teal)', minWidth: 52, textAlign: 'right' }}>
                {p.radius} m
              </span>
            </div>
            <div className="hint">Portée de collecte des signaux POI et du maillage rues.</div>
          </Module>

          {/* 3.3 POI les plus proches */}
          <Module id="3.3" title="POI PROXIMITÉ">
            {topPois.length === 0 && <div className="hint">Aucun signal capté.</div>}
            {topPois.map((poi) => {
              const st = POI_STYLE[poi.category];
              const brg = cardinal(
                Math.atan2(poi.lon - (p.place?.lon ?? 0), poi.lat - (p.place?.lat ?? 0)) *
                  (180 / Math.PI)
              );
              return (
                <div key={poi.id} className="kv" style={{ padding: '4px 0' }}>
                  <span className="k" style={{ color: st.color }}>
                    {st.glyph}
                  </span>
                  <span className="v" style={{ textAlign: 'left', flex: 1, margin: '0 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {poi.name ?? st.label}
                  </span>
                  <span className="v hl">
                    {fmtMeters(poi.distance)} {brg}
                  </span>
                </div>
              );
            })}
          </Module>

          {/* 3.4 Rues détectées */}
          <Module id="3.4" title="VOIRIE URBAINE">
            {streetNames.length === 0 && <div className="hint">Maillage non résolu.</div>}
            {streetNames.map((n, i) => (
              <div key={n + i} className="kv">
                <span className="k">R{i + 1}</span>
                <span className="v">{n}</span>
              </div>
            ))}
          </Module>
        </Cat>

        {/* ================= 04 OPÉRATIONS ================= */}
        <Cat title="OPÉRATIONS" code="04" open={open.ops} onToggle={() => toggle('ops')}>
          <Module id="4.1" title="ACTIONS RAPIDES">
            <div className="chip-grid">
              <button className="btn" onClick={p.onFit} disabled={p.pois.length === 0}>
                ⤢ CADRER ZONE
              </button>
              <button className="btn" onClick={p.onCopy} disabled={!p.place}>
                ⧉ COPIER GPS
              </button>
            </div>
            <button className="btn amber full" onClick={p.onExport} disabled={!p.place}>
              ⬒ EXPORTER RAPPORT MISSION (JSON)
            </button>
          </Module>

          <Module id="4.2" title="ÉTAT SYSTÈME">
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
        <Cat title="JOURNAL TÉLÉMÉTRIE" code="05" open={open.logs} onToggle={() => toggle('logs')}>
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
