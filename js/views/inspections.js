// Inspections: the daily site walk, lift checks against live wind, and the weekly TR measurement.

import * as store from '../store.js';
import { can } from '../auth.js';
import { esc, today, timeAgo, fmtDateTime, fmtDay, fmtDayShort, nowIso, isoWeek, weekStart, plural } from '../util.js';
import { icon } from '../icons.js';
import { toast, badge, field, options, tabs, progress, emptyState, busy } from '../ui.js';
import { ITEM_TYPES, CHECK_STATUS, TR_AREAS, trIndex } from '../domain.js';
import { getWeather, cachedWeather, workdayGust } from '../weather.js';
import { savePhoto, hydratePhotos } from '../photos.js';
import { lineChart } from '../charts.js';
import * as D from '../derive.js';
import observations from './observations.js';

const TABS = [['walk', 'Daily site walk'], ['lifts', 'Lift checks'], ['tr', 'TR measurement']];
let tally = null;          // TR counts while measuring
const walkPhotos = {};     // itemId -> photo id waiting for OK/Problem

const statusBadge = i => badge(CHECK_STATUS[i.status].label, CHECK_STATUS[i.status].tone === 'ok' ? 'ok-soft' : CHECK_STATUS[i.status].tone === 'danger' ? 'danger-soft' : 'neutral');

// ---------- site walk ----------
function walk() {
  const items = store.all('items');
  const cutoff = Date.now() - 12 * 3600e3;
  const done = items.filter(i => i.lastCheckedAt && Date.parse(i.lastCheckedAt) > cutoff).length;
  const log = store.all('checks').slice().sort((a, b) => b.at.localeCompare(a.at)).slice(0, 12);
  const edit = can('check.do');
  return `<div class="two-col">
    <section class="panel">
      <header class="panel-head"><h2>Walk the site</h2><span class="muted small">${done} of ${items.length} checked this shift</span></header>
      <div class="panel-body tight">${progress(done, items.length, done === items.length ? 'ok' : '')}</div>
      <ul class="walk">${items.map(i => {
        const fresh = i.lastCheckedAt && Date.parse(i.lastCheckedAt) > cutoff;
        return `<li class="${fresh ? 'done' : ''}">
          <div class="walk-name"><b>${esc(i.name)}</b><small>${ITEM_TYPES[i.type]}, ${i.lastCheckedAt ? `checked ${timeAgo(i.lastCheckedAt)}` : 'never checked'}</small></div>
          ${statusBadge(i)}
          ${edit ? `<div class="walk-act">
            <label class="icon-btn ${walkPhotos[i.id] ? 'has' : ''}" title="Add a photo">${icon('camera')}<input type="file" accept="image/*" capture="environment" hidden data-change="walkPhoto" data-id="${i.id}"></label>
            <button type="button" class="btn sm ok" data-act="walkMark" data-id="${i.id}" data-result="1">OK</button>
            <button type="button" class="btn sm danger" data-act="walkMark" data-id="${i.id}" data-result="2">Problem</button></div>` : ''}
        </li>`;
      }).join('')}</ul>
    </section>
    <section class="panel">
      <header class="panel-head"><h2>Latest checks</h2></header>
      ${log.length ? `<ul class="feed">${log.map(c => `<li>${icon(c.result === 1 ? 'circle-check' : 'triangle-exclamation-point')}
        <p><b>${esc(store.get('items', c.itemId)?.name || 'Removed item')}</b> ${c.result === 1 ? 'OK' : 'problem'} <span class="muted">by ${esc(c.by)}</span>
        ${c.photo ? `<img class="thumb" data-photo="${c.photo}" alt="">` : ''}</p><time>${timeAgo(c.at)}</time></li>`).join('')}</ul>`
        : '<p class="panel-body muted">No checks yet.</p>'}
    </section>
  </div>`;
}

