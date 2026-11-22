// Statistics: hazard reports by risk level and by status for a chosen period.

import * as H from '../hazards.js';
import { today, addDays, dayOf } from '../util.js';
import { icon } from '../icons.js';
import { options } from '../ui.js';

const PERIODS = [['week', 'Last 7 Days'], ['month', 'This Month'], ['quarter', 'Last 3 Months'], ['all', 'All Time']];
let period = 'month';

function inPeriod(o) {
  const day = dayOf(o.createdAt);
  if (period === 'week') return day > addDays(today(), -7);
  if (period === 'month') return H.thisMonth(o);
  if (period === 'quarter') return day > addDays(today(), -91);
  return true;
}

function donut(parts, total) {
  const R = 52, C = 2 * Math.PI * R;
  let off = 0;
  const arcs = total ? parts.filter(p => p.value).map(p => {
    const len = p.value / total * C;
    const a = `<circle r="${R}" cx="70" cy="70" fill="none" stroke="${p.color}" stroke-width="22"
      stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 70 70)"/>`;
    off += len;
    return a;
  }).join('') : `<circle r="${R}" cx="70" cy="70" fill="none" stroke="#e3e8e4" stroke-width="22"/>`;
  return `<svg class="donut" viewBox="0 0 140 140" role="img" aria-label="${total} reports by risk level">${arcs}
    <text x="70" y="68" text-anchor="middle" class="d-num">${total}</text>
    <text x="70" y="85" text-anchor="middle" class="d-lbl">Total</text>
    <text x="70" y="99" text-anchor="middle" class="d-lbl">Reports</text></svg>`;
}

function bars(parts) {
  const max = Math.max(5, ...parts.map(p => p.value));
  const step = max <= 10 ? 2 : max <= 25 ? 5 : max <= 50 ? 10 : 20;
  let top = Math.ceil(max / step) * step;
  if (max > top - step * 0.25) top += step;   // room for the number above the tallest bar
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => top - i * step);
  return `<div class="bars">
    <div class="b-axis">${ticks.map(t => `<span>${t}</span>`).join('')}</div>
    <div class="b-plot">
      ${ticks.map((t, i) => `<i class="b-grid" style="top:${(i / (ticks.length - 1) * 100).toFixed(2)}%"></i>`).join('')}
      ${parts.map(p => `<div class="b-col"><div class="b-bar" style="height:${(p.value / top * 100).toFixed(2)}%;background:${p.color}"><b>${p.value}</b></div></div>`).join('')}
    </div>
    <div class="b-labels">${parts.map(p => `<span>${p.label}</span>`).join('')}</div>
  </div>`;
}

function html() {
  const list = H.all().filter(inPeriod);
  const total = list.length;
  const risk = ['high', 'medium', 'low'].map(k => ({ key: k, label: H.RISK[k].label, color: H.RISK[k].color, value: list.filter(o => o.severity === k).length }));
  const pct = v => (total ? Math.round(v / total * 100) : 0);
  const status = [
    { label: 'Resolved', color: '#43a047', value: list.filter(o => o.status === 'closed').length },
    { label: 'Open', color: '#e53935', value: list.filter(o => o.status === 'open').length },
    { label: 'In Progress', color: '#90a4ae', value: list.filter(o => o.status === 'progress').length }
  ];
  const cats = H.CATEGORIES.map(c => ({ c, n: list.filter(o => H.category(o).key === c.key).length })).filter(x => x.n).sort((a, b) => b.n - a.n).slice(0, 5);
  return `
    <section class="m-card pad-card">
      <div class="donut-row">
        ${donut(risk, total)}
        <ul class="d-legend">${risk.map(r => `<li><i style="background:${r.color}"></i><span>${r.label}</span><b>${r.value} (${pct(r.value)}%)</b></li>`).join('')}</ul>
      </div>
    </section>
    <section class="m-card pad-card">
      <h2 class="card-title">Reports by Status</h2>
      ${bars(status)}
    </section>
    ${cats.length ? `<section class="m-card pad-card">
      <h2 class="card-title">Top Categories</h2>
      <ul class="cat-bars">${cats.map(({ c, n }) => `<li><span class="cb-ic">${icon(c.icon)}</span><span class="cb-name">${c.label}</span>
        <span class="cb-track"><i style="width:${(n / cats[0].n * 100).toFixed(1)}%"></i></span><b>${n}</b></li>`).join('')}</ul>
    </section>` : ''}`;
}

export default {
  meta: { key: 'stats', label: 'Statistics', icon: 'chart-column' },
  render: () => `<label class="m-select">${icon('calendar-days')}
      <select data-change="stPeriod" aria-label="Period">${options(PERIODS, period)}</select></label>
    <div id="stBody">${html()}</div>`,
  update() { const el = document.getElementById('stBody'); if (el) el.innerHTML = html(); },
  changes: { stPeriod: (el, ctx) => { period = el.value; ctx.refresh(); } }
};
