// Plant and equipment: inspection dates for every machine on site. HSE is emailed when one is
// about to run out and again when it has expired.

import * as store from '../store.js';
import { can, isAdmin } from '../auth.js';
import { esc, today, addDays, parseDay, isoDay, fmtDayYear, daysLeftText, daysUntil, fmtDateTime, nowIso } from '../util.js';
import { icon } from '../icons.js';
import { toast, openDialog, closeDialog, confirmBox, badge, contractorTag, contractorOptions, field, options, emptyState, busy } from '../ui.js';
import { EQUIPMENT_TYPES } from '../domain.js';
import * as D from '../derive.js';
import { runChecks } from '../monitor.js';
import { sendEmail, describe } from '../mail.js';

const addYear = s => { const d = parseDay(s); d.setFullYear(d.getFullYear() + 1); return isoDay(d); };
const stateBadge = e => {
  const { left, state } = D.equipmentState(e);
  return badge(daysLeftText(left), state === 'expired' ? 'danger' : state === 'soon' ? 'warn' : 'ok-soft');
};

function body() {
  const list = store.all('equipment').slice().sort((a, b) => a.validUntil.localeCompare(b.validUntil));
  const n = st => list.filter(e => D.equipmentState(e).state === st).length;
  const s = store.settings();
  return `
    <div class="mini-stats">
      <span class="ms ok"><b>${n('ok')}</b> valid</span>
      <span class="ms warn"><b>${n('soon')}</b> ending within ${s.warnDays} days</span>
      <span class="ms danger"><b>${n('expired')}</b> expired</span>
    </div>
    <p class="info-line">${icon('mail')}<span>${s.mailEnabled && s.events.inspectionDue
      ? `${esc(s.mailTo)} is emailed ${s.warnDays} days before an inspection ends, and again when it has expired.`
      : 'Inspection emails are switched off.'}${isAdmin() ? ' <a href="#/admin/email">Change</a>' : ''}</span></p>
    ${list.length ? `<div class="table-wrap"><table class="table rows-click">
      <thead><tr><th>Machine</th><th>Company</th><th>Inspection valid until</th><th>Status</th><th></th></tr></thead>
      <tbody>${list.map(e => `<tr class="${D.equipmentState(e).state}" data-act="eqOpen" data-id="${e.id}" tabindex="0">
        <td><b>${esc(e.name)}</b><small class="block">${esc(e.reg)}, ${esc(e.type)}</small></td>
        <td data-label="Company">${contractorTag(e.contractorId)}</td>
        <td data-label="Valid until">${fmtDayYear(e.validUntil)}${e.noticeAt ? `<small class="block muted">${icon('mail-check')} HSE told ${fmtDateTime(e.noticeAt)}</small>` : ''}</td>
        <td data-label="Status">${stateBadge(e)}${D.equipmentState(e).state === 'expired' ? '<small class="block danger-text">Do not use</small>' : ''}</td>
        <td class="row-actions">${can('plant.edit') ? `<button type="button" class="btn sm ghost" data-act="eqInspect" data-id="${e.id}">Record inspection</button>` : ''}</td>
      </tr>`).join('')}</tbody></table></div>`
      : emptyState('forklift', 'No machines yet', can('plant.edit') ? 'Add excavators, cranes, lifts and other plant to track their inspections.' : '')}`;
}

function addForm() {
  return `<form id="eqForm" data-submit="eqSave" novalidate>
    <div class="grid-2">
      ${field('Machine', '<input name="name" required maxlength="80" placeholder="For example: Excavator CAT 320">')}
      ${field('Fleet or registration number', '<input name="reg" required maxlength="30">')}
    </div>
    <div class="grid-2">
      ${field('Type', `<select name="type">${options(EQUIPMENT_TYPES, EQUIPMENT_TYPES[0])}</select>`)}
      ${field('Company', `<select name="contractorId" required>${contractorOptions('')}</select>`)}
    </div>
    <div class="grid-2">
      ${field('Last inspection', `<input type="date" name="lastInspected" max="${today()}" data-change="eqLast">`)}
      ${field('Inspection valid until', '<input type="date" name="validUntil" required>', 'Filled in a year after the last inspection.')}
    </div>
    ${field('Notes (optional)', '<input name="notes" maxlength="200">')}
  </form>`;
}

