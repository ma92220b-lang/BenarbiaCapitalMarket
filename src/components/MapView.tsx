import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import L from 'leaflet';
import type { BaseLayer, GeoPlace, Poi, PoiCategory, StreetSegment } from '../types';

export interface MapHandle {
  flyTriPhase: (place: GeoPlace, target: [number, number]) => void;
  getMap: () => L.Map | null;
  fitPois: () => void;
  scanPulse: () => void;
}

interface Props {
  baseLayer: BaseLayer;
  target: [number, number] | null;
  place: GeoPlace | null;
  pois: Poi[];
  streets: StreetSegment[];
  activePoiCats: PoiCategory[];
  showRings: boolean;
  showStreets: boolean;
  showGrid: boolean;
  showTrails: boolean;
  onPoiSelect: (p: Poi) => void;
  onZoomChange: (z: number) => void;
}

const POI_STYLE: Record<PoiCategory, { color: string; glyph: string; label: string }> = {
  restaurant: { color: '#ffb454', glyph: 'RT', label: 'RESTAURATION' },
  cafe: { color: '#ffd97d', glyph: 'CF', label: 'CAFÉ' },
  bar: { color: '#ff9e64', glyph: 'BR', label: 'BAR/PUB' },
  fuel: { color: '#ff5370', glyph: 'FU', label: 'STATION' },
  pharmacy: { color: '#4dd0a2', glyph: 'PH', label: 'PHARMACIE' },
  hospital: { color: '#ff4d6d', glyph: 'HO', label: 'HÔPITAL' },
  school: { color: '#82aaff', glyph: 'SC', label: 'ÉCOLE' },
  bank: { color: '#c792ea', glyph: 'BK', label: 'BANQUE' },
  police: { color: '#5aa9ff', glyph: 'PL', label: 'POLICE' },
  hotel: { color: '#f78c6c', glyph: 'HT', label: 'HÔTEL' },
  supermarket: { color: '#a2e85b', glyph: 'SM', label: 'COMMERCES' },
  parking: { color: '#89ddff', glyph: 'PK', label: 'PARKING' }
};

export { POI_STYLE };

const TILE_URLS: Record<BaseLayer, string> = {
  SAT: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  NIGHT: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  STREETS: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
};

