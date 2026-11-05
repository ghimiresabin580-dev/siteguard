// Workforce: who is on site today, the people register with induction and safety cards
// (Finnish sites keep a list of workers with their tax numbers), and the companies on site.

import * as store from '../store.js';
import { can } from '../auth.js';
import { esc, today, daysUntil, fmtDayYear, fmtDayShort, fmtTime, nowIso, plural, initials } from '../util.js';
import { icon } from '../icons.js';
import { toast, openDialog, closeDialog, confirmBox, badge, contractorTag, contractorMark, contractorOptions, field, options, tabs, emptyState } from '../ui.js';
import * as D from '../derive.js';
import { CARD_LABELS, runChecks } from '../monitor.js';

const ui = { tab: 'today', q: '', company: '' };
const COLORS = ['#1d3b5a', '#8a5a2b', '#4f6d8f', '#b23a2e', '#a77d00', '#1f7a80', '#457a3b', '#6b4f8f', '#5b6b7b'];
const maskTax = t => t ? `•••• •••• ${String(t).slice(-4)}` : '-';

function cardCell(date) {
  if (!date) return '<span class="muted">-</span>';
  const left = daysUntil(date);
  const tone = left < 0 ? 'danger' : left <= store.settings().warnDays ? 'warn' : '';
  return `<span class="${tone ? tone + '-text' : ''}">${fmtDayShort(date)}${left < 0 ? ', expired' : left <= store.settings().warnDays ? `, ${left} d left` : ''}</span>`;
}

function stateBadge(p) {
  const st = D.personState(p);
  if (!st.cleared) return badge(st.problems[0], 'danger-soft');
  if (st.problems.length) return badge(st.problems[0], 'warn-soft');
  if (st.soon) return badge('Card ending soon', 'warn-soft');
  return badge('Cleared', 'ok-soft');
}

// ---------- on site today ----------
function today_(user) {
  const att = D.attendanceToday();
  const mine = D.personForUser(user);
  const myAtt = mine ? att.find(a => a.personId === mine.id) : null;
  const groups = store.all('contractors').map(c => [c, att.filter(a => store.get('people', a.personId)?.contractorId === c.id)]).filter(([, l]) => l.length);
  const onNow = att.filter(a => !a.outAt).length;
  return `
    ${mine && (can('attendance.self') || can('attendance.edit')) ? `<div class="checkin ${myAtt && !myAtt.outAt ? 'in' : ''}">
      ${icon('hard-hat')}<div><b>${myAtt && !myAtt.outAt ? `You checked in at ${fmtTime(myAtt.inAt)}` : myAtt?.outAt ? `You checked out at ${fmtTime(myAtt.outAt)}` : 'You are not checked in'}</b>
      <span>${myAtt && !myAtt.outAt ? 'Check out when you leave so the site knows who is still here.' : 'Check in when you arrive on site.'}</span></div>
      ${myAtt && !myAtt.outAt ? `<button type="button" class="btn ghost" data-act="wfOut" data-id="${myAtt.id}">Check out</button>`
        : `<button type="button" class="btn primary" data-act="wfIn" data-id="${mine.id}">${icon('log-in')}Check in</button>`}
    </div>` : ''}
    <section class="panel">
      <header class="panel-head"><h2>${plural(onNow, 'person', 'people')} on site now</h2>
        ${can('attendance.edit') ? `<button type="button" class="btn sm ghost" data-act="wfCheckInOther">${icon('user-plus')}Check someone in</button>` : ''}</header>
      ${groups.length ? `<div class="onsite">${groups.map(([c, list]) => `<div class="onsite-co">
        <h3>${contractorMark(c)}<span>${esc(c.name)}</span><small>${list.filter(a => !a.outAt).length} here</small></h3>
        <ul>${list.map(a => { const p = store.get('people', a.personId); const st = D.personState(p); return `<li class="${a.outAt ? 'left' : ''}">
          <span class="avatar sm">${esc(initials(p.name))}</span>
          <span><b>${esc(p.name)}</b><small>${esc(p.trade)}, in ${fmtTime(a.inAt)}${a.outAt ? `, out ${fmtTime(a.outAt)}` : ''}</small></span>
          ${!st.cleared ? badge(st.problems[0], 'danger-soft') : ''}
          ${can('attendance.edit') && !a.outAt ? `<button type="button" class="link-btn" data-act="wfOut" data-id="${a.id}">Check out</button>` : ''}
        </li>`; }).join('')}</ul></div>`).join('')}</div>`
        : '<p class="panel-body muted">Nobody has checked in today.</p>'}
    </section>`;
}