function openDetail(id) {
  const e = store.get('equipment', id);
  if (!e) return;
  openDialog({
    title: e.name, label: `${e.reg}, ${e.type}`, panel: true,
    body: `<div class="detail-top">${stateBadge(e)}</div>
      ${D.equipmentState(e).state === 'expired' ? `<p class="advice danger">${icon('octagon-x')}<span>The inspection has expired. Do not use this machine until it has been inspected.</span></p>` : ''}
      <dl class="facts cols">
        <div><dt>Company</dt><dd>${contractorTag(e.contractorId)}</dd></div>
        <div><dt>Valid until</dt><dd>${fmtDayYear(e.validUntil)}</dd></div>
        <div><dt>Last inspected</dt><dd>${e.lastInspected ? fmtDayYear(e.lastInspected) : '-'}</dd></div>
        <div><dt>HSE told</dt><dd>${e.noticeAt ? fmtDateTime(e.noticeAt) : 'Not needed yet'}</dd></div>
      </dl>
      ${e.notes ? `<h3 class="sub-head">Notes</h3><p>${esc(e.notes)}</p>` : ''}
      <h3 class="sub-head">Inspection history</h3>
      ${e.history?.length ? `<ol class="mini-timeline">${e.history.slice().sort((a, b) => b.inspectedOn.localeCompare(a.inspectedOn)).map(h => `
        <li><time>${fmtDayYear(h.inspectedOn)}</time><span>Valid until ${fmtDayYear(h.validUntil)}${h.inspector ? `, ${esc(h.inspector)}` : ''}${h.notes ? `. ${esc(h.notes)}` : ''} <small class="muted">saved by ${esc(h.recordedBy)}</small></span></li>`).join('')}</ol>`
        : '<p class="muted">No inspections recorded.</p>'}
      ${can('plant.edit') ? `<div class="detail-actions">
        <button type="button" class="btn primary" data-act="eqInspect" data-id="${e.id}">${icon('check')}Record inspection</button>
        <button type="button" class="btn danger-ghost" data-act="eqRemove" data-id="${e.id}">${icon('trash')}Remove</button></div>` : ''}`
  });
}

