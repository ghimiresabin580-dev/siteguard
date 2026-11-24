// Dashboard: totals and the latest hazard reports.

import * as H from '../hazards.js';
import { icon } from '../icons.js';

function html() {
  const list = H.all();
  const open = list.filter(o => o.status === 'open').length;
  const resolved = list.filter(o => o.status === 'closed').length;
  const month = list.filter(H.thisMonth).length;
  const stat = (ic, tone, value, label, href, sub = '') => `
    <a class="m-card stat st-${tone}" href="${href}">
      <span class="stat-ic ${tone}">${icon(ic)}</span>
      <b class="${typeof value === 'string' ? 'word' : ''}">${value}</b><small>${label}</small>${sub ? `<em>${sub}</em>` : ''}
    </a>`;
  const recent = list.slice(0, 5);
  return `
    <div class="stat-grid">
      ${stat('file-text', 'blue', list.length, 'Total Reports', '#/hazards/all')}
      ${stat('triangle-exclamation-point', 'amber', open, 'Open', '#/hazards/open')}
      ${stat('circle-check', 'green', resolved, 'Resolved', '#/hazards/closed')}
      ${stat('calendar-days', 'purple', month, 'This Month', '#/stats')}
    </div>
    <div class="m-head"><h2>Recent Reports</h2><a href="#/hazards">View All</a></div>
    <div class="m-card list">${recent.length ? recent.map(o => H.row(o, { status: false, place: false })).join('')
      : '<p class="m-empty">No hazards reported yet.</p>'}</div>`;
}

export default {
  meta: { key: 'overview', label: 'Dashboard', icon: 'chart-column' },
  render: () => `<div id="ovBody">${html()}</div>`,
  update() { const el = document.getElementById('ovBody'); if (el) el.innerHTML = html(); }
};
