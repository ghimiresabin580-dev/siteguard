// Permits to work: requested by the contractor, approved by HSE or the site manager, closed when the work ends.

import * as store from '../store.js';
import { can } from '../auth.js';
import { esc, today, fmtDateTime, fmtStamp, nowIso, isoDay, pad as pad2, timeAgo } from '../util.js';
import { icon } from '../icons.js';
import { toast, openDialog, closeDialog, badge, contractorTag, contractorOptions, zoneOptions, zoneName, field, options, tabs, emptyState, busy } from '../ui.js';
import { PERMIT_TYPES, PERMIT_STATUS } from '../domain.js';
import * as D from '../derive.js';
import { sendEmail, describe } from '../mail.js';
import { notify } from '../monitor.js';

const ui = { tab: 'active' };

const localInput = iso => { const d = new Date(iso); return `${isoDay(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const statusBadge = p => { const st = D.permitState(p); return badge(PERMIT_STATUS[st].label, PERMIT_STATUS[st].tone); };

function timeLeft(p) {
  if (D.permitState(p) !== 'active') return '';
  const mins = Math.round((Date.parse(p.validTo) - Date.now()) / 60000);
  if (Date.parse(p.validFrom) > Date.now()) return `starts ${fmtDateTime(p.validFrom)}`;
  if (mins < 60) return `<span class="due-today">ends in ${mins} min</span>`;
  if (mins < 60 * 12) return `ends in ${Math.round(mins / 60)} h`;
  return `ends ${fmtDateTime(p.validTo)}`;
}

function list() {
  const all = store.all('permits');
  const st = D.permitState;
  const pick = { active: p => st(p) === 'active', requested: p => st(p) === 'requested', closed: p => ['closed', 'rejected', 'expired'].includes(st(p)), all: () => true }[ui.tab];
  const shown = all.filter(pick).sort((a, b) => b.ref.localeCompare(a.ref));
  return `<div class="toolbar">${tabs([
      ['active', 'Active', all.filter(p => st(p) === 'active').length],
      ['requested', 'Awaiting approval', all.filter(p => st(p) === 'requested').length],
      ['closed', 'Closed', null], ['all', 'All', null]], ui.tab, 'ptwTab')}</div>
    ${shown.length ? `<div class="table-wrap"><table class="table rows-click">
      <thead><tr><th>Permit</th><th>Work</th><th>Company</th><th>Valid</th><th>Status</th></tr></thead>
      <tbody>${shown.map(p => `<tr data-act="ptwOpen" data-id="${p.id}" tabindex="0">
        <td class="nowrap"><span class="type-ic">${icon(PERMIT_TYPES[p.type].icon)}</span><b>${p.ref}</b><small class="block">${PERMIT_TYPES[p.type].label}</small></td>
        <td><b>${esc(p.title)}</b><small class="block">${esc(zoneName(p.zoneId))}</small></td>
        <td data-label="Company">${contractorTag(p.contractorId)}</td>
        <td data-label="Valid" class="nowrap">${fmtDateTime(p.validFrom)}<small class="block">to ${fmtDateTime(p.validTo)}</small><small class="block">${timeLeft(p)}</small></td>
        <td data-label="Status">${statusBadge(p)}${p.status === 'requested' ? `<small class="block">asked ${timeAgo(p.requestedAt)}</small>` : ''}</td>
      </tr>`).join('')}</tbody></table></div>`
      : emptyState('file-check', ui.tab === 'requested' ? 'Nothing waiting for approval' : 'No permits here', can('permit.request') ? 'Hot work, excavations, work at height, confined spaces, lifting and electrical isolation all need a permit.' : '')}`;
}

function checklistHtml(type, ticked = {}, editable = true, name = 'check') {
  return `<ul class="checklist">${PERMIT_TYPES[type].checklist.map((c, i) => `
    <li><label class="check"><input type="checkbox" name="${name}" value="${i}" ${ticked[i] ? 'checked' : ''} ${editable ? '' : 'disabled'}><span>${esc(c)}</span></label></li>`).join('')}</ul>`;
}

function requestForm(activityId, user) {
  const a = store.get('activities', activityId);
  const type = { hotwork: 'hotwork', excavation: 'excavation', height: 'height', lifting: 'lifting', electrical: 'electrical' }[(a?.hazards || []).find(h => ['hotwork', 'excavation', 'height', 'lifting', 'electrical'].includes(h))] || 'hotwork';
  const start = a && a.start > today() ? a.start : today();
  return `<form id="ptwForm" data-submit="ptwRequest" novalidate>
    ${field('Type of permit', `<select name="type" required data-change="ptwType">${options(Object.entries(PERMIT_TYPES).map(([k, t]) => [k, t.label]), type)}</select>`)}
    ${field('Work to be done', `<input name="title" required maxlength="90" value="${esc(a?.title || '')}" placeholder="Exact task and location, for example: welding brackets on gridline 4">`)}
    <div class="grid-2">
      ${field('Company', `<select name="contractorId" required>${contractorOptions(a?.contractorId || D.personForUser(user)?.contractorId || user?.companyId)}</select>`)}
      ${field('Where', `<select name="zoneId" required>${zoneOptions(a?.zoneId)}</select>`)}
    </div>
    ${field('Activity (optional)', `<select name="activityId">${options(store.all('activities').filter(x => x.status !== 'done').map(x => [x.id, `${x.ref} ${x.title}`]), activityId || '', { blank: 'Not linked' })}</select>`)}
    <div class="grid-2">
      ${field('Valid from', `<input type="datetime-local" name="validFrom" required value="${start}T07:00">`)}
      ${field('Valid until', `<input type="datetime-local" name="validTo" required value="${start}T16:00">`, 'Hot work permits cover one shift at most.')}
    </div>
    <fieldset class="field"><legend class="field-label">Controls in place before work starts</legend>
      <div id="ptwChecklist">${checklistHtml(type)}</div></fieldset>
    ${field('Anything else the approver should know (optional)', '<textarea name="conditions" rows="2" maxlength="400"></textarea>')}
  </form>`;
}

function detailHtml(p) {
  const st = D.permitState(p);
  const approver = can('permit.approve');
  const owner = can('permit.request');
  return `
    <div class="detail-top">${statusBadge(p)} <span class="small">${timeLeft(p)}</span></div>
    <p class="detail-lead">${esc(p.title)}</p>
    <dl class="facts cols">
      <div><dt>Type</dt><dd>${icon(PERMIT_TYPES[p.type].icon)} ${PERMIT_TYPES[p.type].label}</dd></div>
      <div><dt>Company</dt><dd>${contractorTag(p.contractorId)}</dd></div>
      <div><dt>Where</dt><dd>${esc(zoneName(p.zoneId))}</dd></div>
      <div><dt>Activity</dt><dd>${p.activityId ? esc(store.get('activities', p.activityId)?.ref || '-') : '-'}</dd></div>
      <div><dt>Valid from</dt><dd>${fmtDateTime(p.validFrom)}</dd></div>
      <div><dt>Valid until</dt><dd>${fmtDateTime(p.validTo)}</dd></div>
      <div><dt>Requested</dt><dd>${esc(p.requestedBy)}, ${fmtDateTime(p.requestedAt)}</dd></div>
      <div><dt>${p.status === 'rejected' ? 'Rejected' : 'Approved'}</dt><dd>${p.approvedBy ? `${esc(p.approvedBy)}, ${fmtDateTime(p.approvedAt)}` : '-'}</dd></div>
    </dl>
    <h3 class="sub-head">Controls</h3>
    ${checklistHtml(p.type, p.checklist, false)}
    ${p.conditions ? `<h3 class="sub-head">Conditions</h3><p>${esc(p.conditions)}</p>` : ''}
    ${p.rejectReason ? `<h3 class="sub-head">Why it was rejected</h3><p>${esc(p.rejectReason)}</p>` : ''}
    ${p.closeNote ? `<h3 class="sub-head">Closed</h3><p>${esc(p.closeNote)}</p><p class="muted small">${esc(p.closedBy || '')}, ${fmtDateTime(p.closedAt)}</p>` : ''}
    <div class="detail-actions">
      <button type="button" class="btn ghost" data-act="ptwPrint" data-id="${p.id}">${icon('printer')}Print</button>
      ${st === 'requested' && approver ? `<button type="button" class="btn danger-ghost" data-act="ptwReject" data-id="${p.id}">Reject</button>
        <button type="button" class="btn primary" data-act="ptwApprove" data-id="${p.id}">${icon('badge-check')}Review and approve</button>` : ''}
      ${['active', 'expired'].includes(st) && (approver || owner) ? `<button type="button" class="btn primary" data-act="ptwClose" data-id="${p.id}">${icon('circle-check')}Close permit</button>` : ''}
    </div>`;
}

function openDetail(id) {
  const p = store.get('permits', id);
  if (!p) return toast('Permit not found.', 'err');
  openDialog({ title: p.ref, label: PERMIT_TYPES[p.type].label, panel: true, body: detailHtml(p),
    onClose: () => { if (/^#\/permits\/.+/.test(location.hash)) history.replaceState(null, '', '#/permits'); } });
}

function printPermit(p) {
  const s = store.settings();
  const w = window.open('', '_blank', 'width=800,height=900');
  if (!w) return toast('Allow pop-ups to print the permit.', 'err');
  w.document.write(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${p.ref}</title>
    <style>body{font:14px/1.45 system-ui,sans-serif;color:#13263a;margin:32px;max-width:720px}h1{font-size:22px;margin:0 0 4px}
    .top{display:flex;justify-content:space-between;border-bottom:3px solid #13263a;padding-bottom:10px;margin-bottom:16px}
    dl{display:grid;grid-template-columns:160px 1fr;gap:6px 12px}dt{color:#5b6b7b}dd{margin:0}
    ul{padding-left:0;list-style:none}li{padding:4px 0}li::before{content:'\\2610  ';font-size:16px}li.on::before{content:'\\2611  '}
    .sign{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:40px}.sign div{border-top:1px solid #13263a;padding-top:6px;color:#5b6b7b}</style></head><body>
    <div class="top"><div><h1>${esc(PERMIT_TYPES[p.type].label)} permit</h1><div>${esc(s.siteName)}, ${esc(s.project)}</div></div><div><b>${p.ref}</b><br>${PERMIT_STATUS[D.permitState(p)].label}</div></div>
    <dl><dt>Work</dt><dd>${esc(p.title)}</dd><dt>Company</dt><dd>${esc(store.get('contractors', p.contractorId)?.name || '')}</dd>
    <dt>Where</dt><dd>${esc(zoneName(p.zoneId))}</dd><dt>Valid</dt><dd>${fmtDateTime(p.validFrom)} to ${fmtDateTime(p.validTo)}</dd>
    <dt>Requested by</dt><dd>${esc(p.requestedBy)}</dd><dt>Approved by</dt><dd>${esc(p.approvedBy || '')}</dd></dl>
    <h2 style="font-size:16px;margin-top:20px">Controls</h2><ul>${PERMIT_TYPES[p.type].checklist.map((c, i) => `<li class="${p.checklist[i] ? 'on' : ''}">${esc(c)}</li>`).join('')}</ul>
    ${p.conditions ? `<h2 style="font-size:16px">Conditions</h2><p>${esc(p.conditions)}</p>` : ''}
    <div class="sign"><div>Permit holder</div><div>Issued by</div></div>
    <script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

export default {
  meta: {
    key: 'permits', label: 'Permits', icon: 'file-check',
    badge: () => can('permit.approve') ? store.all('permits').filter(p => p.status === 'requested').length : 0
  },

  header: () => ({
    title: 'Permits to work',
    sub: 'Hot work, excavation, height, confined space, lifting and electrical isolation',
    actions: can('permit.request') ? `<button type="button" class="btn primary" data-act="ptwNew">${icon('plus')}<span>Request permit</span></button>` : ''
  }),

  render: () => `<div id="ptwList">${list()}</div>`,
  update() { const el = document.getElementById('ptwList'); if (el) el.innerHTML = list(); },

  mount(ctx) {
    const [p0, p1] = ctx.route.params;
    if (p0 === 'new') { if (can('permit.request')) this.actions.ptwNew(null, ctx, null, p1); }
    else if (p0) openDetail(p0);
  },

  actions: {
    ptwTab: (el, ctx) => { ui.tab = el.dataset.key; ctx.refresh(); },
    ptwOpen: el => openDetail(el.dataset.id),
    ptwNew(el, ctx, e, activityId) {
      openDialog({ title: 'Request a permit to work', body: requestForm(activityId, ctx.user), wide: true,
        footer: `<button type="button" class="btn ghost" data-act="closeDialog">Cancel</button><button class="btn primary" type="submit" form="ptwForm">${icon('send')}Send for approval</button>`,
        onClose: () => { if (location.hash.startsWith('#/permits/new')) history.replaceState(null, '', '#/permits'); } });
    },
    ptwPrint: el => printPermit(store.get('permits', el.dataset.id)),
    ptwApprove(el) {
      const p = store.get('permits', el.dataset.id);
      openDialog({
        title: `Approve ${p.ref}`, label: PERMIT_TYPES[p.type].label,
        body: `<form id="approveForm" data-submit="ptwApproveSave" data-id="${p.id}" novalidate>
          <p class="lead">${esc(p.title)}, ${esc(zoneName(p.zoneId))}. ${fmtDateTime(p.validFrom)} to ${fmtDateTime(p.validTo)}.</p>
          <p class="field-label">Check each control on site before approving</p>
          ${checklistHtml(p.type, p.checklist, true, 'ok')}
          ${field('Conditions for the permit holder (optional)', `<textarea name="conditions" rows="2" maxlength="400">${esc(p.conditions || '')}</textarea>`)}
        </form>`,
        footer: `<button type="button" class="btn ghost" data-act="ptwOpen" data-id="${p.id}">Back</button><button class="btn primary" type="submit" form="approveForm">${icon('badge-check')}Approve permit</button>`
      });
    },
    ptwReject(el) {
      const p = store.get('permits', el.dataset.id);
      openDialog({
        title: `Reject ${p.ref}`,
        body: `<form id="rejectForm" data-submit="ptwRejectSave" data-id="${p.id}" novalidate>
          ${field('What needs to change', '<textarea name="reason" rows="3" required maxlength="400" placeholder="For example: fire watch not named, extinguishers missing"></textarea>')}</form>`,
        footer: `<button type="button" class="btn ghost" data-act="ptwOpen" data-id="${p.id}">Back</button><button class="btn danger" type="submit" form="rejectForm">Reject permit</button>`
      });
    },
    ptwClose(el) {
      const p = store.get('permits', el.dataset.id);
      openDialog({
        title: `Close ${p.ref}`,
        body: `<form id="closePtw" data-submit="ptwCloseSave" data-id="${p.id}" novalidate>
          ${field('How was the area left', `<textarea name="note" rows="3" required maxlength="400" placeholder="${p.type === 'hotwork' ? 'Fire watch kept until 16:45, nothing smouldering, area clean' : 'Work finished, area left safe and tidy'}"></textarea>`)}</form>`,
        footer: `<button type="button" class="btn ghost" data-act="ptwOpen" data-id="${p.id}">Back</button><button class="btn primary" type="submit" form="closePtw">Close permit</button>`
      });
    }
  },

  changes: {
    ptwType(el) { document.getElementById('ptwChecklist').innerHTML = checklistHtml(el.value); }
  },

  submits: {
    async ptwRequest(form, v, btn, ctx) {
      const from = new Date(v.validFrom), to = new Date(v.validTo);
      if (!(to > from)) return toast('The permit must end after it starts.', 'err');
      if (v.type === 'hotwork' && to - from > 12 * 3600e3) return toast('A hot work permit covers one shift at most (12 hours).', 'err');
      if (to - from > 14 * 864e5) return toast('Permits run for two weeks at most. Request a new one after that.', 'err');
      const checklist = Object.fromEntries((v.check || []).map(i => [i, true]));
      const p = store.insert('permits', {
        ref: store.nextRef('PTW'), type: v.type, title: v.title, contractorId: v.contractorId, zoneId: v.zoneId, activityId: v.activityId || null,
        validFrom: from.toISOString(), validTo: to.toISOString(), status: 'requested', requestedBy: ctx.user.name, requestedAt: nowIso(),
        approvedBy: null, approvedAt: null, checklist, conditions: v.conditions, closedAt: null, closedBy: null, closeNote: '', expiryNotified: false
      });
      store.audit(ctx.user, 'Requested permit', `${p.ref} ${PERMIT_TYPES[p.type].label}`);
      notify('permit', `${p.ref} is waiting for approval`, `${PERMIT_TYPES[p.type].label}: ${p.title}`, `#/permits/${p.id}`);
      closeDialog();
      ui.tab = 'requested';
      ctx.refresh();
      const res = await sendEmail({
        event: 'permitRequest', subject: `Permit to approve: ${p.ref} ${PERMIT_TYPES[p.type].label.toLowerCase()}, ${store.get('contractors', p.contractorId)?.name}`,
        fields: { Permit: `${p.ref} ${PERMIT_TYPES[p.type].label}`, Work: p.title, Company: store.get('contractors', p.contractorId)?.name, Where: zoneName(p.zoneId),
          Valid: `${fmtStamp(p.validFrom)} to ${fmtStamp(p.validTo)}`, 'Requested by': ctx.user.name,
          'Controls confirmed': `${Object.keys(checklist).length} of ${PERMIT_TYPES[p.type].checklist.length}`, Notes: p.conditions || '-' },
        link: `#/permits/${p.id}`
      });
      toast(`${p.ref} sent for approval. ${describe(res)}`, 'ok', 6500);
    },
    ptwApproveSave(form, v, btn, ctx) {
      const p = store.get('permits', form.dataset.id);
      const ticked = v.ok || [];
      if (ticked.length < PERMIT_TYPES[p.type].checklist.length) return toast('Every control must be in place before the permit is approved.', 'err');
      store.update('permits', p.id, { status: 'active', approvedBy: ctx.user.name, approvedAt: nowIso(), conditions: v.conditions,
        checklist: Object.fromEntries(ticked.map(i => [i, true])), expiryNotified: false });
      store.audit(ctx.user, 'Approved permit', p.ref);
      toast(`${p.ref} approved.`, 'ok');
      ui.tab = 'active';
      openDetail(p.id);
      ctx.refresh();
    },
    ptwRejectSave(form, v, btn, ctx) {
      const p = store.get('permits', form.dataset.id);
      store.update('permits', p.id, { status: 'rejected', approvedBy: ctx.user.name, approvedAt: nowIso(), rejectReason: v.reason });
      store.audit(ctx.user, 'Rejected permit', p.ref);
      notify('permit', `${p.ref} was rejected`, v.reason, `#/permits/${p.id}`);
      toast(`${p.ref} rejected. ${p.requestedBy} can request it again once it is fixed.`);
      openDetail(p.id);
      ctx.refresh();
    },
    ptwCloseSave(form, v, btn, ctx) {
      const p = store.get('permits', form.dataset.id);
      store.update('permits', p.id, { status: 'closed', closedAt: nowIso(), closedBy: ctx.user.name, closeNote: v.note });
      store.audit(ctx.user, 'Closed permit', p.ref);
      toast(`${p.ref} closed.`, 'ok');
      openDetail(p.id);
      ctx.refresh();
    }
  }
};
