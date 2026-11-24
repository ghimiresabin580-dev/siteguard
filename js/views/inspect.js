// Inspections: start a checklist, see site checks, and look back at finished inspections.

import * as store from '../store.js';
import * as C from '../checklists.js';
import * as H from '../hazards.js';
import { can } from '../auth.js';
import { esc, timeAgo, fmtStamp, isoWeek, today, addDays, dayOf } from '../util.js';
import { icon } from '../icons.js';
import { toast, options, openDialog } from '../ui.js';
import { savePhoto, hydratePhotos } from '../photos.js';
import { trIndex } from '../domain.js';
import * as D from '../derive.js';
import { notify } from '../monitor.js';

const CATEGORY = { scaffold: 'height', ladder: 'height', ppe: 'ppe', excavation: 'height', fire: 'fire', electrical: 'electrical', housekeeping: 'housekeeping', plant: 'vehicles' };
const GRADE_TEXT = { good: 'Good', fair: 'Needs attention', poor: 'Unsafe', none: 'No score' };

let run = null;   // { tpl, answers: { k: { r, note, photo } }, zoneId, notes, raise }

const places = () => store.all('items').filter(i => [0, 1, 5].includes(i.type)).map(i => [i.id, i.name]).sort((a, b) => a[1].localeCompare(b[1]));

export function ring(value, size = 64, stroke = 7) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const g = C.grade(value);
  const len = value == null ? 0 : (value / 100) * c;
  return `<svg class="ring g-${g}" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${value == null ? 'No score' : value + ' percent'}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}" class="ring-bg"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}" class="ring-fg" stroke-linecap="round"
      stroke-dasharray="${len.toFixed(2)} ${(c - len).toFixed(2)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central">${value == null ? '–' : value + '%'}</text></svg>`;
}

const scorePill = s => `<span class="score-pill g-${C.grade(s)}">${s == null ? '–' : s + '%'}</span>`;

// ---------- hub ----------
function siteChecks() {
  if (!can('check.do') && !can('lift.do') && !can('tr.do')) return '';
  const items = store.all('items');
  const cutoff = Date.now() - 12 * 3600e3;
  const walked = items.filter(i => i.lastCheckedAt && Date.parse(i.lastCheckedAt) > cutoff).length;
  const problems = items.filter(i => i.status === 2).length;
  const lift = store.all('lifts').slice().sort((a, b) => b.at.localeCompare(a.at))[0];
  const trWeek = D.trThisWeek();
  const tr = trWeek ? trIndex(trWeek.scores) : null;
  const row = (href, ic, title, sub, side) => `<a class="sc-row" href="${href}">
      <span class="sc-ic">${icon(ic)}</span>
      <span class="sc-text"><b>${title}</b><small>${sub}</small></span>${side}<span class="m-go">${icon('chevron-right')}</span></a>`;
  return `<h2 class="sec-title">Site checks</h2>
    <div class="m-card sc-list">
      ${row('#/checks', 'footprints', 'Daily site walk', `${walked} of ${items.length} areas checked this shift${problems ? `, ${problems} with a problem` : ''}`,
        `<span class="mini-bar" aria-hidden="true"><i style="width:${items.length ? Math.round(100 * walked / items.length) : 0}%"></i></span>`)}
      ${row('#/checks/lifts', 'anchor', 'Lift checks', lift ? `Last lift ${timeAgo(lift.at)}: ${esc(lift.load)}` : 'No lifts recorded yet', '')}
      ${row('#/checks/tr', 'gauge', `TR measurement, week ${isoWeek(today())}`, tr == null ? 'Not measured this week' : `Measured by ${esc(trWeek.by)}`, tr == null ? '' : scorePill(tr))}
    </div>`;
}

