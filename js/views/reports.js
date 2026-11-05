// Weekly report: observations, TR index, hotspots on the map and what is still open.

import * as store from '../store.js';
import { can } from '../auth.js';
import { esc, today, addDays, weekStart, isoWeek, fmtDayShort, fmtDayYear, dayOf, daysUntil, daysLeftText, plural, toCSV, download } from '../util.js';
import { icon } from '../icons.js';
import { toast, badge, zoneName, contractorTag, emptyState, busy } from '../ui.js';
import { OBS_TYPES, obsType, SEVERITY, TR_AREAS, trIndex, PERMIT_TYPES } from '../domain.js';
import { lineChart, columnChart, barList } from '../charts.js';
import { createMap, drawItem, fitSite, mapsAvailable } from '../maps.js';
import * as D from '../derive.js';
import { sendEmail, describe } from '../mail.js';

const ui = { from: null };
let map = null;

const range = () => { ui.from ||= weekStart(today()); return [ui.from, addDays(ui.from, 6)]; };
const inWeek = (iso, from, to) => { const d = dayOf(iso); return d >= from && d <= to; };

function data() {
  const [from, to] = range();
  const obs = store.all('observations').filter(o => inWeek(o.createdAt, from, to));
  const hot = {};
  obs.filter(o => o.zoneId && o.type !== 'good').forEach(o => {
    const h = hot[o.zoneId] ||= { zoneId: o.zoneId, name: zoneName(o.zoneId), count: 0, high: 0 };
    h.count++; if (o.severity === 'high') h.high++;
  });
  const tr = store.all('tr').filter(t => t.day >= from && t.day <= to).sort((a, b) => b.day.localeCompare(a.day))[0] || null;
  return {
    from, to, obs,
    high: obs.filter(o => o.severity === 'high' && o.type !== 'good'),
    nearMiss: obs.filter(o => o.type === 'near-miss'),
    good: obs.filter(o => o.type === 'good'),
    closed: obs.filter(o => o.status === 'closed'),
    hotspots: Object.values(hot).sort((a, b) => b.count - a.count),
    tr,
    checks: store.all('checks').filter(c => inWeek(c.at, from, to)).length,
    lifts: store.all('lifts').filter(l => inWeek(l.at, from, to)).length,
    permits: store.all('permits').filter(p => p.approvedAt && inWeek(p.approvedAt, from, to) && p.status !== 'rejected').length,
    deliveries: store.all('deliveries').filter(d => d.day >= from && d.day <= to && d.status !== 'cancelled').length,
    plant: store.all('equipment').filter(e => D.equipmentState(e).state !== 'ok').sort((a, b) => a.validUntil.localeCompare(b.validUntil)),
    cards: store.all('people').flatMap(p => ['safetyCard', 'hotWorkCard', 'firstAid', 'electrical'].filter(k => p[k] && daysUntil(p[k]) <= store.settings().warnDays).map(k => ({ p, k, left: daysUntil(p[k]) }))),
    openHigh: D.openObservations().filter(o => o.severity === 'high')
  };
}

const CARD = { safetyCard: 'Safety card', hotWorkCard: 'Hot work card', firstAid: 'First aid', electrical: 'SFS 6002' };