// ---------- lifts ----------
function lifts() {
  const w = cachedWeather();
  const limit = store.settings().windLimit;
  const gust = w?.now?.gust ?? null;
  const tooWindy = gust != null && gust >= limit;
  const areas = store.all('items').filter(i => i.type === 5);
  const hours = (w?.hours || []).filter(h => h.time.startsWith(w.today.date) && +h.time.slice(11, 13) >= 7 && +h.time.slice(11, 13) <= 17);
  const rec = store.all('lifts').slice().sort((a, b) => b.at.localeCompare(a.at)).slice(0, 15);
  const nowHour = new Date().getHours();
  const overLater = hours.filter(h => +h.time.slice(11, 13) >= nowHour && h.gust >= limit);
  const edit = can('lift.do');
  return `<div class="two-col">
    <section class="panel">
      <header class="panel-head"><h2>Before the lift</h2></header>
      ${edit ? `<form id="liftForm" data-submit="liftSave" class="panel-body" novalidate>
        <div class="grid-2">
          ${field('Lift area', `<select name="areaId" required>${options(areas.map(a => [a.id, a.name]), areas[0]?.id)}</select>`)}
          ${field('Load weight (t)', '<input type="number" name="weight" step="0.1" min="0.1" max="60" required placeholder="4.2">')}
        </div>
        ${field('Load', '<input name="load" required maxlength="80" placeholder="For example: steel beams, bundle of 6">')}
        <ul class="checklist">
          ${[['plan', 'Lift plan checked and the load is within the crane chart'], ['zone', 'Lift area clear of people and vehicles'], ['radio', 'Radio check done with the signaller'], ['gear', 'Slings and shackles inspected']]
            .map(([k, t]) => `<li><label class="check"><input type="checkbox" name="${k}" required><span>${t}</span></label></li>`).join('')}
        </ul>
        <div class="wind-check ${gust == null ? 'unknown' : tooWindy ? 'bad' : 'good'}">
          ${icon('wind')}<div><b>${gust == null ? 'Wind not available' : `Gusts ${gust.toFixed(1)} m/s now`}</b>
          <span>${gust == null ? 'Read the crane anemometer and confirm below.' : tooWindy ? `Above the ${limit} m/s limit. Do not lift.` : `Below the ${limit} m/s limit.`}</span>
          ${!tooWindy && overLater.length ? `<span class="wind-later">Forecast: gusts over the limit around ${overLater.map(h => h.time.slice(11, 13)).join(', ')}:00. Plan heavy lifts outside those hours.</span>` : ''}</div></div>
        ${gust == null ? `<label class="check"><input type="checkbox" name="windManual" required><span>Wind checked on the crane anemometer and below ${limit} m/s</span></label>` : ''}
        ${field('Notes (optional)', '<input name="notes" maxlength="200" placeholder="From where to where">')}
        <button class="btn primary block" type="submit" ${tooWindy ? 'disabled' : ''}>${icon('anchor')}Record lift</button>
      </form>` : '<p class="panel-body muted">Lift checks are recorded by the crane crew and site leads.</p>'}
    </section>
    <div class="stack">
      <section class="panel">
        <header class="panel-head"><h2>Gusts today, 07–17</h2><span class="muted small">Limit ${limit} m/s</span></header>
        ${hours.length ? `<div class="gust-chart">
          <div class="gb-area">${hours.map(h => `<span class="gb ${h.gust >= limit ? 'over' : h.gust >= limit * 0.8 ? 'near' : ''}" tabindex="0" data-tip="${h.time.slice(11, 16)}: gusts ${h.gust.toFixed(1)} m/s">
            <i style="height:${Math.min(100, (100 * h.gust) / (limit * 1.5))}%"></i></span>`).join('')}
            <span class="gb-limit" style="bottom:${(100 / 1.5).toFixed(1)}%"><small>${limit} m/s</small></span></div>
          <div class="gb-labels">${hours.map(h => `<small>${h.time.slice(11, 13)}</small>`).join('')}</div></div>` : '<p class="panel-body muted">Forecast not available.</p>'}
      </section>
      <section class="panel">
        <header class="panel-head"><h2>Recent lifts</h2></header>
        ${rec.length ? `<ul class="feed">${rec.map(l => `<li>${icon('anchor')}<p><b>${esc(l.load)}</b>, ${l.weight} t <span class="muted">${esc(store.get('items', l.areaId)?.name || '')}, ${esc(l.by)}${l.wind != null ? `, gusts ${l.wind} m/s` : ''}</span></p><time>${timeAgo(l.at)}</time></li>`).join('')}</ul>`
          : '<p class="panel-body muted">No lifts recorded yet.</p>'}
      </section>
    </div>
  </div>`;
}