// ---------- people ----------
function people() {
  const list = store.all('people')
    .filter(p => (!ui.company || p.contractorId === ui.company) && (!ui.q || `${p.name} ${p.trade}`.toLowerCase().includes(ui.q.toLowerCase())))
    .sort((a, b) => a.name.localeCompare(b.name));
  return `<div class="toolbar"><div class="filters">
      <label class="search">${icon('search')}<input type="search" placeholder="Search people" value="${esc(ui.q)}" data-change="wfSearch" data-live aria-label="Search people"></label>
      <select data-change="wfCompany" aria-label="Company">${contractorOptions(ui.company, 'All companies')}</select></div></div>
    ${list.length ? `<div class="table-wrap"><table class="table rows-click">
      <thead><tr><th>Name</th><th>Company</th><th>Inducted</th><th>Safety card</th><th>Other cards</th><th>Tax number</th><th>Status</th></tr></thead>
      <tbody>${list.map(p => `<tr data-act="wfOpen" data-id="${p.id}" tabindex="0">
        <td><b>${esc(p.name)}</b><small class="block">${esc(p.trade)}</small></td>
        <td data-label="Company">${contractorTag(p.contractorId)}</td>
        <td data-label="Inducted">${p.inductedOn ? fmtDayShort(p.inductedOn) : '<span class="danger-text">No</span>'}</td>
        <td data-label="Safety card">${cardCell(p.safetyCard)}</td>
        <td data-label="Other cards">${['hotWorkCard', 'firstAid', 'electrical'].filter(k => p[k]).map(k => `<small class="block">${{ hotWorkCard: 'Hot work', firstAid: 'First aid', electrical: 'SFS 6002' }[k]}: ${cardCell(p[k])}</small>`).join('') || '<span class="muted">-</span>'}</td>
        <td data-label="Tax number" class="mono-num">${maskTax(p.taxNo)}</td>
        <td data-label="Status">${stateBadge(p)}</td>
      </tr>`).join('')}</tbody></table></div><p class="table-foot">${plural(list.length, 'person', 'people')}</p>`
      : emptyState('users', 'Nobody found', 'Try another search.')}`;
}

// ---------- companies ----------
function companies() {
  return `<div class="co-grid">${store.all('contractors').map(c => {
    const ppl = store.all('people').filter(p => p.contractorId === c.id);
    const here = D.onSiteNow().filter(a => ppl.some(p => p.id === a.personId)).length;
    return `<article class="co-tile">
      <header>${contractorMark(c, 'lg')}<div><h3>${esc(c.name)}</h3><p class="muted">${esc(c.trade)}</p></div></header>
      <dl class="facts"><div><dt>Contact</dt><dd>${esc(c.contact || '-')}</dd></div>
        <div><dt>Phone</dt><dd>${c.phone ? `<a href="tel:${esc(c.phone.replace(/\s/g, ''))}">${esc(c.phone)}</a>` : '-'}</dd></div>
        <div><dt>People</dt><dd>${ppl.length} registered, ${here} on site now</dd></div></dl>
      ${can('contractor.edit') ? `<button type="button" class="link-btn" data-act="wfEditCo" data-id="${c.id}">${icon('pencil')}Edit</button>` : ''}
    </article>`;
  }).join('')}</div>`;
}

