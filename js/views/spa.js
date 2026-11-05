// SPA (safe plan of action): the task risk assessment the crew reads and signs before starting work.

import * as store from '../store.js';
import { can } from '../auth.js';
import { esc, today, addDays, fmtDay, fmtDayShort, fmtDateTime, fmtTime, nowIso, dayOf, plural, $ } from '../util.js';
import { icon } from '../icons.js';
import { toast, openDialog, closeDialog, confirmBox, badge, contractorTag, contractorOptions, zoneOptions, zoneName, field, options, tabs, emptyState } from '../ui.js';
import { PPE, PERMIT_TYPES, PERMIT_STATUS } from '../domain.js';
import { CONFIG } from '../config.js';
import * as D from '../derive.js';

const ui = { tab: 'today' };
let pad = null;

// ---------- list ----------
function list() {
  const T = today();
  const all = store.all('spas');
  const live = s => s.status !== 'closed' && s.start <= T && s.end >= T;
  const shown = all.filter(s => ui.tab === 'today' ? live(s) : ui.tab === 'upcoming' ? s.status !== 'closed' && s.start > T : ui.tab === 'closed' ? s.status === 'closed' || s.end < T : true)
    .sort((a, b) => b.ref.localeCompare(a.ref));
  return `<div class="toolbar">${tabs([['today', 'In use today', all.filter(live).length], ['upcoming', 'Coming up', null], ['closed', 'Finished', null], ['all', 'All', null]], ui.tab, 'spaTab')}</div>
    ${shown.length ? `<div class="spa-grid">${shown.map(card).join('')}</div>`
      : emptyState('clipboard-pen-line', 'No SPAs here', can('spa.edit') ? 'Every activity needs a safe plan of action before work starts.' : '')}`;
}

function card(s) {
  const a = store.get('activities', s.activityId);
  const crew = a?.crew || 0;
  const signed = D.signaturesOn(s).length;
  const live = s.start <= today() && s.end >= today() && s.status !== 'closed';
  return `<a class="spa-card" href="#/spa/${s.id}">
    <header><span class="g-ref">${s.ref}</span>${s.status === 'closed' ? badge('Closed', 'neutral') : live ? badge(`${signed}/${crew} signed today`, signed >= crew && crew ? 'ok-soft' : signed ? 'warn-soft' : 'danger-soft', 'signature') : badge(`Starts ${fmtDayShort(s.start)}`, 'info-soft')}</header>
    <h3>${esc(s.title)}</h3>
    <p>${contractorTag(s.contractorId)}</p>
    <p class="muted small">${esc(zoneName(s.zoneId))}, ${fmtDayShort(s.start)} to ${fmtDayShort(s.end)}</p>
    <p class="ppe-row">${s.ppe.map(k => `<span title="${esc(PPE.find(p => p.key === k)?.label)}">${icon(PPE.find(p => p.key === k)?.icon || 'shield')}</span>`).join('')}</p>
  </a>`;
}

