// View Reports: every hazard report, searchable, with filters.

import * as H from '../hazards.js';
import { esc } from '../util.js';
import { icon } from '../icons.js';
import { openDialog, closeDialog, options } from '../ui.js';
import { openDetail } from './observations.js';
import { hydratePhotos } from '../photos.js';

const STATUS_KEYS = ['all', 'open', 'progress', 'closed'];
const filter = { status: 'all', q: '', risk: '', category: '' };

const matches = o => (filter.status === 'all' || o.status === filter.status)
  && (!filter.risk || o.severity === filter.risk)
  && (!filter.category || H.category(o).key === filter.category)
  && (!filter.q || `${H.title(o)} ${o.description} ${o.ref} ${H.where(o)} ${H.category(o).label}`.toLowerCase().includes(filter.q.toLowerCase()));

function listHtml() {
  const all = H.all();
  const base = all.filter(o => (!filter.risk || o.severity === filter.risk) && (!filter.category || H.category(o).key === filter.category));
  const n = s => base.filter(o => s === 'all' || o.status === s).length;
  const list = all.filter(matches);
  const chips = [['all', 'All'], ['open', 'Open'], ['progress', 'In Progress'], ['closed', 'Resolved']]
    .map(([k, label]) => `<button type="button" class="chip ${filter.status === k ? 'on' : ''}" data-act="hlStatus" data-key="${k}" aria-pressed="${filter.status === k}">${label} (${n(k)})</button>`).join('');
  const extra = [filter.risk && H.RISK[filter.risk].label, filter.category && H.CATEGORIES.find(c => c.key === filter.category).label].filter(Boolean);
  return `
    <div class="chips" role="group" aria-label="Status">${chips}</div>
    ${extra.length ? `<p class="m-filtered">Filtered: ${extra.map(esc).join(', ')} <button type="button" class="link-btn" data-act="hlClear">Clear</button></p>` : ''}
    <div class="m-card list">${list.length ? list.map(o => H.row(o)).join('') : '<p class="m-empty">No reports match.</p>'}</div>
    ${list.length ? `<p class="m-foot">${list.length} of ${all.length} reports</p>` : ''}`;
}

export default {
  meta: { key: 'hazards', label: 'View Reports', icon: 'clipboard-list' },
  header: () => ({
    title: 'View Reports',
    actions: `<button type="button" class="hd-btn ${filter.risk || filter.category ? 'on' : ''}" data-act="hlFilter" aria-label="Filter reports">${icon('funnel')}</button>`
  }),

  render: ctx => {
    const p = ctx.route.params[0];
    if (STATUS_KEYS.includes(p)) filter.status = p;
    return `<label class="m-search">${icon('search')}<input type="search" placeholder="Search reports..." value="${esc(filter.q)}" data-change="hlSearch" data-live aria-label="Search reports"></label>
      <div id="hlList">${listHtml()}</div>`;
  },
  update() { const el = document.getElementById('hlList'); if (el) { el.innerHTML = listHtml(); hydratePhotos(el); } },
  mount(ctx) {
    const p = ctx.route.params[0];
    if (p && !STATUS_KEYS.includes(p)) {
      history.replaceState(null, '', '#/hazards');
      openDetail(p, '#/hazards');
    }
  },

  actions: {
    openHazard: el => openDetail(el.dataset.id, location.hash),
    hlStatus: (el, ctx) => { filter.status = el.dataset.key; history.replaceState(null, '', `#/hazards/${filter.status}`); ctx.refresh(); },
    hlClear: (el, ctx) => { filter.risk = ''; filter.category = ''; ctx.refresh(); },
    hlFilter() {
      openDialog({
        title: 'Filter reports',
        body: `<form id="hlFilterForm" data-submit="hlFilterSave" class="m-form" novalidate>
          <label class="m-field"><span>Risk Level</span><select name="risk">${options([['high', 'High'], ['medium', 'Medium'], ['low', 'Low']], filter.risk, { blank: 'Any risk' })}</select></label>
          <label class="m-field"><span>Category</span><select name="category">${options(H.CATEGORIES.map(c => [c.key, c.label]), filter.category, { blank: 'Any category' })}</select></label>
        </form>`,
        footer: `<button type="button" class="btn ghost" data-act="hlClearClose">Clear</button>
          <button type="submit" class="btn primary" form="hlFilterForm">Show reports</button>`
      });
    },
    hlClearClose: (el, ctx) => { filter.risk = ''; filter.category = ''; closeDialog(); ctx.refresh(); }
  },
  changes: {
    hlSearch(el) {
      filter.q = el.value;
      const box = document.getElementById('hlList');
      box.innerHTML = listHtml();
      hydratePhotos(box);
    }
  },
  submits: {
    hlFilterSave(form, v, btn, ctx) { filter.risk = v.risk; filter.category = v.category; closeDialog(); ctx.refresh(); }
  }
};