function hub() {
  C.ensureDemo();
  const list = C.all();
  const week = list.filter(i => dayOf(i.createdAt) > addDays(today(), -7));
  const scores = week.map(i => i.score).filter(s => s != null);
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const failed = week.reduce((n, i) => n + Object.values(i.answers).filter(a => a.r === 'fail').length, 0);
  return `
    <section class="m-card insp-sum">
      ${ring(avg, 76, 8)}
      <div class="insp-sum-text">
        <b>${week.length ? `${week.length} inspection${week.length === 1 ? '' : 's'} this week` : 'No inspections this week'}</b>
        <small>${avg == null ? 'Run a checklist to get a safety score.' : `Average score ${avg}%. ${failed ? `${failed} item${failed === 1 ? '' : 's'} failed.` : 'Nothing failed.'}`}</small>
      </div>
    </section>

    <h2 class="sec-title">Start an inspection</h2>
    <div class="tpl-grid">${C.TEMPLATES.map(t => {
      const last = C.lastFor(t.key);
      return `<a class="tpl" href="#/inspections/run/${t.key}">
        <span class="tpl-ic t-${t.tone}">${icon(t.icon)}</span>
        <b>${t.title}</b>
        <small>${esc(t.every)}</small>
        <em>${t.items.length} checks, ${last ? `last done ${timeAgo(last.createdAt)}` : 'not done yet'}</em>
      </a>`;
    }).join('')}</div>

    ${siteChecks()}

    <h2 class="sec-title">Recent inspections</h2>
    <div class="m-card list">${list.length ? list.slice(0, 12).map(i => {
      const t = C.template(i.template);
      const fails = Object.values(i.answers).filter(a => a.r === 'fail').length;
      return `<button type="button" class="h-row" data-act="inspOpen" data-id="${i.id}">
        <span class="thumb thumb-ic tint-${C.grade(i.score)}">${icon(t?.icon || 'clipboard-check')}</span>
        <span class="h-main"><b>${esc(t?.title || 'Inspection')}${i.zoneId ? `, ${esc(store.get('items', i.zoneId)?.name || '')}` : ''}</b>
          <small>${H.when(i)} by ${esc(i.by)}</small>
          <small class="${fails ? 'txt-bad' : 'txt-ok'}">${fails ? `${fails} failed` : 'All passed'}</small></span>
        ${scorePill(i.score)}
        <span class="h-go">${icon('chevron-right')}</span></button>`;
    }).join('') : '<p class="m-empty">Finished inspections appear here.</p>'}</div>`;
}

// ---------- running a checklist ----------
function answered() { return Object.values(run.answers).filter(a => a.r).length; }

function progressHtml() {
  const n = run.tpl.items.length, done = answered();
  const s = C.score(run.answers);
  return `<div class="run-prog-row"><span><b>${done}</b> of ${n} answered</span>${s == null ? '' : scorePill(s)}</div>
    <span class="run-bar"><i style="width:${(100 * done / n).toFixed(1)}%"></i></span>`;
}

function itemHtml(k) {
  const it = run.tpl.items[k];
  const a = run.answers[k] || {};
  const btn = (r, label, ic) => `<button type="button" class="ans ans-${r} ${a.r === r ? 'on' : ''}" data-act="inspAnswer" data-k="${k}" data-r="${r}" aria-pressed="${a.r === r}">${icon(ic)}${label}</button>`;
  return `<li class="ck ${a.r ? 'is-' + a.r : ''}" id="ck${k}">
    <p class="ck-q"><span class="ck-n">${k + 1}</span><span>${esc(it.t)}${it.critical ? '<em class="crit">Critical</em>' : ''}</span></p>
    <div class="ans-row" role="group" aria-label="Answer for check ${k + 1}">
      ${btn('pass', 'Pass', 'check')}${btn('fail', 'Fail', 'x')}${btn('na', 'N/A', 'circle-dot')}
    </div>
    ${a.r === 'fail' ? `<div class="ck-fail">
      <textarea rows="2" maxlength="300" placeholder="What is wrong?" data-change="inspNote" data-live data-k="${k}" aria-label="What is wrong with check ${k + 1}">${esc(a.note || '')}</textarea>
      ${a.photo ? `<span class="ph-tile sm"><img data-photo="${a.photo}" alt="Photo for check ${k + 1}">
        <button type="button" class="ph-x" data-act="inspPhotoRemove" data-k="${k}" aria-label="Remove photo">${icon('x')}</button></span>`
        : `<label class="ph-tile sm ph-add">${icon('camera')}<span>Photo</span><input type="file" accept="image/*" capture="environment" hidden data-change="inspPhoto" data-k="${k}"></label>`}
    </div>` : ''}
  </li>`;
}