// ---------- detail ----------
function detail(s) {
  const a = store.get('activities', s.activityId);
  const sigToday = D.signaturesOn(s);
  const earlier = s.signatures.filter(g => dayOf(g.at) !== today()).sort((x, y) => y.at.localeCompare(x.at));
  const permits = D.permitsFor(s.activityId);
  return `<article class="doc">
    <div class="doc-head">
      <div><p class="doc-kind">Safe plan of action</p><h2>${esc(s.title)}</h2></div>
      <div class="doc-ref"><b>${s.ref}</b>${s.status === 'closed' ? badge('Closed', 'neutral') : badge('In use', 'ok-soft')}</div>
    </div>
    <dl class="facts doc-facts">
      <div><dt>Company</dt><dd>${contractorTag(s.contractorId)}</dd></div>
      <div><dt>Where</dt><dd>${esc(zoneName(s.zoneId))}</dd></div>
      <div><dt>Valid</dt><dd>${fmtDay(s.start)} to ${fmtDay(s.end)}</dd></div>
      <div><dt>Prepared by</dt><dd>${esc(s.preparedBy)}, ${fmtDayShort(dayOf(s.preparedAt))}</dd></div>
      <div><dt>Activity</dt><dd>${a ? `${a.ref}, crew of ${a.crew}` : '-'}</dd></div>
      <div><dt>Permits needed</dt><dd>${s.permits.length ? s.permits.map(t => {
        const p = permits.find(x => x.type === t && ['active', 'requested'].includes(D.permitState(x)));
        return `<span class="block">${PERMIT_TYPES[t].label}: ${p ? `<a href="#/permits/${p.id}">${p.ref}</a> ${PERMIT_STATUS[D.permitState(p)].label.toLowerCase()}` : '<span class="danger-text">not issued</span>'}</span>`;
      }).join('') : 'None'}</dd></div>
    </dl>

    <h3 class="doc-section">Steps, hazards and controls</h3>
    <div class="table-wrap"><table class="table steps">
      <thead><tr><th class="num">Step</th><th>What we do</th><th>What could go wrong</th><th>How we stay safe</th></tr></thead>
      <tbody>${s.steps.map((st, i) => `<tr><td class="num">${i + 1}</td><td data-label="What we do">${esc(st.step)}</td><td data-label="What could go wrong">${esc(st.hazards)}</td><td data-label="How we stay safe">${esc(st.controls)}</td></tr>`).join('')}</tbody>
    </table></div>

    <div class="doc-two">
      <section><h3 class="doc-section">Protective equipment</h3>
        <ul class="ppe-list">${s.ppe.map(k => { const p = PPE.find(x => x.key === k); return `<li>${icon(p?.icon || 'shield')}${esc(p?.label || k)}</li>`; }).join('')}</ul></section>
      <section><h3 class="doc-section">If something goes wrong</h3><p>${esc(s.emergency)}</p></section>
    </div>

    <h3 class="doc-section">Crew sign-on ${fmtDayShort(today())}</h3>
    ${sigToday.length ? `<ul class="sig-list">${sigToday.map(sigItem).join('')}</ul>` : '<p class="muted">Nobody has signed today. Everyone in the crew signs before starting.</p>'}
    ${earlier.length ? `<details class="earlier"><summary>Earlier sign-ons (${earlier.length})</summary><ul class="sig-list">${earlier.map(sigItem).join('')}</ul></details>` : ''}
  </article>`;
}

const sigItem = g => {
  const p = store.get('people', g.personId);
  const company = store.get('contractors', p?.contractorId)?.name;
  const when = dayOf(g.at) === today() ? `signed at ${fmtTime(g.at)}` : `signed ${fmtDateTime(g.at)}`;
  return `<li>${g.image ? `<img src="${g.image}" alt="Signature of ${esc(g.name)}">` : `<span class="sig-typed">${esc(g.name)}</span>`}
    <div><b>${esc(g.name)}</b><small>${company ? `${esc(company)}, ` : ''}${when}</small></div></li>`;
};

// ---------- form ----------
function stepRow(st = {}) {
  return `<div class="step-row">
    <span class="step-num" aria-hidden="true"></span>
    <textarea name="step" rows="2" maxlength="200" placeholder="What we do" required>${esc(st.step || '')}</textarea>
    <textarea name="hazards" rows="2" maxlength="200" placeholder="What could go wrong">${esc(st.hazards || '')}</textarea>
    <textarea name="controls" rows="2" maxlength="300" placeholder="How we stay safe">${esc(st.controls || '')}</textarea>
    <button type="button" class="icon-btn" data-act="spaRemoveStep" aria-label="Remove step">${icon('x')}</button>
  </div>`;
}

