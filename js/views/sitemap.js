// Site map: zones, gates, fences and routes with their check status, plus exclusion zones
// that leads can draw straight on the map.

import * as store from '../store.js';
import { can } from '../auth.js';
import { esc, today, timeAgo, fmtDay, fmtDayShort, nowIso, addDays } from '../util.js';
import { icon } from '../icons.js';
import { toast, openDialog, closeDialog, confirmBox, badge, field, tabs, emptyState } from '../ui.js';
import { ITEM_TYPES, CHECK_STATUS } from '../domain.js';
import { createMap, drawItem, drawZone, fitSite, addLocateButton, startDrawing, mapsAvailable } from '../maps.js';
import observations from './observations.js';

let map = null, group = null, drawing = null, pending = null;
const ui = { tab: 'items', selected: null };

const statusBadge = i => badge(CHECK_STATUS[i.status].label, CHECK_STATUS[i.status].tone === 'ok' ? 'ok-soft' : CHECK_STATUS[i.status].tone === 'danger' ? 'danger-soft' : 'neutral');
const zoneState = z => z.endedAt || z.to < today() ? 'ended' : z.from > today() ? 'upcoming' : 'active';

function side() {
  const items = store.all('items');
  const zones = store.all('exclusionZones');
  const sel = items.find(i => i.id === ui.selected);
  const activeZones = zones.filter(z => zoneState(z) === 'active');
  let content;
  if (ui.tab === 'items') {
    content = `${sel ? `<div class="sel-card">
        <div class="sel-head"><div><b>${esc(sel.name)}</b><small>${ITEM_TYPES[sel.type]}</small></div>${statusBadge(sel)}</div>
        <p class="muted small">Last checked ${sel.lastCheckedAt ? `${timeAgo(sel.lastCheckedAt)} by ${esc(sel.lastCheckedBy || '')}` : 'never'}</p>
        ${can('check.do') ? `<div class="btn-row">
          <button type="button" class="btn ok sm" data-act="mapMark" data-id="${sel.id}" data-result="1">${icon('check')}OK</button>
          <button type="button" class="btn danger sm" data-act="mapMark" data-id="${sel.id}" data-result="2">${icon('triangle-exclamation-point')}Problem</button>
        </div>` : ''}
        ${can('obs.create') ? `<button type="button" class="link-btn" data-act="mapObs" data-id="${sel.id}">${icon('footprints')}Raise an observation here</button>` : ''}
      </div>` : '<p class="muted small pad-x">Tap something on the map, or pick it from the list.</p>'}
      <ul class="item-list">${items.map(i => `
        <li><button type="button" class="${i.id === ui.selected ? 'on' : ''}" data-act="mapSelect" data-id="${i.id}">
          <i class="dot s${i.status}" aria-hidden="true"></i><span>${esc(i.name)}<small>${ITEM_TYPES[i.type]}</small></span>${statusBadge(i)}</button></li>`).join('')}</ul>`;
  } else {
    const groupHtml = (title, list) => list.length ? `<h3 class="sub-head pad-x">${title}</h3><ul class="zone-list">${list.map(z => `
      <li class="${zoneState(z)}"><span class="ez-swatch" aria-hidden="true"></span>
        <div><b>${esc(z.name)}</b><span>${esc(z.reason)}</span><small>${fmtDayShort(z.from)} to ${fmtDayShort(z.to)}, set by ${esc(z.createdBy)}</small>
        ${can('zone.edit') && zoneState(z) !== 'ended' ? `<span class="btn-row"><button type="button" class="link-btn" data-act="mapZoneShow" data-id="${z.id}">Show</button>
          <button type="button" class="link-btn" data-act="mapZoneEnd" data-id="${z.id}">End zone</button></span>` : ''}</div></li>`).join('')}</ul>` : '';
    content = `${can('zone.edit') ? `<div class="pad-x"><button type="button" class="btn primary block" data-act="mapDraw" ${drawing ? 'disabled' : ''}>${icon('pencil')}Draw an exclusion zone</button></div>` : ''}
      ${groupHtml('Active', activeZones)}${groupHtml('Coming up', zones.filter(z => zoneState(z) === 'upcoming'))}
      ${groupHtml('Ended', zones.filter(z => zoneState(z) === 'ended').slice(0, 8))}
      ${!zones.length ? emptyState('construction', 'No exclusion zones', 'Draw one around lifts, excavations or anything people must keep out of.') : ''}`;
  }
  return `${tabs([['items', 'Site items', items.length], ['zones', 'Exclusion zones', activeZones.length]], ui.tab, 'mapTab')}<div class="side-scroll">${content}</div>`;
}

