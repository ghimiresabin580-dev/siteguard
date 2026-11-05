// Look-ahead: two weeks of planned work per company, with the hazards, SPA and permits behind each activity.

import * as store from '../store.js';
import { can } from '../auth.js';
import { esc, today, addDays, weekStart, dayDiff, fmtDay, fmtDayShort, isWeekend, parseDay, isoWeek, plural } from '../util.js';
import { icon } from '../icons.js';
import { toast, openDialog, closeDialog, confirmBox, badge, contractorTag, contractorOptions, zoneOptions, zoneName, field, options, emptyState } from '../ui.js';
import { HAZARDS, hazard, ACTIVITY_STATUS, PERMIT_TYPES, PERMIT_STATUS } from '../domain.js';
import * as D from '../derive.js';

const DAYS = 14;
const ui = { from: null, company: '' };

function range() {
  ui.from ||= weekStart(today());
  return [ui.from, addDays(ui.from, DAYS - 1)];
}

function gantt() {
  const [from, to] = range();
  const acts = store.all('activities')
    .filter(a => a.end >= from && a.start <= to && (!ui.company || a.contractorId === ui.company))
    .sort((a, b) => a.start.localeCompare(b.start));
  if (!acts.length) return emptyState('chart-gantt', 'Nothing planned in these two weeks', can('activity.edit') ? 'Add the first activity so it shows in the morning meeting.' : '');
  const days = Array.from({ length: DAYS }, (_, i) => addDays(from, i));
  const T = today();
  const byCompany = store.all('contractors').map(c => [c, acts.filter(a => a.contractorId === c.id)]).filter(([, list]) => list.length);
  const todayPos = days.indexOf(T);
  const head = `<div class="g-row g-head">
      <div class="g-label">Activity</div>
      <div class="g-track">${days.map(d => `<span class="g-day ${isWeekend(d) ? 'we' : ''} ${d === T ? 'today' : ''}">
        <small>${parseDay(d).toLocaleDateString('en-GB', { weekday: 'short' })}</small>${parseDay(d).getDate()}</span>`).join('')}</div></div>`;
  const row = a => {
    const s = Math.max(0, dayDiff(from, a.start)), e = Math.min(DAYS - 1, dayDiff(from, a.end));
    const left = (100 * s) / DAYS, width = (100 * (e - s + 1)) / DAYS;
    const c = D.contractor(a.contractorId);
    const spa = D.spaForActivity(a.id);
    const cutL = a.start < from, cutR = a.end > to;
    return `<div class="g-row" data-act="laOpen" data-id="${a.id}" tabindex="0" role="button" aria-label="${esc(a.ref + ' ' + a.title)}">
      <div class="g-label"><span class="g-ref">${a.ref}</span><b>${esc(a.title)}</b><small>${esc(zoneName(a.zoneId))}</small></div>
      <div class="g-track">${days.map(d => `<span class="g-cell ${isWeekend(d) ? 'we' : ''}"></span>`).join('')}
        <span class="g-bar ${a.status} ${cutL ? 'cut-l' : ''} ${cutR ? 'cut-r' : ''}" style="left:${left}%;width:${width}%;--c:${c?.color || '#666'}" data-tip="${esc(`${a.ref}: ${fmtDayShort(a.start)} to ${fmtDayShort(a.end)}, ${ACTIVITY_STATUS[a.status].label.toLowerCase()}`)}">
          <span>${a.hazards.slice(0, 3).map(k => icon(hazard(k).icon)).join('')}${spa || a.status === 'done' ? '' : '<em>No SPA</em>'}</span></span>
      </div></div>`;
  };
  return `<div class="gantt" style="--today:${todayPos}">
    ${head}
    ${byCompany.map(([c, list]) => `<div class="g-group"><span class="ctag"><i style="--c:${c.color}"></i>${esc(c.name)}</span><small>${plural(list.length, 'activity', 'activities')}</small></div>${list.map(row).join('')}`).join('')}
    ${todayPos >= 0 ? `<span class="g-now" style="--col:${todayPos}" aria-hidden="true"></span>` : ''}
  </div>`;
}