// ---------- TR measurement ----------
function tr() {
  const history = store.all('tr').slice().sort((a, b) => a.day.localeCompare(b.day));
  const thisWeek = D.trThisWeek();
  const points = history.slice(-10).map(t => ({ label: `W${isoWeek(t.day)}`, value: trIndex(t.scores), tip: `Week ${isoWeek(t.day)}: ${trIndex(t.scores)} % (${t.by})` }));
  const edit = can('tr.do');
  const live = tally ? trIndex(tally) : null;
  return `<div class="two-col wide-left">
    <section class="panel">
      <header class="panel-head"><h2>Week ${isoWeek(today())}</h2>${thisWeek ? badge(`${trIndex(thisWeek.scores)} %`, trIndex(thisWeek.scores) >= 90 ? 'ok-soft' : 'warn-soft') : ''}</header>
      ${tally ? `<form id="trForm" data-submit="trSave" class="panel-body" novalidate>
          <p class="muted">Walk the site and count every observation in each area: correct, or not correct. TR index = correct ÷ all × 100.</p>
          <div class="tr-grid">${TR_AREAS.map(a => `<div class="tr-area">
            <div class="tr-name"><b>${a.label}</b><small lang="fi">${a.fi}</small></div>
            ${['ok', 'bad'].map(k => `<div class="tally ${k}">
              <span>${k === 'ok' ? 'Correct' : 'Not correct'}</span>
              <button type="button" class="icon-btn" data-act="trCount" data-area="${a.key}" data-k="${k}" data-d="-1" aria-label="${k === 'ok' ? 'Correct' : 'Not correct'} minus one, ${a.label}">−</button>
              <output>${tally[a.key][k]}</output>
              <button type="button" class="icon-btn add" data-act="trCount" data-area="${a.key}" data-k="${k}" data-d="1" aria-label="${k === 'ok' ? 'Correct' : 'Not correct'} plus one, ${a.label}">+</button>
            </div>`).join('')}</div>`).join('')}</div>
          <div class="tr-total"><span>TR index</span><b id="trLive">${live == null ? '–' : live + ' %'}</b></div>
          ${field('Notes (optional)', '<textarea name="notes" rows="2" maxlength="400" placeholder="Main findings to share at the morning meeting"></textarea>')}
          <div class="btn-row"><button type="button" class="btn ghost" data-act="trCancel">Cancel</button><button class="btn primary" type="submit">Save measurement</button></div>
        </form>`
        : `<div class="panel-body">${thisWeek ? `<p>Measured on ${fmtDay(thisWeek.day)} by ${esc(thisWeek.by)}.</p>
          <div class="tr-break">${TR_AREAS.map(a => { const sc = thisWeek.scores[a.key]; const idx = sc.ok + sc.bad ? Math.round(100 * sc.ok / (sc.ok + sc.bad)) : null;
            return `<div><span>${a.label}</span>${progress(sc.ok, sc.ok + sc.bad, idx >= 90 ? 'ok' : 'warn')}<b>${idx ?? '–'} %</b></div>`; }).join('')}</div>
          ${thisWeek.notes ? `<p class="muted">${esc(thisWeek.notes)}</p>` : ''}`
          : `<p>No TR measurement this week yet. The target is 90 % or more.</p>`}
          ${edit ? `<button type="button" class="btn ${thisWeek ? 'ghost' : 'primary'}" data-act="trStart">${icon('clipboard-check')}${thisWeek ? 'Measure again' : 'Start measurement'}</button>` : ''}</div>`}
    </section>
    <section class="panel">
      <header class="panel-head"><h2>TR index by week</h2></header>
      <div class="panel-body">${points.length ? lineChart({ points, target: 90, min: 60, max: 100, unit: ' %', label: 'TR index by week, target 90 %' }) : '<p class="muted">No measurements yet.</p>'}</div>
      ${history.length ? `<div class="table-wrap"><table class="table compact"><thead><tr><th>Week</th><th>Date</th><th>By</th><th class="num">Index</th></tr></thead>
        <tbody>${history.slice().reverse().slice(0, 8).map(t => `<tr><td>${isoWeek(t.day)}</td><td>${fmtDayShort(t.day)}</td><td>${esc(t.by)}</td><td class="num"><b>${trIndex(t.scores)} %</b></td></tr>`).join('')}</tbody></table></div>` : ''}
    </section>
  </div>`;
}

