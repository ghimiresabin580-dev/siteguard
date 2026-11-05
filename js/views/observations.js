// Don't walk by: anyone can raise a hazard, near miss, unsafe act or good practice.
// Leads assign it to a company with a due date and close it out with what was done.

import * as store from '../store.js';
import { can } from '../auth.js';
import { esc, today, daysUntil, timeAgo, fmtDateTime, fmtStamp, fmtDayShort, nowIso, toCSV, download } from '../util.js';
import { icon } from '../icons.js';
import { toast, openDialog, closeDialog, confirmBox, badge, contractorTag, zoneName, emptyState, field, segmented, options,
  contractorOptions, zoneOptions, tabs, busy } from '../ui.js';
import { OBS_TYPES, obsType, SEVERITY, OBS_STATUS } from '../domain.js';
import { savePhoto, hydratePhotos } from '../photos.js';
import { sendEmail, describe } from '../mail.js';
import { notify } from '../monitor.js';

const filter = { status: 'open', type: '', severity: '', company: '', q: '' };
let draftPhotos = [];
let draftPos = null;

const matches = o => (filter.status === 'all' || (filter.status === 'open' ? o.status !== 'closed' : o.status === filter.status))
  && (!filter.type || o.type === filter.type) && (!filter.severity || o.severity === filter.severity)
  && (!filter.company || o.contractorId === filter.company)
  && (!filter.q || `${o.ref} ${o.description} ${o.reportedBy} ${zoneName(o.zoneId)}`.toLowerCase().includes(filter.q.toLowerCase()));

const sevBadge = o => o.type === 'good' ? badge('Good practice', 'ok-soft', 'thumbs-up') : badge(SEVERITY[o.severity].label, SEVERITY[o.severity].tone);
const statusBadge = o => badge(OBS_STATUS[o.status].label, OBS_STATUS[o.status].tone);
const dueText = o => {
  if (!o.due || o.status === 'closed') return '';
  const d = daysUntil(o.due);
  return d < 0 ? `<span class="overdue">${-d} d overdue</span>` : d === 0 ? '<span class="due-today">Due today</span>' : `Due ${fmtDayShort(o.due)}`;
};

function rows(list) {
  return list.map(o => `
    <tr data-act="openObs" data-id="${o.id}" tabindex="0">
      <td class="ref">${o.ref}</td>
      <td class="what"><span class="type-ic t-${o.type}" title="${obsType(o.type).label}">${icon(obsType(o.type).icon)}</span>
        <div><b>${esc(o.description)}</b><small>${obsType(o.type).label}, raised by ${esc(o.reportedBy)} ${timeAgo(o.createdAt)}</small></div></td>
      <td data-label="Where">${esc(zoneName(o.zoneId) || 'Site')}</td>
      <td data-label="Severity">${sevBadge(o)}</td>
      <td data-label="Assigned">${o.contractorId ? contractorTag(o.contractorId) : '<span class="muted">Not assigned</span>'}<small class="block">${dueText(o)}</small></td>
      <td data-label="Status">${statusBadge(o)}</td>
    </tr>`).join('');
}

function listHtml() {
  const all = store.all('observations');
  const list = all.filter(matches);
  const count = s => all.filter(o => (s === 'open' ? o.status !== 'closed' : s === 'all' ? true : o.status === s)).length;
  return `
    <div class="toolbar">
      ${tabs([['open', 'Open', count('open')], ['progress', 'In progress', count('progress')], ['closed', 'Closed', null], ['all', 'All', null]], filter.status, 'obsTab')}
      <div class="filters">
        <label class="search">${icon('search')}<input type="search" placeholder="Search" value="${esc(filter.q)}" data-change="obsFilter" data-key="q" data-live aria-label="Search observations"></label>
        <select data-change="obsFilter" data-key="type" aria-label="Type">${options(OBS_TYPES.map(t => [t.key, t.label]), filter.type, { blank: 'All types' })}</select>
        <select data-change="obsFilter" data-key="severity" aria-label="Severity">${options(Object.entries(SEVERITY).map(([k, v]) => [k, v.label]), filter.severity, { blank: 'Any severity' })}</select>
        <select data-change="obsFilter" data-key="company" aria-label="Company">${contractorOptions(filter.company, 'All companies')}</select>
      </div>
    </div>
    ${list.length ? `<div class="table-wrap"><table class="table rows-click">
      <thead><tr><th>Ref</th><th>Observation</th><th>Where</th><th>Severity</th><th>Assigned</th><th>Status</th></tr></thead>
      <tbody>${rows(list)}</tbody></table></div>
      <p class="table-foot">${list.length} of ${all.length} observations</p>`
      : emptyState('footprints', filter.status === 'open' ? 'No open observations' : 'Nothing matches', filter.status === 'open' ? 'When someone spots something on site, it appears here until it is sorted.' : 'Try another filter.')}`;
}