function stats() {
  const items = store.all('items');
  const n = s => items.filter(i => i.status === s).length;
  return `<span><i class="dot s1"></i>${n(1)} OK</span><span><i class="dot s0"></i>${n(0)} not checked</span><span><i class="dot s2"></i>${n(2)} problem</span>
    <span><i class="ez-swatch sm"></i>Exclusion zone</span><span><i class="dash"></i>Lift area</span>`;
}

function draw(fit = false) {
  if (!map) return;
  group.clearLayers();
  store.all('items').forEach(i => drawItem(i, group, { selected: i.id === ui.selected, onClick: it => select(it.id, false) }));
  store.all('exclusionZones').filter(z => zoneState(z) === 'active').forEach(z => drawZone(z, group, {
    onClick: zone => { ui.tab = 'zones'; refreshSide(); toast(`${zone.name}: ${zone.reason}`); }
  }));
  if (fit) fitSite(map);
}

function refreshSide() {
  const el = document.getElementById('mapSide');
  if (el) el.innerHTML = side();
  const st = document.getElementById('mapStats');
  if (st) st.innerHTML = stats();
}

function select(id, fly) {
  ui.selected = id;
  ui.tab = 'items';
  refreshSide();
  draw();
  const it = store.get('items', id);
  if (fly && map && it) map.flyToBounds(L.latLngBounds(it.shape), { maxZoom: 19, padding: [60, 60], duration: 0.5 });
}

function drawBar(points) {
  const bar = document.getElementById('drawBar');
  if (!bar) return;
  bar.hidden = !drawing;
  bar.querySelector('[data-act="mapDrawFinish"]').disabled = points < 3;
  bar.querySelector('.draw-count').textContent = points < 3 ? `Click the map to add corners (${points} of at least 3)` : `${points} corners. Finish when the outline is right.`;
}

