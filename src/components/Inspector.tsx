import type { IntelEstablishment, Poi } from '../types';
import { POI_STYLE } from './MapView';
import { fmtMeters, toDms } from '../lib/geo';

export interface Selection {
  kind: 'poi' | 'establishment' | 'address' | 'target';
  title: string;
  subtitle?: string;
  lat: number;
  lon: number;
  rows: { k: string; v: string; link?: string }[];
  osmId?: string;
  distance?: number;
}

interface Props {
  selection: Selection | null;
  onClose: () => void;
  onGoto: (lat: number, lon: number) => void;
}

export default function Inspector({ selection, onClose, onGoto }: Props) {
  if (!selection) return null;
  const s = selection;

  return (
    <aside className="inspector">
      <div className="inspector-head">
        <div>
          <div className="inspector-kind">
            {s.kind === 'poi'
              ? 'SIGNAL POI'
              : s.kind === 'establishment'
                ? 'ÉTABLISSEMENT'
                : s.kind === 'address'
                  ? 'ADRESSE'
                  : 'CIBLE'}
          </div>
          <div className="inspector-title">{s.title}</div>
          {s.subtitle && <div className="inspector-sub">{s.subtitle}</div>}
        </div>
        <button className="inspector-x" onClick={onClose} title="Fermer">
          ✕
        </button>
      </div>

      <div className="inspector-body">
        {s.distance !== undefined && (
          <div className="kv">
            <span className="k">DISTANCE CIBLE</span>
            <span className="v hl">{fmtMeters(s.distance)}</span>
          </div>
        )}
        <div className="kv">
          <span className="k">LAT</span>
          <span className="v">{s.lat.toFixed(6)}</span>
        </div>
        <div className="kv">
          <span className="k">LON</span>
          <span className="v">{s.lon.toFixed(6)}</span>
        </div>
        <div className="kv">
          <span className="k">DMS</span>
          <span className="v">
            {toDms(s.lat, true)} {toDms(s.lon, false)}
          </span>
        </div>

        {s.rows.map((r, i) => (
          <div key={i} className="kv">
            <span className="k">{r.k}</span>
            <span className="v">
              {r.link ? (
                <a href={r.link} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>
                  {r.v}
                </a>
              ) : (
                r.v
              )}
            </span>
          </div>
        ))}

        {/* Traçabilité */}
        {s.osmId && (
          <div className="trace">
            <div className="trace-title">TRAÇABILITÉ</div>
            <div className="kv">
              <span className="k">OBJET OSM</span>
              <span className="v">
                <a
                  href={`https://www.openstreetmap.org/${s.osmId.startsWith('n') ? 'node' : 'way'}/${s.osmId.slice(1)}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: 'inherit' }}
                >
                  {s.osmId}
                </a>
              </span>
            </div>
            <div className="kv">
              <span className="k">LICENCE</span>
              <span className="v">ODbL · OPENSTREETMAP</span>
            </div>
          </div>
        )}

        <div className="inspector-actions">
          <button className="btn" onClick={() => onGoto(s.lat, s.lon)}>
            CENTRER CARTE
          </button>
        </div>
      </div>
    </aside>
  );
}

/** Utilitaire : POI → Selection (partagé avec MapView/Sidebar). */
export function poiToSelection(p: Poi): Selection {
  const st = POI_STYLE[p.category];
  return {
    kind: 'poi',
    title: p.name ?? st.label,
    subtitle: st.label,
    lat: p.lat,
    lon: p.lon,
    distance: p.distance,
    osmId: p.osmId,
    rows: [
      ...(p.phone ? [{ k: 'TÉL', v: p.phone, link: `tel:${p.phone.replace(/\s/g, '')}` }] : []),
      ...(p.website ? [{ k: 'WEB', v: p.website.replace(/^https?:\/\//, ''), link: p.website }] : [])
    ]
  };
}

/** Utilitaire : établissement → Selection. */
export function estToSelection(e: IntelEstablishment): Selection {
  return {
    kind: 'establishment',
    title: e.name,
    subtitle: e.category === 'other' ? 'POINT D’INTÉRÊT' : POI_STYLE[e.category].label,
    lat: e.lat,
    lon: e.lon,
    distance: e.distance,
    osmId: e.osmId,
    rows: [
      ...(e.address ? [{ k: 'ADRESSE', v: e.address }] : []),
      ...(e.phone ? [{ k: 'TÉL', v: e.phone, link: `tel:${e.phone.replace(/\s/g, '')}` }] : []),
      ...(e.website ? [{ k: 'WEB', v: e.website.replace(/^https?:\/\//, ''), link: e.website }] : []),
      ...(e.email ? [{ k: 'EMAIL', v: e.email, link: `mailto:${e.email}` }] : []),
      ...(e.openingHours ? [{ k: 'HORAIRES', v: e.openingHours }] : []),
      { k: 'SOURCES', v: e.sources.join(' + ') }
    ]
  };
}