function runHtml() {
  const t = run.tpl;
  return `<div class="run">
    <header class="run-head m-card">
      <span class="tpl-ic lg t-${t.tone}">${icon(t.icon)}</span>
      <div><b>${t.title} inspection</b><small>${t.items.length} checks. ${esc(t.every)}.</small></div>
    </header>
    <div class="run-prog" id="runProg">${progressHtml()}</div>
    <label class="m-field"><span>Location</span><span class="sel-ic">${icon('map-pin')}</span>
      <select class="with-ic" data-change="inspZone">${options(places(), run.zoneId || '', { blank: 'Whole site' })}</select></label>
    <ol class="ck-list" id="ckList">${t.items.map((_, k) => itemHtml(k)).join('')}</ol>
    <label class="m-field"><span>Notes (optional)</span>
      <textarea rows="2" maxlength="400" data-change="inspNotes" data-live placeholder="Anything else the next person should know">${esc(run.notes || '')}</textarea></label>
    ${can('obs.create') ? `<label class="m-check"><input type="checkbox" data-change="inspRaise" ${run.raise ? 'checked' : ''}>
      <span><b>Report failed checks as hazards</b><small>Each failed check goes to View Reports so it gets fixed.</small></span></label>` : ''}
    <button type="button" class="m-btn" data-act="inspFinish">${icon('clipboard-check')}Finish inspection</button>
  </div>`;
}

function refreshItem(k) {
  const li = document.getElementById(`ck${k}`);
  if (li) { li.outerHTML = itemHtml(k); hydratePhotos(document.getElementById(`ck${k}`)); }
  document.getElementById('runProg').innerHTML = progressHtml();
}

// ---------- finished inspection ----------
function detail(i) {
  const t = C.template(i.template);
  const vals = Object.values(i.answers);
  const count = r => vals.filter(a => a.r === r).length;
  return `<div class="insp-detail">
    <div class="insp-sum flat">${ring(i.score, 84, 9)}
      <div class="insp-sum-text"><b>${GRADE_TEXT[C.grade(i.score)]}</b>
        <small>${count('pass')} passed, ${count('fail')} failed, ${count('na')} not applicable</small></div></div>
    <dl class="m-facts">
      <div><dt>Location</dt><dd>${esc(store.get('items', i.zoneId)?.name || 'Whole site')}</dd></div>
      <div><dt>Inspected by</dt><dd>${esc(i.by)}</dd></div>
      <div><dt>When</dt><dd>${fmtStamp(i.createdAt)}</dd></div>
    </dl>
    <ol class="res-list">${(t?.items || []).map((it, k) => {
      const a = i.answers[k] || {};
      return `<li class="res res-${a.r || 'na'}"><span class="res-ic">${icon(a.r === 'pass' ? 'check' : a.r === 'fail' ? 'x' : 'circle-dot')}</span>
        <div><p>${esc(it.t)}</p>${a.note ? `<small>${esc(a.note)}</small>` : ''}${a.photo ? `<img class="res-ph" data-photo="${a.photo}" alt="">` : ''}</div></li>`;
    }).join('')}</ol>
    ${i.notes ? `<p class="m-note">${esc(i.notes)}</p>` : ''}
    ${i.hazards?.length ? `<p class="m-note">Reported as hazards: ${i.hazards.map(id => { const o = store.get('observations', id); return o ? `<a href="#/hazards/${o.id}" data-act="closeDialog">${esc(o.ref)}</a>` : ''; }).join(', ')}</p>` : ''}
  </div>`;
}

function openInspection(id) {
  const i = store.get('inspections', id);
  if (!i) return toast('That inspection was not found.', 'err');
  const t = C.template(i.template);
  openDialog({ title: `${esc(t?.title || 'Inspection')} inspection`, label: esc(i.ref), body: detail(i), panel: true });
  hydratePhotos(document.getElementById('dlg'));
}