function personForm(p = {}) {
  return `<form id="personForm" data-submit="wfSavePerson" data-id="${p.id || ''}" novalidate>
    <div class="grid-2">
      ${field('Full name', `<input name="name" required maxlength="60" value="${esc(p.name || '')}">`)}
      ${field('Trade', `<input name="trade" required maxlength="40" value="${esc(p.trade || '')}">`)}
    </div>
    <div class="grid-2">
      ${field('Company', `<select name="contractorId" required>${contractorOptions(p.contractorId)}</select>`)}
      ${field('Phone', `<input name="phone" type="tel" maxlength="30" value="${esc(p.phone || '')}">`)}
    </div>
    <div class="grid-2">
      ${field('Tax number (veronumero)', `<input name="taxNo" inputmode="numeric" pattern="\\d{12}" maxlength="12" value="${esc(p.taxNo || '')}" placeholder="12 digits">`, 'Required on Finnish construction sites. Only the last four digits are shown in lists.')}
      ${field('Site induction done on', `<input type="date" name="inductedOn" max="${today()}" value="${p.inductedOn || ''}">`)}
    </div>
    <p class="field-label">Cards valid until</p>
    <div class="grid-2">
      ${field('Occupational safety card', `<input type="date" name="safetyCard" value="${p.safetyCard || ''}">`)}
      ${field('Hot work card', `<input type="date" name="hotWorkCard" value="${p.hotWorkCard || ''}">`)}
      ${field('First aid (EA1)', `<input type="date" name="firstAid" value="${p.firstAid || ''}">`)}
      ${field('Electrical safety (SFS 6002)', `<input type="date" name="electrical" value="${p.electrical || ''}">`)}
    </div>
    ${field('Notes (optional)', `<input name="notes" maxlength="200" value="${esc(p.notes || '')}">`)}
  </form>`;
}

function openPerson(id) {
  const p = store.get('people', id);
  if (!p) return;
  const st = D.personState(p);
  const att = D.attendanceToday().find(a => a.personId === p.id);
  openDialog({
    title: p.name, label: p.trade, panel: true,
    body: `<div class="detail-top">${stateBadge(p)} ${att && !att.outAt ? badge(`On site since ${fmtTime(att.inAt)}`, 'info-soft') : ''}</div>
      ${!st.cleared ? `<p class="advice danger">${icon('octagon-x')}<span>Not cleared to work: ${esc(st.problems.join(', ').toLowerCase())}.</span></p>` : ''}
      <dl class="facts cols">
        <div><dt>Company</dt><dd>${contractorTag(p.contractorId)}</dd></div>
        <div><dt>Phone</dt><dd>${p.phone ? `<a href="tel:${esc(p.phone.replace(/\s/g, ''))}">${esc(p.phone)}</a>` : '-'}</dd></div>
        <div><dt>Tax number</dt><dd class="mono-num">${maskTax(p.taxNo)}</dd></div>
        <div><dt>Site induction</dt><dd>${p.inductedOn ? fmtDayYear(p.inductedOn) : '<span class="danger-text">Not done</span>'}</dd></div>
        ${Object.entries(CARD_LABELS).map(([k, label]) => `<div><dt>${label}</dt><dd>${p[k] ? `${fmtDayYear(p[k])}${daysUntil(p[k]) < 0 ? ' <span class="danger-text">expired</span>' : ''}` : '-'}</dd></div>`).join('')}
      </dl>
      ${p.notes ? `<p class="muted">${esc(p.notes)}</p>` : ''}
      ${can('people.edit') ? `<div class="detail-actions">
        ${!p.inductedOn ? `<button type="button" class="btn primary" data-act="wfInduct" data-id="${p.id}">${icon('badge-check')}Record induction</button>` : ''}
        <button type="button" class="btn ghost" data-act="wfEdit" data-id="${p.id}">${icon('pencil')}Edit</button>
        ${!att && can('attendance.edit') ? `<button type="button" class="btn ghost" data-act="wfIn" data-id="${p.id}">${icon('log-in')}Check in</button>` : ''}
        ${can('meeting.run') ? `<button type="button" class="btn danger-ghost" data-act="wfRemove" data-id="${p.id}">${icon('trash')}Remove</button>` : ''}
      </div>` : ''}`
  });
}

function body(user) {
  return `${tabs([['today', 'On site today', D.onSiteNow().length], ['people', 'People', store.all('people').length], ['companies', 'Companies', store.all('contractors').length]], ui.tab, 'wfTab')}
    <div class="tab-body">${ui.tab === 'people' ? people() : ui.tab === 'companies' ? companies() : today_(user)}</div>`;
}