function form(a = {}) {
  return `<form id="actForm" data-submit="laSave" data-id="${a.id || ''}" novalidate>
    ${field('What is the work?', `<input name="title" required maxlength="80" value="${esc(a.title || '')}" placeholder="For example: steel frame erection, level 3">`)}
    <div class="grid-2">
      ${field('Company', `<select name="contractorId" required>${contractorOptions(a.contractorId)}</select>`)}
      ${field('Where', `<select name="zoneId" required>${zoneOptions(a.zoneId)}</select>`)}
    </div>
    <div class="grid-3">
      ${field('Starts', `<input type="date" name="start" required value="${a.start || today()}">`)}
      ${field('Ends', `<input type="date" name="end" required value="${a.end || addDays(today(), 2)}">`)}
      ${field('Crew size', `<input type="number" name="crew" min="1" max="99" required value="${a.crew || 2}">`)}
    </div>
    <fieldset class="field"><legend class="field-label">Main hazards</legend>
      <div class="chips">${HAZARDS.map(h => `<label class="chip-check"><input type="checkbox" name="hazards" value="${h.key}" ${(a.hazards || []).includes(h.key) ? 'checked' : ''}>
        <span>${icon(h.icon)}${esc(h.label)}</span></label>`).join('')}</div></fieldset>
    ${a.id ? field('Status', `<select name="status">${options(Object.entries(ACTIVITY_STATUS).map(([k, v]) => [k, v.label]), a.status)}</select>`) : ''}
    ${field('Notes (optional)', `<textarea name="notes" rows="2" maxlength="400">${esc(a.notes || '')}</textarea>`)}
  </form>`;
}

function openDetail(id) {
  const a = store.get('activities', id);
  if (!a) return;
  const spa = D.spaForActivity(a.id);
  const permits = D.permitsFor(a.id);
  const edit = can('activity.edit');
  openDialog({
    title: a.title, label: a.ref, panel: true,
    body: `<div class="detail-top">${badge(ACTIVITY_STATUS[a.status].label, ACTIVITY_STATUS[a.status].tone)}</div>
      <dl class="facts cols">
        <div><dt>Company</dt><dd>${contractorTag(a.contractorId)}</dd></div>
        <div><dt>Where</dt><dd>${esc(zoneName(a.zoneId))}</dd></div>
        <div><dt>When</dt><dd>${fmtDay(a.start)} to ${fmtDay(a.end)}</dd></div>
        <div><dt>Crew</dt><dd>${plural(a.crew, 'person', 'people')}</dd></div>
      </dl>
      <h3 class="sub-head">Hazards</h3>
      <p class="hz-tags">${a.hazards.length ? a.hazards.map(k => `<span class="tag">${icon(hazard(k).icon)}${esc(hazard(k).label)}</span>`).join('') : '<span class="muted">None listed</span>'}</p>
      <h3 class="sub-head">Safe plan of action</h3>
      ${spa ? `<p><a href="#/spa/${spa.id}" data-act="closeDialog">${spa.ref}</a>, ${plural(D.signaturesOn(spa).length, 'signature')} today</p>`
        : `<p class="muted">No SPA yet. The crew cannot start without one.</p>${can('spa.edit') ? `<a class="btn ghost sm" href="#/spa/new/${a.id}">${icon('plus')}Write the SPA</a>` : ''}`}
      <h3 class="sub-head">Permits</h3>
      ${permits.length ? `<ul class="plain">${permits.map(p => `<li><a href="#/permits/${p.id}">${p.ref}</a> ${PERMIT_TYPES[p.type].label}, ${badge(PERMIT_STATUS[D.permitState(p)].label, PERMIT_STATUS[D.permitState(p)].tone)}</li>`).join('')}</ul>`
        : `<p class="muted">No permits linked.</p>`}
      ${can('permit.request') ? `<a class="btn ghost sm" href="#/permits/new/${a.id}">${icon('file-check')}Request a permit</a>` : ''}
      ${a.notes ? `<h3 class="sub-head">Notes</h3><p>${esc(a.notes)}</p>` : ''}
      ${edit ? `<div class="detail-actions"><button type="button" class="btn ghost" data-act="laEdit" data-id="${a.id}">${icon('pencil')}Edit</button>
        ${can('meeting.run') ? `<button type="button" class="btn danger-ghost" data-act="laDelete" data-id="${a.id}">${icon('trash')}Delete</button>` : ''}</div>` : ''}`
  });
}