// ---------- the form ----------
export function openForm(ctx, prefill = {}) {
  draftPhotos = [];
  draftPos = null;
  const lead = can('obs.manage');
  openDialog({
    title: 'Raise an observation',
    label: 'Don’t walk by',
    body: `<form id="obsForm" data-submit="saveObs" novalidate>
      <fieldset class="field" data-change="obsType"><legend class="field-label">What did you see?</legend>
        ${segmented('type', OBS_TYPES.map(t => [t.key, t.label, t.icon]), prefill.type || 'hazard')}</fieldset>
      <fieldset class="field" id="sevField" ${prefill.type === 'good' ? 'hidden' : ''}><legend class="field-label">How serious could it be?</legend>
        ${segmented('severity', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], prefill.severity || 'medium')}
        <small class="field-hint">High: could cause a serious injury. The HSE coordinator is emailed straight away.</small></fieldset>
      <div class="grid-2">
        ${field('Where', `<select name="zoneId">${zoneOptions(prefill.zoneId || '', 'Somewhere else on site')}</select>`)}
        <div class="field"><span class="field-label">Your position</span>
          <button type="button" class="btn ghost" data-act="obsLocate" id="obsLocate">${icon('locate-fixed')}Add my GPS position</button></div>
      </div>
      ${field('Describe it', `<textarea name="description" rows="3" maxlength="600" required placeholder="What is wrong, and exactly where?">${esc(prefill.description || '')}</textarea>`)}
      ${field('What did you do about it? (optional)', '<textarea name="action" rows="2" maxlength="400" placeholder="For example: taped off the area and told the supervisor"></textarea>')}
      <div class="field"><span class="field-label">Photos (optional)</span>
        <div class="photo-row" id="obsPhotos"><label class="photo-add">${icon('camera')}<span>Add photo</span>
          <input type="file" accept="image/*" capture="environment" multiple hidden data-change="obsPhoto"></label></div></div>
      ${lead ? `<div class="grid-2">
        ${field('Assign to (optional)', `<select name="contractorId">${contractorOptions('', 'Not yet')}</select>`)}
        ${field('Sort out by', `<input type="date" name="due" min="${today()}">`)}
      </div>` : ''}
    </form>`,
    footer: `<button type="button" class="btn ghost" data-act="closeDialog">Cancel</button>
      <button class="btn primary" type="submit" form="obsForm">${icon('send')}Send observation</button>`
  });
}