function checkIn(personId, ctx) {
  const p = store.get('people', personId);
  const existing = D.attendanceToday().find(a => a.personId === p.id);
  if (existing && !existing.outAt) return toast(`${p.name} is already checked in.`);
  if (existing) store.update('attendance', existing.id, { outAt: null, inAt: nowIso() });
  else store.insert('attendance', { personId: p.id, day: today(), inAt: nowIso(), outAt: null });
  store.audit(ctx.user, 'Checked in', p.name);
  const st = D.personState(p);
  toast(st.cleared ? `${p.name} checked in.` : `${p.name} checked in, but is not cleared to work: ${st.problems.join(', ').toLowerCase()}.`, st.cleared ? 'ok' : 'err', 6000);
  closeDialog();
  ctx.refresh();
}

export default {
  meta: {
    key: 'workforce', label: 'Workforce', icon: 'hard-hat',
    badge: () => can('people.edit') ? D.onSiteNow().map(a => store.get('people', a.personId)).filter(p => p && !D.personState(p).cleared).length : 0
  },

  header: () => ({
    title: 'Workforce',
    sub: 'People on site, inductions and safety cards',
    actions: `${can('contractor.edit') ? `<button type="button" class="btn ghost" data-act="wfNewCo">${icon('building')}<span>Add company</span></button>` : ''}
      ${can('people.edit') ? `<button type="button" class="btn primary" data-act="wfNew">${icon('user-plus')}<span>Add person</span></button>` : ''}`
  }),

  render: ctx => `<div id="wfBody">${body(ctx.user)}</div>`,
  update(ctx) { const el = document.getElementById('wfBody'); if (el) el.innerHTML = body(ctx.user); },

  actions: {
    wfTab: (el, ctx) => { ui.tab = el.dataset.key; ctx.refresh(); },
    wfOpen: el => openPerson(el.dataset.id),
    wfIn: (el, ctx) => checkIn(el.dataset.id, ctx),
    wfOut(el, ctx) {
      const a = store.get('attendance', el.dataset.id);
      store.update('attendance', a.id, { outAt: nowIso() });
      store.audit(ctx.user, 'Checked out', store.get('people', a.personId)?.name);
      toast(`${store.get('people', a.personId)?.name} checked out.`, 'ok');
      ctx.refresh();
    },
    wfCheckInOther() {
      const here = new Set(D.onSiteNow().map(a => a.personId));
      const list = store.all('people').filter(p => !here.has(p.id)).sort((a, b) => a.name.localeCompare(b.name));
      openDialog({
        title: 'Check someone in',
        body: `<form id="ciForm" data-submit="wfCheckInSave" novalidate>${field('Person', `<select name="personId" required>${options(list.map(p => [p.id, `${p.name}, ${store.get('contractors', p.contractorId)?.short || ''}`]), '', { blank: 'Choose a person' })}</select>`)}</form>`,
        footer: `<button type="button" class="btn ghost" data-act="closeDialog">Cancel</button><button class="btn primary" type="submit" form="ciForm">Check in</button>`
      });
    },
    wfNew() {
      openDialog({ title: 'Add a person', body: personForm(), wide: true,
        footer: `<button type="button" class="btn ghost" data-act="closeDialog">Cancel</button><button class="btn primary" type="submit" form="personForm">Add person</button>` });
    },
    wfEdit(el) {
      const p = store.get('people', el.dataset.id);
      openDialog({ title: `Edit ${p.name}`, body: personForm(p), wide: true,
        footer: `<button type="button" class="btn ghost" data-act="wfOpen" data-id="${p.id}">Back</button><button class="btn primary" type="submit" form="personForm">Save</button>` });
    },
    wfInduct(el, ctx) {
      const p = store.get('people', el.dataset.id);
      store.update('people', p.id, { inductedOn: today(), inductedBy: ctx.user.name });
      store.audit(ctx.user, 'Recorded induction', p.name);
      toast(`Induction recorded for ${p.name}.`, 'ok');
      openPerson(p.id);
      ctx.refresh();
    },
    async wfRemove(el, ctx) {
      const p = store.get('people', el.dataset.id);
      if (!(await confirmBox({ title: `Remove ${esc(p.name)}?`, text: 'Do this when the person has left the project. Their past sign-ons stay in the records.', ok: 'Remove', danger: true }))) return openPerson(p.id);
      store.remove('people', p.id);
      store.audit(ctx.user, 'Removed person', p.name);
      toast(`${p.name} removed.`);
      ctx.refresh();
    },
    wfNewCo: () => openCompany(),
    wfEditCo: el => openCompany(store.get('contractors', el.dataset.id))
  },

  changes: {
    wfCompany(el, ctx) { ui.company = el.value; ctx.refresh(); },
    wfSearch(el) {
      ui.q = el.value;
      const body = document.querySelector('#wfBody .tab-body');
      const pos = el.selectionStart;
      body.innerHTML = people();
      const input = body.querySelector('input[type=search]');
      input.focus(); input.setSelectionRange(pos, pos);
    }
  },

  submits: {
    wfSavePerson(form, v, btn, ctx) {
      const rec = { name: v.name, trade: v.trade, contractorId: v.contractorId, phone: v.phone, taxNo: v.taxNo, inductedOn: v.inductedOn || null,
        safetyCard: v.safetyCard || null, hotWorkCard: v.hotWorkCard || null, firstAid: v.firstAid || null, electrical: v.electrical || null, notes: v.notes };
      const id = form.dataset.id;
      if (id) { store.update('people', id, rec); store.audit(ctx.user, 'Edited person', v.name); toast('Saved.', 'ok'); openPerson(id); }
      else { const p = store.insert('people', { ...rec, userId: null, cardNotice: {} }); store.audit(ctx.user, 'Added person', p.name); closeDialog(); toast(`${p.name} added.`, 'ok'); }
      runChecks();
      ctx.refresh();
    },
    wfCheckInSave: (form, v, btn, ctx) => checkIn(v.personId, ctx),
    wfSaveCo(form, v, btn, ctx) {
      const rec = { name: v.name, short: v.short.toUpperCase().slice(0, 3), trade: v.trade, color: v.color, contact: v.contact, phone: v.phone, email: v.email };
      const id = form.dataset.id;
      if (id) store.update('contractors', id, rec);
      else store.insert('contractors', rec);
      store.audit(ctx.user, id ? 'Edited company' : 'Added company', v.name);
      closeDialog();
      toast(`${v.name} saved.`, 'ok');
      ui.tab = 'companies';
      ctx.refresh();
    }
  }
};