export default {
  meta: { key: 'lookahead', label: 'Look ahead', icon: 'chart-gantt' },

  header: () => {
    const [from, to] = range();
    return {
      title: 'Look ahead',
      sub: `Weeks ${isoWeek(from)} and ${isoWeek(to)}: ${fmtDayShort(from)} to ${fmtDayShort(to)}`,
      actions: `<div class="day-nav">
          <button type="button" class="icon-btn" data-act="laShift" data-n="-7" aria-label="Previous week">${icon('chevron-left')}</button>
          <button type="button" class="btn ghost sm" data-act="laShift" data-n="0">This week</button>
          <button type="button" class="icon-btn" data-act="laShift" data-n="7" aria-label="Next week">${icon('chevron-right')}</button></div>
        <select data-change="laCompany" aria-label="Company">${contractorOptions(ui.company, 'All companies')}</select>
        ${can('activity.edit') ? `<button type="button" class="btn primary" data-act="laNew">${icon('plus')}<span>Add activity</span></button>` : ''}`
    };
  },

  render: () => `<div class="panel gantt-wrap" id="laBody">${gantt()}</div>
    <p class="legend-line"><span><i class="g-key active"></i>In progress</span><span><i class="g-key planned"></i>Planned</span><span><i class="g-key hold"></i>On hold</span><span><i class="g-key done"></i>Done</span>
    <span class="muted">Bar colour shows the company. Icons are the main hazards.</span></p>`,

  update() { const el = document.getElementById('laBody'); if (el) el.innerHTML = gantt(); },

  actions: {
    laShift(el, ctx) {
      const n = +el.dataset.n;
      ui.from = n === 0 ? weekStart(today()) : addDays(range()[0], n);
      ctx.refresh();
    },
    laOpen: el => openDetail(el.dataset.id),
    laNew() {
      openDialog({ title: 'Add activity', body: form(), wide: true,
        footer: `<button type="button" class="btn ghost" data-act="closeDialog">Cancel</button><button class="btn primary" type="submit" form="actForm">Add to look-ahead</button>` });
    },
    laEdit(el) {
      const a = store.get('activities', el.dataset.id);
      openDialog({ title: `Edit ${a.ref}`, body: form(a), wide: true,
        footer: `<button type="button" class="btn ghost" data-act="laOpen" data-id="${a.id}">Back</button><button class="btn primary" type="submit" form="actForm">Save changes</button>` });
    },
    async laDelete(el, ctx) {
      const a = store.get('activities', el.dataset.id);
      if (!(await confirmBox({ title: `Delete ${a.ref}?`, text: `“${esc(a.title)}” is removed from the look-ahead. Its SPA and permits stay as they are.`, ok: 'Delete', danger: true }))) return openDetail(a.id);
      store.remove('activities', a.id);
      store.audit(ctx.user, 'Deleted activity', a.ref);
      toast(`${a.ref} deleted.`);
      ctx.refresh();
    }
  },

  changes: {
    laCompany(el, ctx) { ui.company = el.value; ctx.refresh(); }
  },

  submits: {
    laSave(form, v, btn, ctx) {
      if (v.end < v.start) return toast('The end date is before the start date.', 'err');
      const rec = { title: v.title, contractorId: v.contractorId, zoneId: v.zoneId, start: v.start, end: v.end, crew: +v.crew,
        hazards: v.hazards || [], notes: v.notes };
      const id = form.dataset.id;
      if (id) {
        store.update('activities', id, { ...rec, status: v.status });
        store.audit(ctx.user, 'Edited activity', store.get('activities', id).ref);
        toast('Activity saved.', 'ok');
        openDetail(id);
      } else {
        const a = store.insert('activities', { ref: store.nextRef('ACT'), ...rec, status: v.start <= today() ? 'active' : 'planned' });
        store.audit(ctx.user, 'Added activity', a.ref);
        closeDialog();
        toast(`${a.ref} added. Next: write its SPA.`, 'ok');
      }
      ctx.refresh();
    }
  }
};