function body() {
  const r = data();
  const weeks = Array.from({ length: 8 }, (_, i) => addDays(r.from, -7 * (7 - i)));
  const perWeek = weeks.map(w => ({
    label: `W${isoWeek(w)}`,
    value: store.all('observations').filter(o => inWeek(o.createdAt, w, addDays(w, 6))).length,
    tip: `Week ${isoWeek(w)}: ${store.all('observations').filter(o => inWeek(o.createdAt, w, addDays(w, 6))).length} observations`
  }));
  const trPoints = store.all('tr').filter(t => t.day <= r.to).sort((a, b) => a.day.localeCompare(b.day)).slice(-8)
    .map(t => ({ label: `W${isoWeek(t.day)}`, value: trIndex(t.scores), tip: `Week ${isoWeek(t.day)}: ${trIndex(t.scores)} %` }));
  const byType = OBS_TYPES.map(t => ({ label: t.label, value: r.obs.filter(o => o.type === t.key).length }));
  const figure = (value, label, note = '', tone = '') => `<div class="figure ${tone}"><b>${value}</b><span>${label}</span>${note ? `<small>${note}</small>` : ''}</div>`;

  return `
    <section class="figures" aria-label="This week in numbers">
      ${figure(r.obs.length, 'observations', `${r.closed.length} closed`)}
      ${figure(r.high.length, 'high severity', r.high.length ? 'see below' : 'none', r.high.length ? 'danger' : '')}
      ${figure(r.nearMiss.length, 'near misses')}
      ${figure(r.tr ? `${trIndex(r.tr.scores)} %` : '–', 'TR index', r.tr ? `by ${esc(r.tr.by)}` : 'not measured', r.tr && trIndex(r.tr.scores) < 90 ? 'warn' : '')}
      ${figure(r.checks, 'site checks')}
      ${figure(r.lifts, 'lifts recorded')}
      ${figure(r.permits, 'permits issued')}
      ${figure(r.deliveries, 'deliveries')}
    </section>

    <div class="report-grid">
      <section class="panel"><header class="panel-head"><h2>Observations per week</h2></header>
        <div class="panel-body">${columnChart({ bars: perWeek, label: 'Observations raised per week, last 8 weeks' })}</div></section>
      <section class="panel"><header class="panel-head"><h2>TR index</h2><span class="muted small">Target 90 %</span></header>
        <div class="panel-body">${trPoints.length ? lineChart({ points: trPoints, target: 90, min: 60, max: 100, unit: ' %', label: 'TR index by week' }) : '<p class="muted">No measurements yet.</p>'}</div></section>
      <section class="panel"><header class="panel-head"><h2>This week by type</h2></header>
        <div class="panel-body">${r.obs.length ? barList(byType) : '<p class="muted">No observations this week.</p>'}</div></section>
      <section class="panel"><header class="panel-head"><h2>Where things were found</h2></header>
        ${r.hotspots.length ? `<div id="heatMap" class="map-box short"></div>
          <ul class="hot-list">${r.hotspots.map(h => `<li><span>${esc(h.name)}</span><b>${h.count}</b>${h.high ? badge(`${h.high} high`, 'danger-soft') : ''}</li>`).join('')}</ul>`
          : '<p class="panel-body muted">No observations linked to a place this week.</p>'}</section>
    </div>

    <div class="report-grid">
      <section class="panel"><header class="panel-head"><h2>High severity this week</h2></header>
        ${r.high.length ? `<ul class="plain-list">${r.high.map(o => `<li><a href="#/observations/${o.id}">${o.ref}</a> ${esc(obsType(o.type).label)} at ${esc(zoneName(o.zoneId) || 'site')}: ${esc(o.description)} ${badge(o.status === 'closed' ? 'Closed' : 'Open', o.status === 'closed' ? 'ok-soft' : 'danger-soft')}</li>`).join('')}</ul>`
          : '<p class="panel-body muted">None this week.</p>'}</section>
      <section class="panel"><header class="panel-head"><h2>Inspections and cards running out</h2></header>
        ${r.plant.length || r.cards.length ? `<ul class="plain-list">
          ${r.plant.map(e => `<li>${icon('forklift')}<span><b>${esc(e.reg)}</b> ${esc(e.name)}: ${daysLeftText(daysUntil(e.validUntil))}</span></li>`).join('')}
          ${r.cards.map(({ p, k, left }) => `<li>${icon('id-card')}<span><b>${esc(p.name)}</b> ${CARD[k]}: ${daysLeftText(left)}</span></li>`).join('')}</ul>`
          : '<p class="panel-body muted">Nothing due in the next two weeks.</p>'}</section>
    </div>`;
}

function drawHeat() {
  if (map) { map.remove(); map = null; }
  const el = document.getElementById('heatMap');
  if (!el || !mapsAvailable()) return;
  map = createMap(el, { interactive: true });
  const g = L.layerGroup().addTo(map);
  store.all('items').forEach(i => drawItem(i, g, { muted: true, label: false }));
  const hot = data().hotspots;
  const max = Math.max(1, ...hot.map(h => h.count));
  hot.forEach(h => {
    const it = store.get('items', h.zoneId);
    if (!it) return;
    L.circleMarker(L.latLngBounds(it.shape).getCenter(), { radius: 9 + 16 * h.count / max, color: '#ffffff', weight: 2, fillColor: '#c8102e', fillOpacity: 0.75 })
      .bindTooltip(`${h.count}`, { permanent: true, direction: 'center', className: 'heat-label' })
      .bindPopup(`<b>${esc(h.name)}</b><br>${plural(h.count, 'observation')}`).addTo(g);
  });
  fitSite(map, 0.02);
}