export default {
  meta: {
    key: 'plant', hideFor: ['worker'], label: 'Plant & equipment', icon: 'forklift',
    badge: () => store.all('equipment').filter(e => D.equipmentState(e).state === 'expired').length
  },

  header: () => ({
    title: 'Plant and equipment',
    sub: 'Statutory inspections of machines on site',
    actions: `${can('report.send') ? `<button type="button" class="btn ghost" data-act="eqEmail">${icon('mail')}<span>Email status</span></button>` : ''}
      ${can('plant.edit') ? `<button type="button" class="btn primary" data-act="eqNew">${icon('plus')}<span>Add machine</span></button>` : ''}`
  }),

  render: () => `<div id="eqBody">${body()}</div>`,
  update() { const el = document.getElementById('eqBody'); if (el) el.innerHTML = body(); },

  actions: {
    eqOpen: el => openDetail(el.dataset.id),
    eqNew() {
      openDialog({ title: 'Add a machine', body: addForm(), wide: true,
        footer: `<button type="button" class="btn ghost" data-act="closeDialog">Cancel</button><button class="btn primary" type="submit" form="eqForm">Add machine</button>` });
    },
    eqInspect(el) {
      const e = store.get('equipment', el.dataset.id);
      openDialog({
        title: `New inspection: ${e.reg}`, label: e.name,
        body: `<form id="inspForm" data-submit="eqInspectSave" data-id="${e.id}" novalidate>
          <div class="grid-2">
            ${field('Inspected on', `<input type="date" name="inspectedOn" required max="${today()}" value="${today()}">`)}
            ${field('Valid until', `<input type="date" name="validUntil" required min="${today()}" value="${addYear(today())}">`)}
          </div>
          ${field('Inspected by (optional)', '<input name="inspector" maxlength="60" placeholder="Inspection company or person">')}
          ${field('Notes (optional)', '<input name="notes" maxlength="200">')}
        </form>`,
        footer: `<button type="button" class="btn ghost" data-act="eqOpen" data-id="${e.id}">Back</button><button class="btn primary" type="submit" form="inspForm">Save inspection</button>`
      });
    },
    async eqRemove(el, ctx) {
      const e = store.get('equipment', el.dataset.id);
      if (!(await confirmBox({ title: `Remove ${e.reg}?`, text: `${esc(e.name)} and its inspection history are removed. Do this when the machine has left site.`, ok: 'Remove', danger: true }))) return openDetail(e.id);
      store.remove('equipment', e.id);
      store.audit(ctx.user, 'Removed machine', `${e.reg} ${e.name}`);
      toast(`${e.reg} removed.`);
      ctx.refresh();
    },
    async eqEmail(el, ctx) {
      const list = store.all('equipment').slice().sort((a, b) => a.validUntil.localeCompare(b.validUntil));
      if (!list.length) return toast('There are no machines to report.', 'err');
      const attention = list.filter(e => D.equipmentState(e).state !== 'ok').length;
      const fields = { Summary: `${list.length} machines on site, ${attention} need attention.` };
      list.forEach(e => { fields[`${e.reg} ${e.name}`] = `${daysLeftText(daysUntil(e.validUntil))} (valid until ${fmtDayYear(e.validUntil)})`; });
      const res = await busy(el, () => sendEmail({ event: 'manual', subject: `Plant inspection status: ${attention} of ${list.length} need attention`, fields, link: '#/plant', user: ctx.user }), 'Sending…');
      toast(describe(res), res.status === 'sent' ? 'ok' : res.status === 'failed' ? 'err' : 'info', 7000);
    }
  },

  changes: {
    eqLast(el) {
      const until = el.form.validUntil;
      if (el.value && !until.value) until.value = addYear(el.value);
    }
  },

  submits: {
    eqSave(form, v, btn, ctx) {
      if (v.lastInspected && v.lastInspected >= v.validUntil) return toast('The last inspection must be before the valid-until date.', 'err');
      const e = store.insert('equipment', {
        name: v.name, reg: v.reg.toUpperCase(), type: v.type, contractorId: v.contractorId, validUntil: v.validUntil, lastInspected: v.lastInspected || null,
        notes: v.notes, noticeLevel: 0, noticeAt: null,
        history: v.lastInspected ? [{ id: 'h-' + Date.now(), inspectedOn: v.lastInspected, validUntil: v.validUntil, inspector: '', notes: '', recordedBy: ctx.user.name, at: nowIso() }] : []
      });
      store.audit(ctx.user, 'Added machine', `${e.reg} ${e.name}`);
      closeDialog();
      runChecks();
      const st = D.equipmentState(e).state;
      toast(st === 'ok' ? `${e.reg} added.` : `${e.reg} added. Its inspection ${st === 'expired' ? 'has expired' : 'ends soon'}, so HSE has been told.`, st === 'ok' ? 'ok' : 'info', 6000);
      ctx.refresh();
    },
    eqInspectSave(form, v, btn, ctx) {
      if (v.validUntil <= v.inspectedOn) return toast('Valid until must be after the inspection date.', 'err');
      const e = store.get('equipment', form.dataset.id);
      store.update('equipment', e.id, {
        lastInspected: v.inspectedOn, validUntil: v.validUntil, noticeLevel: 0, noticeAt: null,
        history: [...(e.history || []), { id: 'h-' + Date.now(), inspectedOn: v.inspectedOn, validUntil: v.validUntil, inspector: v.inspector, notes: v.notes, recordedBy: ctx.user.name, at: nowIso() }]
      });
      store.audit(ctx.user, 'Recorded inspection', e.reg);
      runChecks();
      toast(`Inspection saved. ${e.reg} is valid until ${fmtDayYear(v.validUntil)}.`, 'ok');
      openDetail(e.id);
      ctx.refresh();
    }
  }
};