function body(tab) {
  return `${tabs(TABS.map(([k, l]) => [k, l, null]), tab, 'inspTab')}<div class="tab-body">${tab === 'lifts' ? lifts() : tab === 'tr' ? tr() : walk()}</div>`;
}
const tabFrom = ctx => (['lifts', 'tr'].includes(ctx.route.params[0]) ? ctx.route.params[0] : 'walk');

export default {
  meta: { key: 'checks', hideFor: ['worker'], label: 'Site checks', icon: 'clipboard-check' },

  header: ctx => ({
    title: { walk: 'Daily Site Walk', lifts: 'Lift Checks', tr: 'TR Measurement' }[tabFrom(ctx)],
    sub: { walk: 'Check every zone, gate, fence and route once a shift', lifts: 'Checks before every crane lift, with the wind on site', tr: 'Weekly TR safety measurement (TR-mittari)' }[tabFrom(ctx)]
  }),

  render: ctx => `<div id="inspBody">${body(tabFrom(ctx))}</div>`,
  update(ctx) { const el = document.getElementById('inspBody'); if (el) { el.innerHTML = body(tabFrom(ctx)); hydratePhotos(el); } },

  mount(ctx) {
    if (tabFrom(ctx) === 'lifts') getWeather(true).then(w => { if (w && tabFrom(ctx) === 'lifts' && document.getElementById('inspBody')) this.update(ctx); });
  },

  actions: {
    inspTab: (el, ctx) => ctx.go(el.dataset.key === 'walk' ? '#/checks' : `#/checks/${el.dataset.key}`),
    walkMark(el, ctx) {
      const it = store.get('items', el.dataset.id);
      const result = +el.dataset.result;
      store.update('items', it.id, { status: result, lastCheckedAt: nowIso(), lastCheckedBy: ctx.user.name });
      store.insert('checks', { itemId: it.id, result, at: nowIso(), by: ctx.user.name, note: '', photo: walkPhotos[it.id] || null });
      delete walkPhotos[it.id];
      ctx.refresh();
      if (result === 1) toast(`${it.name}: OK.`, 'ok', 2000);
      else if (can('obs.create')) { observations.openForm(ctx, { zoneId: it.id, type: 'hazard' }); toast('Describe the problem so it gets assigned and fixed.'); }
    },
    trStart(el, ctx) {
      tally = Object.fromEntries(TR_AREAS.map(a => [a.key, { ok: 0, bad: 0 }]));
      ctx.refresh();
    },
    trCancel(el, ctx) { tally = null; ctx.refresh(); },
    trCount(el) {
      const { area, k, d } = el.dataset;
      tally[area][k] = Math.max(0, tally[area][k] + +d);
      el.parentElement.querySelector('output').textContent = tally[area][k];
      const live = trIndex(tally);
      document.getElementById('trLive').textContent = live == null ? '–' : `${live} %`;
    }
  },

  changes: {
    async walkPhoto(el, ctx) {
      if (!el.files[0]) return;
      try {
        walkPhotos[el.dataset.id] = await savePhoto(el.files[0]);
        toast('Photo added. Now mark it OK or Problem.');
        el.closest('label').classList.add('has');
      } catch (e) { toast(e.message, 'err'); }
    }
  },

  submits: {
    liftSave(form, v, btn, ctx) {
      const w = cachedWeather();
      const gust = w?.now?.gust ?? null;
      if (gust != null && gust >= store.settings().windLimit) return toast('Too windy to lift. Wait until the gusts drop below the limit.', 'err');
      const rec = store.insert('lifts', { areaId: v.areaId, load: v.load, weight: +v.weight, at: nowIso(), by: ctx.user.name,
        wind: gust != null ? +gust.toFixed(1) : null, checks: { plan: v.plan, zone: v.zone, radio: v.radio, gear: v.gear, wind: true }, notes: v.notes });
      store.audit(ctx.user, 'Recorded lift', `${rec.load}, ${rec.weight} t`);
      toast('Lift recorded. Lift safely.', 'ok');
      ctx.refresh();
    },
    trSave(form, v, btn, ctx) {
      const idx = trIndex(tally);
      if (idx == null) return toast('Count at least one observation before saving.', 'err');
      store.insert('tr', { day: today(), by: ctx.user.name, scores: tally, notes: v.notes });
      store.audit(ctx.user, 'Saved TR measurement', `${idx} %`);
      tally = null;
      toast(`TR index for week ${isoWeek(today())}: ${idx} %.`, 'ok');
      ctx.refresh();
    }
  }
};