export default {
  meta: { key: 'map', label: 'Site map', icon: 'map' },

  header: () => ({
    title: 'Site map',
    sub: `${store.settings().siteName}: zones, routes, gates and exclusion zones`,
    actions: can('check.do') ? `<a class="btn ghost" href="#/inspections">${icon('clipboard-check')}<span>Daily site walk</span></a>` : ''
  }),

  render: () => `
    <div class="map-page">
      <div class="map-main">
        <div id="siteMap" class="map-box tall">${mapsAvailable() ? '' : '<p class="muted pad">The map library did not load. Check the connection and reload.</p>'}</div>
        <div id="drawBar" class="draw-bar" hidden>
          <span class="draw-count"></span>
          <button type="button" class="btn ghost sm" data-act="mapDrawUndo">Undo</button>
          <button type="button" class="btn ghost sm" data-act="mapDrawCancel">Cancel</button>
          <button type="button" class="btn primary sm" data-act="mapDrawFinish" disabled>Finish</button>
        </div>
        <div class="legend" id="mapStats">${stats()}</div>
      </div>
      <aside class="map-side panel" id="mapSide">${side()}</aside>
    </div>`,

  mount(ctx) {
    if (!mapsAvailable()) return;
    map = createMap(document.getElementById('siteMap'));
    group = L.layerGroup().addTo(map);
    addLocateButton(map, msg => toast(msg, 'err'));
    draw(true);
    const id = ctx.route.params[0];
    if (id && store.get('items', id)) select(id, true);
  },

  update() { refreshSide(); draw(); },

  unmount() {
    if (drawing) { drawing.cancel(); drawing = null; }
    if (map) { map.remove(); map = null; group = null; }
  },

  actions: {
    mapTab: el => { ui.tab = el.dataset.key; refreshSide(); },
    mapSelect: el => select(el.dataset.id, true),
    mapObs: (el, ctx) => observations.openForm(ctx, { zoneId: el.dataset.id }),
    mapMark(el, ctx) {
      const result = +el.dataset.result;
      const it = store.get('items', el.dataset.id);
      store.update('items', it.id, { status: result, lastCheckedAt: nowIso(), lastCheckedBy: ctx.user.name });
      store.insert('checks', { itemId: it.id, result, at: nowIso(), by: ctx.user.name, note: '', photo: null });
      toast(result === 1 ? `${it.name} marked OK.` : `Problem recorded at ${it.name}. Raise an observation so it gets sorted.`, result === 1 ? 'ok' : 'info');
      if (result === 2 && can('obs.create')) observations.openForm(ctx, { zoneId: it.id, type: 'hazard' });
      refreshSide(); draw();
    },
    mapDraw() {
      if (!map) return;
      ui.selected = null;
      drawing = startDrawing(map, drawBar);
      drawBar(0);
      refreshSide();
      toast('Click the map to outline the exclusion zone.');
    },
    mapDrawUndo: () => drawing?.undo(),
    mapDrawCancel() { drawing?.cancel(); drawing = null; drawBar(0); refreshSide(); },
    mapDrawFinish() {
      if (!drawing) return;
      pending = drawing.finish();
      drawing = null;
      drawBar(0);
      openDialog({
        title: 'New exclusion zone',
        body: `<form id="ezForm" data-submit="mapZoneSave" novalidate>
          ${field('Name', '<input name="name" required maxlength="60" placeholder="For example: crane slew area, gridline 4">')}
          ${field('Why people must keep out', '<textarea name="reason" rows="2" required maxlength="240" placeholder="Who may enter, and on what conditions"></textarea>')}
          <div class="grid-2">
            ${field('From', `<input type="date" name="from" required value="${today()}">`)}
            ${field('Until', `<input type="date" name="to" required value="${addDays(today(), 2)}">`)}
          </div></form>`,
        footer: `<button type="button" class="btn ghost" data-act="closeDialog">Discard</button><button class="btn primary" type="submit" form="ezForm">Save zone</button>`,
        onClose: () => { pending = null; refreshSide(); }
      });
    },
    mapZoneShow(el) {
      const z = store.get('exclusionZones', el.dataset.id);
      if (map && z) map.flyToBounds(L.latLngBounds(z.shape), { maxZoom: 19, padding: [60, 60], duration: 0.5 });
    },
    async mapZoneEnd(el, ctx) {
      const z = store.get('exclusionZones', el.dataset.id);
      if (!(await confirmBox({ title: `End “${z.name}”?`, text: 'The zone comes off the map and the morning meeting. Make sure the barriers are down.', ok: 'End zone' }))) return;
      store.update('exclusionZones', z.id, { endedAt: nowIso(), endedBy: ctx.user.name });
      store.audit(ctx.user, 'Ended exclusion zone', z.name);
      toast(`${z.name} ended.`, 'ok');
      refreshSide(); draw();
    }
  },

  submits: {
    mapZoneSave(form, v, btn, ctx) {
      if (v.to < v.from) return toast('The end date is before the start date.', 'err');
      const shape = pending;
      if (!shape || shape.length < 3) return toast('The outline needs at least three corners.', 'err');
      const z = store.insert('exclusionZones', { name: v.name, reason: v.reason, from: v.from, to: v.to, shape, createdBy: ctx.user.name });
      store.audit(ctx.user, 'Added exclusion zone', z.name);
      pending = null;
      closeDialog();
      ui.tab = 'zones';
      toast(`${z.name} added to the map and the morning meeting.`, 'ok');
      refreshSide(); draw();
    }
  }
};