function openCompany(c = {}) {
  openDialog({
    title: c.id ? `Edit ${c.name}` : 'Add a company',
    body: `<form id="coForm" data-submit="wfSaveCo" data-id="${c.id || ''}" novalidate>
      <div class="grid-2">
        ${field('Company name', `<input name="name" required maxlength="60" value="${esc(c.name || '')}">`)}
        ${field('Short name', `<input name="short" required maxlength="3" value="${esc(c.short || '')}" placeholder="2–3 letters">`)}
      </div>
      ${field('Trade', `<input name="trade" required maxlength="50" value="${esc(c.trade || '')}">`)}
      <fieldset class="field"><legend class="field-label">Colour on plans and charts</legend>
        <div class="swatches">${COLORS.map(col => `<label class="swatch"><input type="radio" name="color" value="${col}" ${(c.color || COLORS[0]) === col ? 'checked' : ''}><i style="--c:${col}"></i></label>`).join('')}</div></fieldset>
      <div class="grid-3">
        ${field('Contact person', `<input name="contact" maxlength="60" value="${esc(c.contact || '')}">`)}
        ${field('Phone', `<input name="phone" type="tel" maxlength="30" value="${esc(c.phone || '')}">`)}
        ${field('Email', `<input name="email" type="email" maxlength="80" value="${esc(c.email || '')}">`)}
      </div></form>`,
    wide: true,
    footer: `<button type="button" class="btn ghost" data-act="closeDialog">Cancel</button><button class="btn primary" type="submit" form="coForm">Save company</button>`
  });
}
