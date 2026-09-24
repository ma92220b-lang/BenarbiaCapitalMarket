import { useMemo } from 'react';
import type { LinkGraph } from '../types';

interface Props {
  graph: LinkGraph;
  onNodeClick: (id: string) => void;
  selectedId: string | null;
}

const W = 320;
const H = 260;

export default function GraphView({ graph, onNodeClick, selectedId }: Props) {
  const layout = useMemo(() => {
    const targets = graph.nodes.filter((n) => n.id === 'target');
    const ests = graph.nodes.filter((n) => n.kind === 'establishment');
    const addrs = graph.nodes.filter((n) => n.kind === 'address');

    const pos = new Map<string, { x: number; y: number }>();
    targets.forEach((n) => pos.set(n.id, { x: W / 2, y: H / 2 }));

    const ring = (list: typeof ests, r: number, offset = 0) => {
      list.forEach((n, i) => {
        const a = (2 * Math.PI * i) / Math.max(1, list.length) + offset;
        pos.set(n.id, { x: W / 2 + r * Math.cos(a), y: H / 2 + r * Math.sin(a) });
      });
    };
    ring(ests, 85);
    ring(addrs, 120, Math.PI / ests.length / 2);
    return pos;
  }, [graph]);

  if (graph.nodes.length <= 1) {
    return <div className="hint">Aucun lien logique détecté dans le périmètre.</div>;
  }

  return (
    <svg className="graph-svg" viewBox={`0 0 ${W} ${H}`} role="img">
      {/* Liens */}
      {graph.links.map((l, i) => {
        const a = layout.get(l.from);
        const b = layout.get(l.to);
        if (!a || !b) return null;
        const color =
          l.kind === 'phone-shared' || l.kind === 'website-shared' || l.kind === 'email-shared'
            ? '#3b82c4'
            : l.kind === 'same-street'
              ? '#2a5a80'
              : '#1c2836';
        const dash = l.weight === 1 ? undefined : '3 3';
        return (
          <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={l.weight === 1 ? 1.4 : 0.8} strokeDasharray={dash} />
        );
      })}
      {/* Nœuds */}
      {graph.nodes.map((n) => {
        const p = layout.get(n.id);
        if (!p) return null;
        const r = n.id === 'target' ? 7 : n.kind === 'establishment' ? 5 : 3.5;
        const fill = n.id === 'target' ? '#3b82c4' : n.kind === 'establishment' ? '#274b68' : '#1c2836';
        const sel = selectedId === n.id;
        return (
          <g key={n.id} onClick={() => onNodeClick(n.id)} style={{ cursor: 'pointer' }}>
            {sel && <circle cx={p.x} cy={p.y} r={r + 4} fill="none" stroke="#c8d2dc" strokeWidth={0.8} />}
            <circle cx={p.x} cy={p.y} r={r} fill={fill} stroke={sel ? '#c8d2dc' : '#0d1015'} strokeWidth={1} />
            <title>{n.label}</title>
          </g>
        );
      })}
    </svg>
  );
}
