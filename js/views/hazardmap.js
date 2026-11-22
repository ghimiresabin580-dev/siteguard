// Site Map: satellite view of the site with a pin for every hazard.

import * as store from '../store.js';
import * as H from '../hazards.js';
import { esc, dayDiff, today, dayOf } from '../util.js';
import { mapsAvailable, createMap, fitSite, drawItem, addLocateButton } from '../maps.js';
import { toast } from '../ui.js';
import { openDetail } from './observations.js';

let map = null;
const RESOLVED = '#2e7d32';

// Hazards with GPS use it; others sit in the middle of their zone, spread out a little
function position(o, i) {
  if (o.lat && o.lon) return [o.lat, o.lon];
  const item = store.get('items', o.zoneId);
  if (!item?.shape?.length) return null;
  const pts = item.shape;
  const c = pts.reduce((a, p) => [a[0] + p[0] / pts.length, a[1] + p[1] / pts.length], [0, 0]);
  const ang = i * 2.4, r = i ? 0.00006 * Math.sqrt(i) : 0;
  return [c[0] + r * Math.sin(ang), c[1] + r * Math.cos(ang) * 1.9];
}

function pin(o) {
  const done = o.status === 'closed';
  const color = done ? RESOLVED : H.RISK[o.severity].color;
  const mark = done
    ? '<path d="m10.5 16 3.5 3.5 6-7" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>'
    : '<path d="M16 9.5v6.5" stroke="#fff" stroke-width="2.8" stroke-linecap="round"/><circle cx="16" cy="20.6" r="1.7" fill="#fff"/>';
  return L.divIcon({
    className: 'hz-pin', iconSize: [32, 42], iconAnchor: [16, 41], tooltipAnchor: [0, -36],
    html: `<svg viewBox="0 0 32 42" width="32" height="42" aria-hidden="true"><path d="M16 41C16 41 2 25.5 2 15.5a14 14 0 0 1 28 0C30 25.5 16 41 16 41Z" fill="${color}" stroke="#fff" stroke-width="2"/>${mark}</svg>`
  });
}

export default {
  meta: { key: 'sitemap', label: 'Site Map', icon: 'map', full: true },
  render: () => `<div class="hz-map-wrap">
      <div id="hzMap" class="hz-map">${mapsAvailable() ? '' : '<p class="m-empty">The map could not load. Check the internet connection.</p>'}</div>
      <div class="hz-legend">
        <span><i style="background:${H.RISK.high.color}"></i>High Risk</span>
        <span><i style="background:${H.RISK.medium.color}"></i>Medium</span>
        <span><i style="background:${H.RISK.low.color}"></i>Low</span>
        <span><i class="ok" style="background:${RESOLVED}"></i>Resolved</span>
      </div>
    </div>`,

  mount() {
    if (!mapsAvailable()) return;
    map = createMap(document.getElementById('hzMap'), { zoomControl: false });
    L.control.zoom({ position: 'topright' }).addTo(map);
    addLocateButton(map, msg => toast(msg, 'err'));
    const site = L.layerGroup().addTo(map);
    store.all('items').filter(i => i.type === 0 || i.type === 5 || i.type === 2)
      .forEach(i => drawItem({ ...i, status: 1 }, site, { muted: false, label: i.type !== 2 }));
    fitSite(map, 0.04);

    // open hazards, and ones resolved in the last week
    const shown = H.all().filter(o => H.isOpen(o) || dayDiff(dayOf(o.closedAt || o.createdAt), today()) <= 7);
    const perZone = {};
    const pins = L.layerGroup().addTo(map);
    shown.slice().reverse().forEach(o => {
      const k = o.zoneId || 'gps';
      perZone[k] = (perZone[k] || 0) + 1;
      const ll = position(o, perZone[k] - 1);
      if (!ll) return;
      L.marker(ll, { icon: pin(o), zIndexOffset: o.status === 'closed' ? 0 : o.severity === 'high' ? 300 : 100, keyboard: true, title: H.title(o) })
        .bindTooltip(`<b>${esc(H.title(o))}</b><br>${H.RISK[o.severity].label} · ${H.STATUS[o.status].label}`, { direction: 'top' })
        .on('click', () => openDetail(o.id, '#/sitemap'))
        .addTo(pins);
    });
  },
  unmount() { if (map) { map.remove(); map = null; } }
};