function formHtml(s, activityId) {
  const a = store.get('activities', s?.activityId || activityId);
  const acts = store.all('activities').filter(x => x.status !== 'done' && (!D.spaForActivity(x.id) || x.id === s?.activityId));
  const defaultEmergency = `Call 112, then the site manager. Assembly point: ${CONFIG.site.assemblyPoint.toLowerCase()}. First aid: ${CONFIG.site.firstAidPoint}.`;
  const permitDefaults = s?.permits || (a?.hazards || []).map(h => ({ hotwork: 'hotwork', excavation: 'excavation', height: 'height', lifting: 'lifting', electrical: 'electrical' })[h]).filter(Boolean);
  return `<form id="spaForm" data-submit="spaSave" data-id="${s?.id || ''}" novalidate class="panel form-page">
    <div class="panel-body">
      ${field('Activity', `<select name="activityId" required data-change="spaActivity">${options(acts.map(x => [x.id, `${x.ref} ${x.title}`]), s?.activityId || activityId, { blank: 'Choose the activity' })}</select>`)}
      ${field('Title', `<input name="title" required maxlength="80" value="${esc(s?.title || a?.title || '')}">`)}
      <div class="grid-2">
        ${field('Company', `<select name="contractorId" required>${contractorOptions(s?.contractorId || a?.contractorId)}</select>`)}
        ${field('Where', `<select name="zoneId" required>${zoneOptions(s?.zoneId || a?.zoneId)}</select>`)}
      </div>
      <div class="grid-2">
        ${field('From', `<input type="date" name="start" required value="${s?.start || a?.start || today()}">`)}
        ${field('Until', `<input type="date" name="end" required value="${s?.end || a?.end || addDays(today(), 5)}">`)}
      </div>
      <fieldset class="field"><legend class="field-label">Steps, in the order they are done</legend>
        <div class="step-head" aria-hidden="true"><span></span><span>What we do</span><span>What could go wrong</span><span>How we stay safe</span><span></span></div>
        <div id="steps" class="steps-edit">${(s?.steps?.length ? s.steps : [{}, {}]).map(stepRow).join('')}</div>
        <button type="button" class="btn ghost sm" data-act="spaAddStep">${icon('plus')}Add step</button>
      </fieldset>
      <fieldset class="field"><legend class="field-label">Protective equipment</legend>
        <div class="chips">${PPE.map(p => `<label class="chip-check"><input type="checkbox" name="ppe" value="${p.key}" ${(s?.ppe || ['helmet', 'hivis', 'boots', 'gloves']).includes(p.key) ? 'checked' : ''}><span>${icon(p.icon)}${esc(p.label)}</span></label>`).join('')}</div></fieldset>
      <fieldset class="field"><legend class="field-label">Permits needed</legend>
        <div class="chips">${Object.entries(PERMIT_TYPES).map(([k, t]) => `<label class="chip-check"><input type="checkbox" name="permits" value="${k}" ${permitDefaults.includes(k) ? 'checked' : ''}><span>${icon(t.icon)}${esc(t.label)}</span></label>`).join('')}</div></fieldset>
      ${field('If something goes wrong', `<textarea name="emergency" rows="2" maxlength="400">${esc(s?.emergency || defaultEmergency)}</textarea>`)}
    </div>
    <footer class="panel-foot">
      <a class="btn ghost" href="${s ? `#/spa/${s.id}` : '#/spa'}">Cancel</a>
      <button class="btn primary" type="submit">${icon('check')}${s ? 'Save changes' : 'Save SPA'}</button>
    </footer>
  </form>`;
}

// ---------- signature pad ----------
function setupPad(canvas) {
  const ctx2 = canvas.getContext('2d');
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * ratio;
  canvas.height = rect.height * ratio;
  ctx2.scale(ratio, ratio);
  ctx2.lineWidth = 2.2; ctx2.lineCap = 'round'; ctx2.lineJoin = 'round'; ctx2.strokeStyle = '#13263a';
  let drawing = false, last = null, inked = false;
  const pt = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  canvas.addEventListener('pointerdown', e => { drawing = true; last = pt(e); canvas.setPointerCapture(e.pointerId); e.preventDefault(); });
  canvas.addEventListener('pointermove', e => {
    if (!drawing) return;
    const p = pt(e);
    ctx2.beginPath(); ctx2.moveTo(...last);
    ctx2.quadraticCurveTo(last[0], last[1], (last[0] + p[0]) / 2, (last[1] + p[1]) / 2);
    ctx2.lineTo(...p); ctx2.stroke();
    last = p; inked = true;
    canvas.closest('.sig-pad')?.classList.add('inked');
  });
  const end = () => { drawing = false; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  return {
    get inked() { return inked; },
    clear() { ctx2.clearRect(0, 0, canvas.width, canvas.height); inked = false; canvas.closest('.sig-pad')?.classList.remove('inked'); },
    image() {
      const out = document.createElement('canvas');
      out.width = 300; out.height = 100;
      out.getContext('2d').drawImage(canvas, 0, 0, out.width, out.height);
      return out.toDataURL('image/png');
    }
  };
}

function openSign(s, user) {
  const me = D.personForUser(user);
  const lead = can('spa.edit');
  const a = store.get('activities', s.activityId);
  // leads can sign people on with the tablet at the meeting; workers sign for themselves
  const crew = store.all('people').filter(p => p.contractorId === s.contractorId && !D.hasSignedToday(s, p.id));
  openDialog({
    title: `Sign ${s.ref}`, label: s.title,
    body: `<form id="signForm" data-submit="spaSign" data-id="${s.id}" novalidate>
      ${lead && crew.length ? field('Who is signing', `<select name="personId" required>${options(crew.map(p => [p.id, p.name]), me && crew.some(c => c.id === me.id) ? me.id : '', { blank: 'Choose a person' })}</select>`)
        : `<input type="hidden" name="personId" value="${me?.id || ''}"><p class="lead">Signing as <b>${esc(user.name)}</b></p>`}
      <label class="check big"><input type="checkbox" name="agree" required> I have read this SPA, I understand the hazards and controls, and I will stop work if things change.</label>
      <div class="field"><span class="field-label">Signature</span>
        <div class="sig-pad"><canvas id="sigCanvas" aria-label="Signature pad. Draw your signature with a finger or mouse."></canvas>
          <span class="sig-hint">Sign here</span>
          <button type="button" class="link-btn" data-act="spaClearSig">Clear</button></div></div>
      ${a && D.signaturesOn(s).length >= a.crew ? '<p class="muted small">The whole planned crew has already signed today.</p>' : ''}
    </form>`,
    footer: `<button type="button" class="btn ghost" data-act="closeDialog">Cancel</button><button class="btn primary" type="submit" form="signForm">${icon('signature')}Sign</button>`
  });
  pad = setupPad($('#sigCanvas'));
}

export default {
  meta: {
    key: 'spa', label: 'SPA', icon: 'clipboard-pen-line',
    badge: () => D.activitiesOn(today()).filter(a => a.status === 'active').map(a => D.spaForActivity(a.id)).filter(s => !s || !D.signaturesOn(s).length).length
  },

  header(ctx) {
    const [p0, p1] = ctx.route.params;
    if (p0 === 'new' || p0 === 'edit') return { title: p0 === 'new' ? 'New safe plan of action' : 'Edit safe plan of action', sub: 'The crew reads and signs it before starting work' };
    const s = p0 && store.get('spas', p0);
    if (s) {
      const signedToday = D.hasSignedToday(s, D.personForUser(ctx.user)?.id);
      return {
        title: `${s.ref}`, sub: s.title,
        actions: `<a class="btn ghost" href="#/spa">${icon('arrow-left')}<span>All SPAs</span></a>
          <button type="button" class="btn ghost" data-act="print">${icon('printer')}<span>Print</span></button>
          ${can('spa.edit') && s.status !== 'closed' ? `<a class="btn ghost" href="#/spa/edit/${s.id}">${icon('pencil')}<span>Edit</span></a>
            <button type="button" class="btn ghost" data-act="spaCloseOut" data-id="${s.id}">Close SPA</button>` : ''}
          ${can('spa.sign') && s.status !== 'closed' ? `<button type="button" class="btn primary" data-act="spaOpenSign" data-id="${s.id}" ${!can('spa.edit') && signedToday ? 'disabled' : ''}>${icon('signature')}<span>${!can('spa.edit') && signedToday ? 'Signed today' : 'Sign'}</span></button>` : ''}`
      };
    }
    return {
      title: 'Safe plans of action',
      sub: 'Task risk assessments signed by the crew every morning',
      actions: can('spa.edit') ? `<a class="btn primary" href="#/spa/new">${icon('plus')}<span>New SPA</span></a>` : ''
    };
  },

  render(ctx) {
    const [p0, p1] = ctx.route.params;
    if (p0 === 'new') return can('spa.edit') ? formHtml(null, p1) : emptyState('lock', 'Only supervisors and site leads write SPAs');
    if (p0 === 'edit') { const s = store.get('spas', p1); return s && can('spa.edit') ? formHtml(s) : emptyState('clipboard-pen-line', 'SPA not found'); }
    if (p0) { const s = store.get('spas', p0); return s ? detail(s) : emptyState('clipboard-pen-line', 'SPA not found', '', '<a class="btn ghost" href="#/spa">All SPAs</a>'); }
    return `<div id="spaList">${list()}</div>`;
  },

  update(ctx) {
    const el = document.getElementById('spaList');
    if (el) el.innerHTML = list();
    else document.getElementById('view').innerHTML = this.render(ctx);
  },

  actions: {
    spaTab: (el, ctx) => { ui.tab = el.dataset.key; ctx.refresh(); },
    spaAddStep() {
      document.getElementById('steps').insertAdjacentHTML('beforeend', stepRow());
      document.querySelector('#steps .step-row:last-child textarea').focus();
    },
    spaRemoveStep(el) {
      const rows = document.querySelectorAll('#steps .step-row');
      if (rows.length <= 1) return toast('An SPA needs at least one step.', 'err');
      el.closest('.step-row').remove();
    },
    spaOpenSign(el, ctx) { openSign(store.get('spas', el.dataset.id), ctx.user); },
    spaClearSig: () => pad?.clear(),
    async spaCloseOut(el, ctx) {
      const s = store.get('spas', el.dataset.id);
      if (!(await confirmBox({ title: `Close ${s.ref}?`, text: 'Close it when the work is finished. It stays in the records but nobody can sign it any more.', ok: 'Close SPA' }))) return;
      store.update('spas', s.id, { status: 'closed', closedAt: nowIso(), closedBy: ctx.user.name });
      store.audit(ctx.user, 'Closed SPA', s.ref);
      toast(`${s.ref} closed.`, 'ok');
      ctx.go(`#/spa/${s.id}`);
    }
  },

  changes: {
    spaActivity(el) {
      const a = store.get('activities', el.value);
      const f = el.form;
      if (!a || !f) return;
      if (!f.title.value) f.title.value = a.title;
      f.contractorId.value = a.contractorId; f.zoneId.value = a.zoneId; f.start.value = a.start; f.end.value = a.end;
    }
  },

  submits: {
    spaSave(form, v, btn, ctx) {
      const rows = [...form.querySelectorAll('.step-row')].map(r => ({
        step: r.querySelector('[name=step]').value.trim(), hazards: r.querySelector('[name=hazards]').value.trim(), controls: r.querySelector('[name=controls]').value.trim()
      })).filter(r => r.step);
      if (!rows.length) return toast('Add at least one step.', 'err');
      if (rows.some(r => !r.controls)) return toast('Every step needs a control: how you stay safe.', 'err');
      if (v.end < v.start) return toast('The end date is before the start date.', 'err');
      const rec = { activityId: v.activityId, title: v.title, contractorId: v.contractorId, zoneId: v.zoneId, start: v.start, end: v.end,
        steps: rows, ppe: v.ppe || [], permits: v.permits || [], emergency: v.emergency };
      const id = form.dataset.id;
      let s;
      if (id) { s = store.update('spas', id, rec); store.audit(ctx.user, 'Edited SPA', s.ref); toast('SPA saved.', 'ok'); }
      else {
        s = store.insert('spas', { ref: store.nextRef('SPA'), ...rec, preparedBy: ctx.user.name, preparedAt: nowIso(), status: 'active', signatures: [] });
        store.audit(ctx.user, 'Wrote SPA', s.ref);
        toast(`${s.ref} saved. The crew can sign it now.`, 'ok');
      }
      ctx.go(`#/spa/${s.id}`);
    },
    spaSign(form, v, btn, ctx) {
      const s = store.get('spas', form.dataset.id);
      if (!v.agree) return toast('Tick the box to confirm you have read the SPA.', 'err');
      if (!pad?.inked) return toast('Draw your signature in the box.', 'err');
      const person = v.personId ? store.get('people', v.personId) : null;
      const name = person?.name || ctx.user.name;
      if (person && D.hasSignedToday(s, person.id)) return toast(`${name} has already signed today.`, 'err');
      store.update('spas', s.id, { signatures: [...s.signatures, { id: 'sg-' + Date.now(), personId: person?.id || null, name, at: nowIso(), image: pad.image(), by: ctx.user.name }] });
      store.audit(ctx.user, 'Signed SPA', `${s.ref} for ${name}`);
      closeDialog();
      toast(`${name} signed ${s.ref}.`, 'ok');
      ctx.go(`#/spa/${s.id}`);
    }
  }
};