function detail(o) {
  const lead = can('obs.manage');
  const timeline = [
    [o.createdAt, `Raised by ${esc(o.reportedBy)}`],
    ...(o.assignedAt ? [[o.assignedAt, `Assigned to ${esc(store.get('contractors', o.contractorId)?.name || '')} by ${esc(o.assignedBy)}`]] : []),
    ...(o.closedAt ? [[o.closedAt, `Closed by ${esc(o.closedBy)}`]] : [])
  ];
  return `
    <div class="detail-top">${sevBadge(o)} ${statusBadge(o)} ${o.due && o.status !== 'closed' ? `<span class="small">${dueText(o)}</span>` : ''}</div>
    <p class="detail-lead">${esc(o.description)}</p>
    <dl class="facts cols">
      <div><dt>Type</dt><dd>${obsType(o.type).label}</dd></div>
      <div><dt>Where</dt><dd>${esc(zoneName(o.zoneId) || 'Site')}${o.lat ? `<br><a href="https://www.openstreetmap.org/?mlat=${o.lat}&mlon=${o.lon}#map=19/${o.lat}/${o.lon}" target="_blank" rel="noopener" class="small">GPS position</a>` : ''}</dd></div>
      <div><dt>Raised</dt><dd>${fmtDateTime(o.createdAt)}</dd></div>
      <div><dt>Assigned to</dt><dd>${o.contractorId ? contractorTag(o.contractorId) : 'Nobody yet'}</dd></div>
    </dl>
    ${o.action ? `<h3 class="sub-head">Immediate action</h3><p>${esc(o.action)}</p>` : ''}
    ${o.photos?.length ? `<h3 class="sub-head">Photos</h3><div class="photo-grid">${o.photos.map(id => `<img data-photo="${id}" alt="Photo of the observation">`).join('')}</div>` : ''}
    ${o.status === 'closed' && o.type !== 'good' ? `<h3 class="sub-head">How it was sorted</h3><p>${esc(o.closeNote || 'No note.')}</p>
      ${o.closePhoto ? `<div class="photo-grid"><img data-photo="${o.closePhoto}" alt="Photo after the fix"></div>` : ''}` : ''}
    <h3 class="sub-head">History</h3>
    <ol class="mini-timeline">${timeline.map(([at, text]) => `<li><time>${fmtDateTime(at)}</time><span>${text}</span></li>`).join('')}</ol>
    ${lead ? `<div id="obsActions" class="detail-actions">
      ${o.status !== 'closed' ? `<button type="button" class="btn ghost" data-act="obsAssign" data-id="${o.id}">${icon('users')}${o.contractorId ? 'Reassign' : 'Assign'}</button>
        <button type="button" class="btn primary" data-act="obsClose" data-id="${o.id}">${icon('circle-check')}Close out</button>`
        : `<button type="button" class="btn ghost" data-act="obsReopen" data-id="${o.id}">${icon('rotate-cw')}Reopen</button>`}
      ${can('*') ? `<button type="button" class="btn danger-ghost" data-act="obsDelete" data-id="${o.id}">${icon('trash')}Delete</button>` : ''}
    </div>` : ''}`;
}

function openDetail(id) {
  const o = store.get('observations', id);
  if (!o) return toast('That observation was not found.', 'err');
  openDialog({ title: o.ref, label: obsType(o.type).label, body: detail(o), panel: true,
    onClose: () => { if (location.hash.startsWith('#/observations/')) history.replaceState(null, '', '#/observations'); } });
  hydratePhotos(document.getElementById('dlg'));
}

