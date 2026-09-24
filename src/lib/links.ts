import type { BuildingAddress, EntityLink, EntityNode, IntelEstablishment, LinkGraph } from '../types';

function normPhone(p: string): string {
  return p.replace(/[^+\d]/g, '').replace(/^\+33/, '0').replace(/\D/g, '').slice(-9);
}

function normSite(w: string): string {
  return w
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '')
    .toLowerCase();
}

/**
 * Construit le graphe de liens logiques entre la cible, les établissements
 * et les adresses du périmètre. Uniquement des rapprochements factuels,
 * chacun traçable : contact partagé, voie commune, proximité, homonymie.
 */
export function buildLinkGraph(
  targetLabel: string,
  target: [number, number],
  establishments: IntelEstablishment[],
  addresses: BuildingAddress[]
): LinkGraph {
  const nodes: EntityNode[] = [
    { id: 'target', kind: 'target', label: targetLabel, lat: target[0], lon: target[1] }
  ];
  const links: EntityLink[] = [];

  establishments.forEach((e, i) => {
    nodes.push({ id: `est:${i}`, kind: 'establishment', label: e.name, lat: e.lat, lon: e.lon });
  });

  // Adresses de la même voie que la cible (si connue) — échantillon limité
  const streetGroups = new Map<string, BuildingAddress[]>();
  for (const a of addresses) {
    const key = a.street.toLowerCase();
    const arr = streetGroups.get(key) ?? [];
    arr.push(a);
    streetGroups.set(key, arr);
  }
  let addrId = 0;
  const addrNodeId = new Map<string, string>();
  for (const [street, list] of streetGroups) {
    if (list.length < 2) continue; // une adresse isolée n'apporte pas de lien
    for (const a of list.slice(0, 4)) {
      const id = `addr:${addrId++}`;
      addrNodeId.set(`${street}|${a.housenumber}`, id);
      nodes.push({ id, kind: 'address', label: `${a.housenumber} ${a.street}`, lat: a.lat, lon: a.lon });
    }
    // chaîne de la voie : chaque adresse relie la suivante
    for (let i = 1; i < Math.min(list.length, 4); i++) {
      const from = addrNodeId.get(`${street}|${list[i - 1].housenumber}`);
      const to = addrNodeId.get(`${street}|${list[i].housenumber}`);
      if (from && to) {
        links.push({
          from,
          to,
          kind: 'same-street',
          weight: 3,
          detail: `Même voie : ${list[0].street}`
        });
      }
    }
  }

  // Contacts partagés entre établissements (téléphone, site, email)
  const byPhone = new Map<string, number[]>();
  const bySite = new Map<string, number[]>();
  const byEmail = new Map<string, number[]>();
  establishments.forEach((e, i) => {
    if (e.phone) {
      const k = normPhone(e.phone);
      if (k.length >= 9) byPhone.set(k, [...(byPhone.get(k) ?? []), i]);
    }
    if (e.website) {
      const k = normSite(e.website);
      if (k.includes('.')) bySite.set(k, [...(bySite.get(k) ?? []), i]);
    }
    if (e.email) {
      const k = e.email.toLowerCase();
      byEmail.set(k, [...(byEmail.get(k) ?? []), i]);
    }
  });

  const pushLink = (from: string, to: string, kind: EntityLink['kind'], weight: number, detail: string) => {
    if (from === to) return;
    if (links.some((l) => l.from === from && l.to === to && l.kind === kind)) return;
    links.push({ from, to, kind, weight, detail });
  };

  for (const [, idxs] of byPhone) {
    for (let i = 1; i < idxs.length; i++) {
      pushLink(`est:${idxs[i - 1]}`, `est:${idxs[i]}`, 'phone-shared', 1, 'Téléphone identique');
    }
  }
  for (const [, idxs] of bySite) {
    for (let i = 1; i < idxs.length; i++) {
      pushLink(`est:${idxs[i - 1]}`, `est:${idxs[i]}`, 'website-shared', 1, 'Site web identique');
    }
  }
  for (const [, idxs] of byEmail) {
    for (let i = 1; i < idxs.length; i++) {
      pushLink(`est:${idxs[i - 1]}`, `est:${idxs[i]}`, 'email-shared', 1, 'Email identique');
    }
  }

  // Proximité étroite + homonymie avec la cible
  establishments.forEach((e, i) => {
    const d = Math.hypot((e.lat - target[0]) * 111320, (e.lon - target[1]) * 111320 * Math.cos((target[0] * Math.PI) / 180));
    if (d < 60) {
      pushLink('target', `est:${i}`, 'nearby', 2, `À ${Math.round(d)} m de la cible`);
    }
    const eNorm = e.name.toLowerCase().replace(/[^a-zà-ÿ0-9]/g, '');
    const tNorm = targetLabel.toLowerCase().replace(/[^a-zà-ÿ0-9]/g, '');
    if (eNorm.length > 3 && (eNorm.includes(tNorm) || tNorm.includes(eNorm))) {
      pushLink('target', `est:${i}`, 'same-name', 1, 'Homonyme de la cible');
    }
  });

  // Établissement situé à une adresse relevée → lien établissement/adresse
  establishments.forEach((e, i) => {
    if (!e.address) return;
    const m = e.address.match(/^(\S+)\s+(.+?)(?:,|$)/);
    if (!m) return;
    const key = `${m[2]}|${m[1]}`;
    const nodeId = addrNodeId.get(key.toLowerCase());
    if (nodeId) {
      pushLink(`est:${i}`, nodeId, 'same-street', 2, 'Établi à cette adresse');
    }
  });

  return { nodes, links: links.slice(0, 60) };
}