function emailFields(r) {
  const s = store.settings();
  const f = {
    Week: `${isoWeek(r.from)} (${fmtDayShort(r.from)} to ${fmtDayYear(r.to)})`, Site: `${s.siteName}, ${s.project}`,
    Observations: `${r.obs.length} raised, ${r.closed.length} closed, ${r.high.length} high, ${r.nearMiss.length} near misses, ${r.good.length} good practice`,
    'TR index': r.tr ? `${trIndex(r.tr.scores)} % (target 90 %)` : 'Not measured this week',
    Activity: `${r.checks} site checks, ${r.lifts} lifts, ${r.permits} permits issued, ${r.deliveries} deliveries`
  };
  if (r.hotspots.length) f.Hotspots = r.hotspots.slice(0, 3).map(h => `${h.name} (${h.count})`).join(', ');
  r.openHigh.forEach(o => { f[`Open: ${o.ref}`] = `${obsType(o.type).label} at ${zoneName(o.zoneId) || 'site'}: ${o.description}`; });
  r.plant.forEach(e => { f[`Plant ${e.reg}`] = `${e.name}: ${daysLeftText(daysUntil(e.validUntil))}`; });
  r.cards.forEach(({ p, k, left }) => { f[`${CARD[k]}: ${p.name}`] = daysLeftText(left); });
  return f;
}

export default {
  meta: { key: 'reports', hideFor: ['worker'], label: 'Weekly report', icon: 'chart-column' },

  header: () => {
    const [from, to] = range();
    return {
      title: `Weekly report, week ${isoWeek(from)}`,
      sub: `${fmtDayShort(from)} to ${fmtDayYear(to)}`,
      actions: `<div class="day-nav">
          <button type="button" class="icon-btn" data-act="repShift" data-n="-7" aria-label="Previous week">${icon('chevron-left')}</button>
          ${from !== weekStart(today()) ? '<button type="button" class="btn ghost sm" data-act="repShift" data-n="0">This week</button>' : ''}
          <button type="button" class="icon-btn" data-act="repShift" data-n="7" aria-label="Next week" ${from >= weekStart(today()) ? 'disabled' : ''}>${icon('chevron-right')}</button></div>
        <button type="button" class="btn ghost" data-act="repCsv">${icon('download')}<span>CSV</span></button>
        <button type="button" class="btn ghost" data-act="print">${icon('printer')}<span>Print</span></button>
        ${can('report.send') ? `<button type="button" class="btn primary" data-act="repEmail">${icon('mail')}<span>Email report</span></button>` : ''}`
    };
  },

  render: () => `<div id="repBody">${body()}</div>`,
  mount() { drawHeat(); },
  unmount() { if (map) { map.remove(); map = null; } },

  actions: {
    repShift(el, ctx) {
      const n = +el.dataset.n;
      ui.from = n === 0 ? weekStart(today()) : addDays(range()[0], n);
      ctx.refresh();
    },
    async repEmail(el, ctx) {
      const r = data();
      const res = await busy(el, () => sendEmail({ event: 'manual', subject: `Weekly safety report, week ${isoWeek(r.from)}: ${store.settings().siteName}`, fields: emailFields(r), link: '#/reports', user: ctx.user }), 'Sending…');
      toast(describe(res), res.status === 'sent' ? 'ok' : res.status === 'failed' ? 'err' : 'info', 7000);
    },
    repCsv() {
      const r = data();
      download(`siteguard-week-${isoWeek(r.from)}.csv`, toCSV([['Ref', 'Raised', 'Type', 'Severity', 'Where', 'Description', 'Status', 'Raised by'],
        ...r.obs.map(o => [o.ref, dayOf(o.createdAt), obsType(o.type).label, o.type === 'good' ? '' : SEVERITY[o.severity].label, zoneName(o.zoneId), o.description, o.status, o.reportedBy])]), 'text/csv');
    }
  }
};
