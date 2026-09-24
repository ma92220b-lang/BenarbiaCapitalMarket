import { useCallback, useRef, useState } from 'react';
import MapView, { POI_STYLE, type MapHandle } from './components/MapView';
import Sidebar from './components/Sidebar';
import type {
  BaseLayer,
  GeoPlace,
  HistoryEntry,
  IntelResult,
  LogLine,
  NearestRoad,
  Phase,
  Poi,
  PoiCategory,
  SourceStatus,
  StreetSegment
} from './types';
import {
  deriveNearestRoad,
  fetchIntel,
  fetchPois,
  fetchStreets,
  fmtMeters,
  parseCoords,
  photonReverse,
  reverseGeocode,
  toDms
} from './lib/geo';

let logId = 0;
let histId = 0;

const PHASE_LABEL: Record<Phase, string> = {
  IDLE: 'EN ATTENTE',
  GEOCODING: 'GÉOCODAGE',
  ACQUIRED: 'ACQUIS PAYS',
  STREET_LEVEL: 'NIVEAU RUE',
  IMMERSED: 'FICHE CONSTITUÉE'
};

export default function App() {
  const mapRef = useRef<MapHandle | null>(null);

  // LOCALISE
  const [input, setInput] = useState('48.8584, 2.2945');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Données
  const [target, setTarget] = useState<[number, number] | null>(null);
  const [place, setPlace] = useState<GeoPlace | null>(null);
  const [pois, setPois] = useState<Poi[]>([]);
  const [streets, setStreets] = useState<StreetSegment[]>([]);
  const [nearestRoad, setNearestRoad] = useState<NearestRoad | null>(null);
  const [intel, setIntel] = useState<IntelResult | null>(null);
  const [sources, setSources] = useState<SourceStatus[]>([]);
  const [phase, setPhase] = useState<Phase>('IDLE');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [log, setLog] = useState<LogLine[]>([]);

  // Couches / options
  const [poiCats, setPoiCats] = useState<PoiCategory[]>([
    'restaurant',
    'cafe',
    'fuel',
    'pharmacy',
    'supermarket'
  ]);
  const [radius, setRadius] = useState(300);
  const [baseLayer, setBaseLayer] = useState<BaseLayer>('NIGHT');
  const [showRings, setShowRings] = useState(true);
  const [showStreets, setShowStreets] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [showTrails, setShowTrails] = useState(false);
  const [zoom, setZoom] = useState(3);
  const [cursor, setCursor] = useState<{ lat: string; lon: string } | null>(null);
  const [toasts, setToasts] = useState<{ id: number; msg: string; kind: 'ok' | 'err' }[]>([]);
  const [tileFail, setTileFail] = useState<BaseLayer | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const addLog = useCallback((level: LogLine['level'], msg: string) => {
    setLog((l) => [...l.slice(-120), { id: ++logId, ts: Date.now(), level, msg }]);
  }, []);

  const toast = useCallback((msg: string, kind: 'ok' | 'err' = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);

  /* ---------------------------------------------------------------- */
  /* LOCALISE : pipeline + reconnaissance croisée                      */
  /* ---------------------------------------------------------------- */

  const runLocalise = useCallback(
    async (rawInput?: string) => {
      const raw = (rawInput ?? input).trim();
      if (!raw || busy) return;

      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      setBusy(true);
      setErr(null);
      setPois([]);
      setStreets([]);
      setNearestRoad(null);
      setIntel(null);
      setSources([
        { id: 'nominatim', label: 'NOMINATIM', state: 'pend' },
        { id: 'photon', label: 'PHOTON', state: 'pend' },
        { id: 'overpass', label: 'OVERPASS', state: 'pend' }
      ]);
      setPhase('GEOCODING');
      addLog('SYS', `REQUÊTE LOCALISE « ${raw} »`);

      try {
        // 1. Parse
        const coords = parseCoords(raw);
        addLog('OK', `COORDS RÉSOLUES ${coords.format} · ${coords.lat.toFixed(6)}, ${coords.lon.toFixed(6)}`);
        setTarget([coords.lat, coords.lon]);

        // 2. Géocodage croisé en parallèle : Nominatim + Photon + intel 300 m
        const [pl, ph, intelRes] = await Promise.all([
          reverseGeocode(coords.lat, coords.lon, ctrl.signal),
          photonReverse(coords.lat, coords.lon, ctrl.signal),
          fetchIntel(coords.lat, coords.lon, radius, ctrl.signal).catch(() => null)
        ]);
        if (ctrl.signal.aborted) return;

        setPlace(pl);
        addLog('OK', `ADRESSE RÉSOLUE : ${pl.shortName} — ${pl.country ?? '?'}`);

        // 3. Vérification croisée d'adresse (2 géocodeurs + numéros OSM)
        const phStreet = ph?.street ?? '';
        const agree =
          ph && phStreet
            ? phStreet.toLowerCase().includes(pl.road?.toLowerCase().split(' ')[0] ?? '###') ||
              (pl.road ?? '').toLowerCase().includes(phStreet.toLowerCase().split(' ')[0])
            : false;
        const agreementMeters =
          ph && ph.housenumber ? 0 : ph && phStreet ? 15 : null;

        setIntel({
          establishments: intelRes?.establishments ?? [],
          addresses: intelRes?.addresses ?? [],
          streetNames: intelRes?.streetNames ?? [],
          verify: {
            nominatim: true,
            photon: agree,
            agreementMeters,
            osmAddress: intelRes?.verify.osmAddress ?? false
          }
        });
        setSources([
          { id: 'nominatim', label: 'NOMINATIM', state: 'ok', detail: pl.displayName },
          {
            id: 'photon',
            label: 'PHOTON',
            state: ph ? (agree ? 'ok' : 'warn') : 'err',
            detail: ph ? `${ph.street ?? '?'} · ${ph.city ?? '?'}` : 'injoignable'
          },
          {
            id: 'overpass',
            label: 'OVERPASS',
            state: intelRes ? 'ok' : 'err',
            detail: intelRes
              ? `${intelRes.establishments.length} fiches · ${intelRes.addresses.length} numéros`
              : 'injoignable'
          }
        ]);
        addLog(
          agree ? 'OK' : 'WARN',
          agree
            ? 'CROISEMENT 2/2 GÉOCODEURS · ADRESSE CONFIRMÉE'
            : 'GÉOCODEURS EN DÉSACCORD · FIABILITÉ MOYENNE'
        );
        if (intelRes) {
          addLog(
            'OK',
            `RECONNAISSANCE ${intelRes.establishments.length} ÉTABLISSEMENTS · ${intelRes.addresses.length} ADRESSES · PÉRIMÈTRE ${Math.max(radius, 300)} M`
          );
        }

        // 4. Zoom cinématique tri-phase
        setPhase('ACQUIRED');
        mapRef.current?.flyTriPhase(pl, [coords.lat, coords.lon]);
        addLog('INFO', 'SÉQUENCE DE PLONGÉE · PAYS → VILLE → RUE');

        // 5. Collecte POI + voirie (affichage carte)
        const [p, s] = await Promise.all([
          fetchPois(coords.lat, coords.lon, radius, poiCats.length ? poiCats : ['restaurant'], ctrl.signal),
          fetchStreets(coords.lat, coords.lon, radius, ctrl.signal)
        ]);
        if (ctrl.signal.aborted) return;
        setPois(p);
        setStreets(s);
        setNearestRoad(deriveNearestRoad([coords.lat, coords.lon], s));
        addLog('OK', `${p.length} SIGNAUX POI · ${s.length} SEGMENTS VOIRIE`);

        // 6. Historique
        setHistory((h) =>
          [
            {
              id: ++histId,
              raw,
              lat: coords.lat,
              lon: coords.lon,
              label: pl.shortName,
              ts: Date.now()
            },
            ...h
          ].slice(0, 30)
        );

        // 7. Fiche constituée
        setTimeout(() => {
          setPhase('IMMERSED');
          toast(`FICHE CONSTITUÉE : ${pl.shortName}`);
        }, 6600);
      } catch (e) {
        if (ctrl.signal.aborted) return;
        const msg = e instanceof Error ? e.message : 'ERREUR INCONNUE';
        setErr(msg);
        setPhase('IDLE');
        addLog('ERR', `ÉCHEC LOCALISE : ${msg}`);
      } finally {
        if (!ctrl.signal.aborted) setBusy(false);
      }
    },
    [input, busy, radius, poiCats, addLog, toast]
  );

  /* ---------------------------------------------------------------- */
  /* Actions                                                           */
  /* ---------------------------------------------------------------- */

  const gotoHistory = useCallback(
    (h: HistoryEntry) => {
      setInput(h.raw);
      void runLocalise(h.raw);
    },
    [runLocalise]
  );

  const delHistory = useCallback((id: number) => {
    setHistory((h) => h.filter((x) => x.id !== id));
  }, []);

  const togglePoiCat = useCallback(
    (c: PoiCategory) => {
      setPoiCats((cs) => {
        const next = cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c];
        addLog('INFO', `COUCHE POI ${POI_STYLE[c].label} ${cs.includes(c) ? 'OFF' : 'ON'}`);
        return next;
      });
    },
    [addLog]
  );

  const doScan = useCallback(() => {
    mapRef.current?.scanPulse();
    addLog('SYS', 'SWEEP ÉMIS');
  }, [addLog]);

  const doFit = useCallback(() => {
    mapRef.current?.fitPois();
    addLog('INFO', "CADRAGE ZONE D'OPÉRATION");
  }, [addLog]);

  const doCopy = useCallback(() => {
    if (!place) return;
    const txt = `${place.lat.toFixed(6)}, ${place.lon.toFixed(6)}`;
    navigator.clipboard
      .writeText(txt)
      .then(() => toast(`COORDONNÉES COPIÉES : ${txt}`))
      .catch(() => toast('PRESSE-PAPIERS REFUSÉ PAR LE NAVIGATEUR', 'err'));
  }, [place, toast]);

  const doExport = useCallback(() => {
    if (!place || !target) return;
    const report = {
      mission: `GDN-${Date.now()}`,
      generated: new Date().toISOString(),
      target: {
        lat: place.lat,
        lon: place.lon,
        dms: `${toDms(place.lat, true)} ${toDms(place.lon, false)}`,
        address: place.displayName,
        country: place.country,
        type: `${place.class}/${place.type}`
      },
      verification: intel?.verify ?? null,
      nearestRoad: nearestRoad
        ? { name: nearestRoad.name, distance_m: Math.round(nearestRoad.distance) }
        : null,
      establishments: (intel?.establishments ?? []).map((e) => ({
        name: e.name,
        category: e.category,
        address: e.address ?? null,
        phone: e.phone ?? null,
        website: e.website ?? null,
        email: e.email ?? null,
        opening_hours: e.openingHours ?? null,
        distance_m: Math.round(e.distance),
        sources: e.sources
      })),
      addresses: (intel?.addresses ?? []).map((a) => ({
        number: a.housenumber,
        street: a.street,
        distance_m: Math.round(a.distance)
      })),
      streets: streets.slice(0, 40).map((s) => s.name),
      settings: { radius_m: radius, base_layer: baseLayer }
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `gdn-fiche-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    addLog('OK', 'FICHE RENSEIGNEMENT EXPORTÉE (JSON)');
    toast('FICHE TÉLÉCHARGÉE');
  }, [place, target, intel, streets, nearestRoad, radius, baseLayer, addLog, toast]);

  const statusLed = busy ? 'busy' : err ? 'err' : phase === 'IMMERSED' ? '' : 'warn';

  return (
    <div className={`app-shell map-${baseLayer.toLowerCase()}${tileFail === baseLayer ? ' tiles-down' : ''}`}>
      <MapView
        ref={mapRef}
        baseLayer={baseLayer}
        target={target}
        place={place}
        pois={pois}
        streets={streets}
        activePoiCats={poiCats}
        showRings={showRings}
        showStreets={showStreets}
        showGrid={showGrid}
        showTrails={showTrails}
        onPoiSelect={(p) => {
          addLog('INFO', `POI : ${p.name ?? POI_STYLE[p.category].label} · ${fmtMeters(p.distance)}`);
          mapRef.current?.getMap()?.flyTo([p.lat, p.lon], Math.max(17, zoom), { duration: 1.2 });
        }}
        onZoomChange={(z) => {
          setZoom(z);
          const m = mapRef.current?.getMap();
          if (m) {
            const c = m.getCenter();
            setCursor({ lat: c.lat.toFixed(5), lon: c.lng.toFixed(5) });
          }
        }}
        onTileError={(layer) => {
          if (tileFail === layer) return;
          setTileFail(layer);
          addLog('WARN', `FOND ${layer} INJOIGNABLE · FOND DE SECOURS ACTIVÉ`);
          toast('FOND DE CARTE BLOQUÉ — AFFICHAGE DE SECOURS (réseau ?', 'err');
        }}
      />

      {/* Topbar */}
      <header className="topbar">
        <div className="topbar-logo">
          <span className="sig">GDN-OS</span>
          <span style={{ color: 'var(--txt-2)', fontSize: 10 }}>v3.0</span>
        </div>
        <div className="topbar-sep" />
        <div className="topbar-status">
          <span className={`led ${statusLed}`} />
          <span>{busy ? 'TRAITEMENT…' : PHASE_LABEL[phase]}</span>
        </div>
        <div className="topbar-sep" />
        <div className="topbar-status">
          <span>FEEDS · OSM / NOMINATIM / PHOTON / OVERPASS</span>
        </div>
        <div className="topbar-spacer" />
        <div className="topbar-clock">
          {new Date().toLocaleTimeString('fr-FR', { hour12: false })}
          <small>LOCAL</small>
        </div>
      </header>

      {/* Panel latéral */}
      <Sidebar
        input={input}
        setInput={setInput}
        onLocalise={() => void runLocalise()}
        busy={busy}
        err={err}
        place={place}
        pois={pois}
        streets={streets}
        nearestRoad={nearestRoad}
        intel={intel}
        sources={sources}
        poiCats={poiCats}
        togglePoiCat={togglePoiCat}
        radius={radius}
        setRadius={setRadius}
        baseLayer={baseLayer}
        setBaseLayer={(b) => {
          setBaseLayer(b);
          addLog('INFO', `FOND DE CARTE → ${b}`);
        }}
        showRings={showRings}
        setShowRings={setShowRings}
        showStreets={showStreets}
        setShowStreets={setShowStreets}
        showGrid={showGrid}
        setShowGrid={setShowGrid}
        showTrails={showTrails}
        setShowTrails={setShowTrails}
        history={history}
        onHistoryGoto={gotoHistory}
        onHistoryDel={delHistory}
        onScan={doScan}
        onFit={doFit}
        onExport={doExport}
        onCopy={doCopy}
        log={log}
        zoom={zoom}
      />

      {/* Overlay phase */}
      {busy && (
        <div className="lock-overlay">
          <div className="lock-box">
            <div className="lock-phase">TRIANGULATION</div>
            <div className="lock-sub">GÉOCODAGE CROISÉ · RECONNAISSANCE · VOIRIE</div>
          </div>
        </div>
      )}

      {/* Bandeau diagnostic tuiles */}
      {tileFail === baseLayer && (
        <div className="tiles-down-banner">
          ⚠ FOND {baseLayer} BLOQUÉ PAR LE RÉSEAU — AFFICHAGE DE SECOURS ACTIF.
          <br />
          Testez le module [3.2] FOND DE CARTE (STREETS) ou changez de réseau.
        </div>
      )}

      {/* Statusbar */}
      <footer className="statusbar">
        <div className="sb-item">
          <span className="sb-k">CURSEUR</span>
          <span className="sb-v">{cursor ? `${cursor.lat}, ${cursor.lon}` : '—, —'}</span>
        </div>
        <div className="sb-item">
          <span className="sb-k">CIBLE</span>
          <span className="sb-v">
            {target ? `${target[0].toFixed(5)}, ${target[1].toFixed(5)}` : 'AUCUNE'}
          </span>
        </div>
        <div className="sb-item">
          <span className="sb-k">ZOOM</span>
          <span className="sb-v">Z{zoom.toFixed(1)}</span>
        </div>
        <div className="sb-item">
          <span className="sb-k">FICHES</span>
          <span className="sb-v">{intel?.establishments.length ?? 0}</span>
        </div>
        <div className="sb-item">
          <span className="sb-k">PHASE</span>
          <span className="sb-v blink">{PHASE_LABEL[phase]}</span>
        </div>
        <div className="sb-grow" />
        <div className="sb-item">
          <span className="sb-k">FEED</span>
          <span className="sb-v">OPENSTREETMAP</span>
        </div>
      </footer>

      {/* Toasts */}
      <div className="toast-wrap">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="toast"
            style={{ '--c': t.kind === 'ok' ? 'var(--line-hi)' : 'var(--err)' } as React.CSSProperties}
          >
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  );
}