export default {
  meta: {
    key: 'observations', label: 'Don’t walk by', icon: 'footprints',
    badge: () => store.all('observations').filter(o => o.status !== 'closed' && o.severity === 'high').length
  },
  openForm,

  header: () => ({
    title: 'Don’t walk by',
    sub: 'Hazards, near misses, unsafe acts and good practice spotted on site',
    actions: `<button type="button" class="btn ghost" data-act="obsExport">${icon('download')}<span>Export CSV</span></button>
      ${can('obs.create') ? `<button type="button" class="btn primary" data-act="raiseObservation">${icon('plus')}<span>Raise observation</span></button>` : ''}`
  }),

  render: () => `<div id="obsList">${listHtml()}</div>`,
  update() { const el = document.getElementById('obsList'); if (el) el.innerHTML = listHtml(); },

  mount(ctx) {
    const id = ctx.route.params[0];
    if (id) openDetail(id);
  },

  actions: {
    obsTab: (el, ctx) => { filter.status = el.dataset.key; ctx.refresh(); },
    openObs: el => openDetail(el.dataset.id),
    async obsLocate(el) {
      if (!navigator.geolocation) return toast('This device cannot share its position.', 'err');
      el.disabled = true;
      el.innerHTML = `<span class="spinner"></span>Finding you…`;
      navigator.geolocation.getCurrentPosition(p => {
        draftPos = { lat: +p.coords.latitude.toFixed(6), lon: +p.coords.longitude.toFixed(6) };
        el.innerHTML = `${icon('map-pin')}Position added (±${Math.round(p.coords.accuracy)} m)`;
      }, () => {
        el.disabled = false;
        el.innerHTML = `${icon('locate-fixed')}Add my GPS position`;
        toast('Allow location access in the browser to add your position.', 'err');
      }, { enableHighAccuracy: true, timeout: 10000 });
    },
    async obsRemovePhoto(el) {
      draftPhotos = draftPhotos.filter(p => p !== el.dataset.id);
      el.closest('.photo-thumb').remove();
    },
    obsAssign(el) {
      const o = store.get('observations', el.dataset.id);
      openDialog({
        title: `Assign ${o.ref}`,
        body: `<form id="assignForm" data-submit="obsAssignSave" data-id="${o.id}" novalidate>
          <p class="lead">${esc(o.description)}</p>
          ${field('Company that sorts it out', `<select name="contractorId" required>${contractorOptions(o.contractorId)}</select>`)}
          ${field('Sort out by', `<input type="date" name="due" required min="${today()}" value="${o.due || today()}">`)}
        </form>`,
        footer: `<button type="button" class="btn ghost" data-act="openObs" data-id="${o.id}">Back</button>
          <button class="btn primary" type="submit" form="assignForm">Assign</button>`
      });
    },
    obsClose(el) {
      const o = store.get('observations', el.dataset.id);
      draftPhotos = [];
      openDialog({
        title: `Close out ${o.ref}`,
        body: `<form id="closeForm" data-submit="obsCloseSave" data-id="${o.id}" novalidate>
          <p class="lead">${esc(o.description)}</p>
          ${field('What was done', '<textarea name="closeNote" rows="3" maxlength="500" required placeholder="For example: edge protection fitted along the full length"></textarea>')}
          <div class="field"><span class="field-label">Photo after the fix (optional)</span>
            <div class="photo-row" id="obsPhotos"><label class="photo-add">${icon('camera')}<span>Add photo</span>
              <input type="file" accept="image/*" capture="environment" hidden data-change="obsPhoto"></label></div></div>
        </form>`,
        footer: `<button type="button" class="btn ghost" data-act="openObs" data-id="${o.id}">Back</button>
          <button class="btn primary" type="submit" form="closeForm">${icon('circle-check')}Close out</button>`
      });
    },
    obsReopen(el, ctx) {
      store.update('observations', el.dataset.id, { status: 'open', closedAt: null, closedBy: null });
      store.audit(ctx.user, 'Reopened observation', store.get('observations', el.dataset.id).ref);
      openDetail(el.dataset.id);
      ctx.refresh();
    },
    async obsDelete(el, ctx) {
      const o = store.get('observations', el.dataset.id);
      if (!(await confirmBox({ title: `Delete ${o.ref}?`, text: 'It disappears from reports too. Close it out instead if it was sorted.', ok: 'Delete', danger: true }))) return openDetail(o.id);
      store.remove('observations', o.id);
      store.audit(ctx.user, 'Deleted observation', o.ref);
      toast(`${o.ref} deleted.`);
      ctx.refresh();
    },
    obsExport() {
      const list = store.all('observations').filter(matches);
      const csv = toCSV([['Ref', 'Type', 'Severity', 'Where', 'Description', 'Immediate action', 'Raised by', 'Raised', 'Status', 'Assigned to', 'Due', 'Closed', 'Close note'],
        ...list.map(o => [o.ref, obsType(o.type).label, o.type === 'good' ? '' : SEVERITY[o.severity].label, zoneName(o.zoneId), o.description, o.action,
          o.reportedBy, fmtDateTime(o.createdAt), OBS_STATUS[o.status].label, store.get('contractors', o.contractorId)?.name || '', o.due || '',
          o.closedAt ? fmtDateTime(o.closedAt) : '', o.closeNote])]);
      download(`observations-${today()}.csv`, csv, 'text/csv');
    }
  },

  changes: {
    obsFilter: (el, ctx) => {
      filter[el.dataset.key] = el.value;
      if (el.dataset.key === 'q') {
        const list = document.getElementById('obsList');
        const pos = el.selectionStart;
        list.innerHTML = listHtml();
        const input = list.querySelector('input[type=search]');
        input.focus(); input.setSelectionRange(pos, pos);
      } else ctx.refresh();
    },
    async obsPhoto(el) {
      const files = [...el.files];
      for (const f of files) {
        try {
          const id = await savePhoto(f);
          draftPhotos.push(id);
          const label = el.closest('.photo-add');
          label.insertAdjacentHTML('beforebegin', `<span class="photo-thumb"><img data-photo="${id}" alt="">
            <button type="button" class="icon-btn" data-act="obsRemovePhoto" data-id="${id}" aria-label="Remove photo">${icon('x')}</button></span>`);
          hydratePhotos(label.parentElement);
          if (!el.multiple) label.hidden = true;
        } catch (e) { toast(e.message, 'err'); }
      }
      el.value = '';
    },
    obsType(el, ctx, e) {
      const sev = document.getElementById('sevField');
      if (sev && e.target.name === 'type') sev.hidden = e.target.value === 'good';
    }
  },

  submits: {
    async saveObs(form, v, btn, ctx) {
      const user = ctx.user;
      const good = v.type === 'good';
      const rec = store.insert('observations', {
        ref: store.nextRef('DWB'), type: v.type, severity: good ? 'low' : v.severity, zoneId: v.zoneId || null,
        description: v.description, action: v.action, reportedBy: user.name, reportedById: user.id,
        status: good ? 'closed' : v.contractorId ? 'progress' : 'open',
        contractorId: v.contractorId || null, due: v.due || null,
        assignedAt: v.contractorId ? nowIso() : null, assignedBy: v.contractorId ? user.name : null,
        closedAt: good ? nowIso() : null, closedBy: good ? user.name : null, closeNote: good ? 'Good practice recorded.' : '',
        photos: draftPhotos.slice(), closePhoto: null, lat: draftPos?.lat ?? null, lon: draftPos?.lon ?? null
      }, { front: true });
      draftPhotos = [];
      store.audit(user, 'Raised observation', `${rec.ref} ${obsType(rec.type).label}`);
      closeDialog();
      if (rec.zoneId && !good && rec.severity !== 'low') store.update('items', rec.zoneId, { status: 2 });

      const high = rec.severity === 'high' && !good;
      if (high) notify('observation', `High ${obsType(rec.type).label.toLowerCase()} ${rec.ref}`, `${zoneName(rec.zoneId) || 'Site'}: ${rec.description}`, `#/observations/${rec.id}`);
      let mailNote = '';
      if (high || store.settings().events.allObservations) {
        const res = await sendEmail({
          event: high ? 'highObservation' : 'allObservations',
          subject: `${high ? 'HIGH ' : ''}${obsType(rec.type).label} at ${zoneName(rec.zoneId) || 'site'} (${rec.ref})`,
          fields: {
            Observation: `${rec.ref} ${obsType(rec.type).label}`, Severity: good ? 'Good practice' : SEVERITY[rec.severity].label,
            Where: zoneName(rec.zoneId) || 'Not given', Description: rec.description, 'Immediate action': rec.action || 'None recorded',
            'Raised by': `${user.name}, ${fmtStamp(rec.createdAt)}`, ...(rec.lat ? { 'GPS position': `${rec.lat}, ${rec.lon}` } : {}),
            Photos: rec.photos.length ? `${rec.photos.length} in SiteGuard` : 'None'
          },
          link: `#/observations/${rec.id}`
        });
        mailNote = describe(res);
      }
      toast(good ? `${rec.ref} saved. Thanks for sharing good practice.` : `${rec.ref} sent. Thank you for not walking by.${mailNote ? ' ' + mailNote : ''}`, 'ok', 6000);
      if (ctx.route.view === 'observations') { filter.status = good ? 'all' : 'open'; ctx.refresh(); }
      else ctx.refresh();
    },
    async obsAssignSave(form, v, btn, ctx) {
      const id = form.dataset.id;
      store.update('observations', id, { contractorId: v.contractorId, due: v.due, status: 'progress', assignedAt: nowIso(), assignedBy: ctx.user.name });
      const o = store.get('observations', id);
      store.audit(ctx.user, 'Assigned observation', `${o.ref} to ${store.get('contractors', v.contractorId)?.name}`);
      toast(`${o.ref} assigned to ${store.get('contractors', v.contractorId)?.name}.`, 'ok');
      openDetail(id);
      ctx.refresh();
    },
    async obsCloseSave(form, v, btn, ctx) {
      const id = form.dataset.id;
      store.update('observations', id, { status: 'closed', closeNote: v.closeNote, closedAt: nowIso(), closedBy: ctx.user.name, closePhoto: draftPhotos[0] || null });
      draftPhotos = [];
      const o = store.get('observations', id);
      store.audit(ctx.user, 'Closed observation', o.ref);
      toast(`${o.ref} closed.`, 'ok');
      openDetail(id);
      ctx.refresh();
    }
  }
};