const MapView = forwardRef<MapHandle, Props>(function MapView(
  {
    baseLayer,
    target,
    pois,
    streets,
    activePoiCats,
    showRings,
    showStreets,
    showGrid,
    showTrails,
    onPoiSelect,
    onZoomChange
  },
  ref
) {
  const divRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const baseRef = useRef<L.TileLayer | null>(null);
  const gridRef = useRef<L.LayerGroup | null>(null);
  const ringsRef = useRef<L.LayerGroup | null>(null);
  const streetsRef = useRef<L.LayerGroup | null>(null);
  const poiRef = useRef<L.LayerGroup | null>(null);
  const markerRef = useRef<L.LayerGroup | null>(null);
  const trailRef = useRef<L.Polyline | null>(null);
  const trailPts = useRef<[number, number][]>([]);
  const scanRef = useRef<L.LayerGroup | null>(null);

  // Init carte
  useEffect(() => {
    if (!divRef.current || mapRef.current) return;
    const map = L.map(divRef.current, {
      center: [30, 12],
      zoom: 3,
      zoomControl: false,
      attributionControl: false,
      worldCopyJump: true,
      minZoom: 2,
      maxZoom: 19
    });
    mapRef.current = map;

    const zoomCb = () => onZoomChange(map.getZoom());
    map.on('zoomend', zoomCb);
    zoomCb();

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fond de carte
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (baseRef.current) map.removeLayer(baseRef.current);
    baseRef.current = L.tileLayer(TILE_URLS[baseLayer], {
      maxZoom: 19,
      subdomains: 'abc',
      crossOrigin: true
    });
    baseRef.current.addTo(map);
  }, [baseLayer]);

  // Grille méridiens/parallèles
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!gridRef.current) {
      gridRef.current = L.layerGroup().addTo(map);
    }
    gridRef.current.clearLayers();
    if (!showGrid) return;
    for (let lat = -60; lat <= 60; lat += 15) {
      L.polyline(
        [
          [lat, -180],
          [lat, 180]
        ],
        { color: '#00e5ff', weight: lat === 0 ? 0.9 : 0.4, opacity: 0.16, dashArray: '2 8', interactive: false }
      ).addTo(gridRef.current);
    }
    for (let lon = -180; lon <= 180; lon += 15) {
      L.polyline(
        [
          [-85, lon],
          [85, lon]
        ],
        { color: '#00e5ff', weight: lon === 0 ? 0.9 : 0.4, opacity: 0.16, dashArray: '2 8', interactive: false }
      ).addTo(gridRef.current);
    }
  }, [showGrid]);

  const updateTargetLayers = () => {
    const map = mapRef.current;
    if (!map || !target) return;

    if (!ringsRef.current) {
      ringsRef.current = L.layerGroup().addTo(map);
      streetsRef.current = L.layerGroup().addTo(map);
      poiRef.current = L.layerGroup().addTo(map);
      markerRef.current = L.layerGroup().addTo(map);
      scanRef.current = L.layerGroup().addTo(map);
    }
    const [tLat, tLon] = target;

    // Anneaux radar
    ringsRef.current.clearLayers();
    if (showRings) {
      const zoom = map.getZoom();
      const zoomMeters = 40075016 * Math.cos((tLat * Math.PI) / 180) / 2 ** (zoom + 8);
      const base = Math.max(35, Math.min(400, zoomMeters * 3.2));
      [0.5, 1, 2].forEach((k, i) => {
        L.circle([tLat, tLon], {
          radius: base * k,
          color: '#00ffcc',
          weight: 1,
          opacity: 0.5 - i * 0.12,
          fill: false,
          interactive: false
        }).addTo(ringsRef.current!);
      });
      for (let a = 0; a < 12; a++) {
        const ang = (a * 30 * Math.PI) / 180;
        const p1: [number, number] = [tLat + (base * Math.sin(ang)) / 111320, tLon + (base * Math.cos(ang)) / (111320 * Math.cos((tLat * Math.PI) / 180))];
        const p2: [number, number] = [tLat + (base * 1.15 * Math.sin(ang)) / 111320, tLon + (base * 1.15 * Math.cos(ang)) / (111320 * Math.cos((tLat * Math.PI) / 180))];
        L.polyline([p1, p2], { color: '#00ffcc', weight: 1, opacity: 0.35, interactive: false }).addTo(ringsRef.current!);
      }
    }

    // Maillage rues
    streetsRef.current!.clearLayers();
    if (showStreets) {
      for (const s of streets) {
        const col = s.distance < 80 ? '#00ffd5' : s.distance < 250 ? '#22d3ee' : '#3b82f6';
        L.polyline(s.points, {
          color: col,
          weight: s.distance < 80 ? 2.2 : 1.4,
          opacity: 0.75,
          interactive: false
        }).addTo(streetsRef.current!);
      }
    }

    // POI
    poiRef.current!.clearLayers();
    if (activePoiCats.length > 0) {
      for (const p of pois) {
        if (!activePoiCats.includes(p.category)) continue;
        const st = POI_STYLE[p.category];
        const icon = L.divIcon({
          className: 'poi-marker',
          html:
            `<div class="poi-node" style="--poi:${st.color}">` +
            `<span class="poi-dot"></span><span class="poi-ring"></span>` +
            `<span class="poi-tag">${p.name ?? st.label}</span></div>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7]
        });
        L.marker([p.lat, p.lon], { icon, title: p.name ?? st.label })
          .on('click', () => onPoiSelect(p))
          .addTo(poiRef.current!);
      }
    }

    // Marqueur cible
    markerRef.current!.clearLayers();
    const pulse = L.divIcon({
      className: 'target-marker',
      html:
        `<div class="tgt-wrap"><div class="tgt-ring"></div><div class="tgt-ring d2"></div>` +
        `<div class="tgt-dot"></div><div class="tgt-cross-h"></div><div class="tgt-cross-v"></div></div>`,
      iconSize: [60, 60],
      iconAnchor: [30, 30]
    });
    L.marker([tLat, tLon], { icon: pulse, interactive: false, zIndexOffset: 1000 }).addTo(markerRef.current!);
  };

  useEffect(() => {
    updateTargetLayers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, pois, streets, activePoiCats, showRings, showStreets]);

  // Anneaux redimensionnés au zoom
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !target) return;
    const handler = () => updateTargetLayers();
    map.on('zoomend', handler);
    return () => {
      map.off('zoomend', handler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, pois, streets, activePoiCats, showRings, showStreets]);

  // Trace du drone
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!showTrails) {
      trailRef.current?.remove();
      trailRef.current = null;
      trailPts.current = [];
      return;
    }
    if (!target) return;
    const last = trailPts.current[trailPts.current.length - 1];
    if (!last || last[0] !== target[0] || last[1] !== target[1]) {
      trailPts.current.push(target);
      if (trailPts.current.length > 30) trailPts.current.shift();
    }
    if (trailPts.current.length >= 2) {
      trailRef.current?.remove();
      trailRef.current = L.polyline(trailPts.current, {
        color: '#ffd54a',
        weight: 1.6,
        opacity: 0.8,
        dashArray: '6 6',
        interactive: false
      }).addTo(map);
    }
  }, [target, showTrails]);

  useImperativeHandle(ref, () => ({
    getMap: () => mapRef.current,
    fitPois: () => {
      const map = mapRef.current;
      if (!map || !target || pois.length === 0) return;
      const b = L.latLngBounds(pois.map((p) => [p.lat, p.lon] as [number, number]));
      b.extend(target);
      map.flyToBounds(b.pad(0.15), { duration: 1.1 });
    },
    flyTriPhase: (pl: GeoPlace, tgt: [number, number]) => {
      const map = mapRef.current;
      if (!map) return;
      const bb = pl.boundingbox; // [south, north, west, east]

      // PHASE 1 : vue monde (1.4 s)
      map.flyTo([22, 8], 3, { duration: 1.4 });

      // PHASE 2 : montée pays (1.9 s)
      setTimeout(() => {
        if (bb) {
          const [s, n, w, e] = bb;
          map.flyToBounds(
            L.latLngBounds([s, w], [n, e]).pad(0.05),
            { duration: 1.9 }
          );
        } else {
          map.flyTo(tgt, 6, { duration: 1.9 });
        }
      }, 1500);

      // PHASE 3 : plongée rue (3 s) puis lock 18
      setTimeout(() => {
        map.flyTo(tgt, 17, { duration: 2.2 });
        setTimeout(() => map.flyTo(tgt, 18, { duration: 1.0 }), 2300);
      }, 3500);
    },
    scanPulse: () => {
      const map = mapRef.current;
      if (!map || !target) return;
      const [tLat, tLon] = target;
      for (let i = 0; i < 3; i++) {
        setTimeout(() => {
          const c = L.circle([tLat, tLon], {
            radius: 30,
            color: '#00ffcc',
            weight: 2,
            opacity: 0.9,
            fill: false
          }).addTo(scanRef.current ?? map);
          let r = 30;
          const iv = setInterval(() => {
            r += map.getZoom() < 15 ? 900 : 220;
            c.setRadius(r);
            const style = (c as unknown as L.Path).getElement() as SVGElement | null;
            if (style) style.style.opacity = String(Math.max(0, 0.9 - r / 2600));
            if (r > 2600) {
              clearInterval(iv);
              c.remove();
            }
          }, 60);
        }, i * 320);
      }
    }
  }));

  // HUD central : réticule + coordonnées curseur
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const box = document.createElement('div');
    box.className = 'crosshair-overlay';
    box.innerHTML = `
      <div class="ch-line ch-h"></div>
      <div class="ch-line ch-v"></div>
      <div class="ch-corner tl"></div><div class="ch-corner tr"></div>
      <div class="ch-corner bl"></div><div class="ch-corner br"></div>
      <div class="ch-scale"><span class="ch-scale-bar"></span><span id="ch-scale-txt">—</span></div>`;
    const ctrl = new L.Control({ position: 'bottomright' });
    ctrl.onAdd = () => box;
    ctrl.addTo(map);
    const mapEl = map.getContainer();
    const scaleTxt = box.querySelector('#ch-scale-txt');
    const onMove = (e: L.LeafletMouseEvent) => {
      mapEl.dataset.cursorLat = String(e.latlng.lat.toFixed(5));
      mapEl.dataset.cursorLon = String(e.latlng.lng.toFixed(5));
    };
    const updScale = () => {
      if (!scaleTxt) return;
      const c = map.getCenter();
      const mpp = 156543.03392 * Math.cos((c.lat * Math.PI) / 180) / 2 ** map.getZoom();
      scaleTxt.textContent = `≈${(mpp * 90).toFixed(0)} m`;
    };
    map.on('mousemove', onMove);
    map.on('zoomend', updScale);
    updScale();
    return () => {
      map.off('mousemove', onMove);
      map.off('zoomend', updScale);
      ctrl.remove();
    };
  }, []);

  return <div ref={divRef} className="map-root" />;
});

export default MapView;