export default {
  meta: { key: 'inspections', label: 'Inspections', icon: 'clipboard-check' },
  header: ctx => {
    const t = ctx.route.params[0] === 'run' && C.template(ctx.route.params[1]);
    return { title: t ? `${t.title} Inspection` : 'Inspections' };
  },

  render(ctx) {
    const [mode, key] = ctx.route.params;
    if (mode === 'run') {
      const tpl = C.template(key);
      if (!tpl) { history.replaceState(null, '', '#/inspections'); return hub(); }
      if (!run || run.tpl.key !== key) run = { tpl, answers: {}, zoneId: '', notes: '', raise: true };
      return runHtml();
    }
    return `<div id="inspHub">${hub()}</div>`;
  },
  mount: (ctx, root) => hydratePhotos(root),
  update(ctx) {
    const el = document.getElementById('inspHub');
    if (el) el.innerHTML = hub();
  },

  actions: {
    inspOpen: el => openInspection(el.dataset.id),
    inspAnswer(el) {
      const k = +el.dataset.k;
      const prev = run.answers[k] || {};
      run.answers[k] = { ...prev, r: prev.r === el.dataset.r ? null : el.dataset.r };
      refreshItem(k);
      if (run.answers[k].r === 'fail') document.querySelector(`#ck${k} textarea`)?.focus();
    },
    inspPhotoRemove(el) { const k = +el.dataset.k; delete run.answers[k].photo; refreshItem(k); },
    async inspFinish(el, ctx) {
      const left = run.tpl.items.length - answered();
      if (left) {
        const first = run.tpl.items.findIndex((_, k) => !run.answers[k]?.r);
        document.getElementById(`ck${first}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return toast(`Answer every check first. ${left} left.`, 'err');
      }
      const user = ctx.user;
      el.disabled = true;
      const answers = Object.fromEntries(Object.entries(run.answers).map(([k, a]) => [k, { r: a.r, note: a.note || '', photo: a.photo || null }]));
      const rec = store.insert('inspections', {
        ref: store.nextRef('INS'), template: run.tpl.key, zoneId: run.zoneId || null, by: user.name, byId: user.id,
        answers, score: C.score(answers), notes: run.notes || '', hazards: []
      });
      const hazards = [];
      if (run.raise && can('obs.create', user)) {
        run.tpl.items.forEach((it, k) => {
          const a = answers[k];
          if (a.r !== 'fail') return;
          const o = store.insert('observations', {
            ref: store.nextRef('DWB'), type: 'hazard', title: a.note.trim() ? a.note.trim().slice(0, 80) : `Failed ${run.tpl.title.toLowerCase()} check: ${it.t.charAt(0).toLowerCase()}${it.t.slice(1)}`,
            category: CATEGORY[run.tpl.key], severity: it.critical ? 'high' : 'medium', zoneId: rec.zoneId,
            description: `Failed in ${run.tpl.title.toLowerCase()} inspection ${rec.ref}: ${it.t}.${a.note ? ` ${a.note}` : ''}`, action: '',
            reportedBy: user.name, reportedById: user.id, status: 'open', contractorId: null, due: null, assignedAt: null, assignedBy: null,
            closedAt: null, closedBy: null, closeNote: '', photos: a.photo ? [a.photo] : [], closePhoto: null, lat: null, lon: null, inspectionId: rec.id
          }, { front: true });
          hazards.push(o.id);
          if (it.critical) notify('observation', `High risk hazard ${o.ref}`, `${H.where(o)}: ${H.title(o)}`, `#/hazards/${o.id}`);
        });
        if (hazards.length) store.update('inspections', rec.id, { hazards });
      }
      store.audit(user, 'Finished inspection', `${rec.ref} ${run.tpl.title}, ${rec.score ?? '–'} %`);
      run = null;
      toast(`${rec.ref} saved${hazards.length ? `, ${hazards.length} hazard${hazards.length === 1 ? '' : 's'} reported` : ''}.`, 'ok', 5000);
      ctx.go('#/inspections');
      setTimeout(() => openInspection(rec.id), 250);
    }
  },

  changes: {
    inspNote(el) { run.answers[+el.dataset.k].note = el.value; },
    inspNotes(el) { run.notes = el.value; },
    inspZone(el) { run.zoneId = el.value; },
    inspRaise(el) { run.raise = el.checked; },
    async inspPhoto(el) {
      const k = +el.dataset.k;
      if (!el.files[0]) return;
      try { run.answers[k].photo = await savePhoto(el.files[0]); refreshItem(k); } catch (e) { toast(e.message, 'err'); }
    }
  }
};

