// Morning meeting: the daily briefing at the site office. Today's hazards, who is on site,
// what they are doing, the exclusion zones on the map, and a record of who attended.

import * as store from '../store.js';
import { can } from '../auth.js';
import { esc, today, addDays, fmtDayLong, fmtDay, fmtTime, nowIso, plural, isWeekend } from '../util.js';
import { icon } from '../icons.js';
import { toast, badge, contractorMark, contractorTag, zoneName, emptyState, busy } from '../ui.js';
import { HAZARDS, hazard, PERMIT_TYPES, PERMIT_STATUS } from '../domain.js';
import * as D from '../derive.js';
import { getWeather, cachedWeather, advisories, describeCode } from '../weather.js';
import { createMap, drawItem, drawZone, activeZones, fitSite, mapsAvailable } from '../maps.js';
import { sendEmail, describe } from '../mail.js';

let state = null;   // { day, company, hazards:Set, notes, attendees:Set, dirty }
let map = null;

function dayFrom(ctx) {
  const p = ctx.route.params[0];
  return /^\d{4}-\d{2}-\d{2}$/.test(p || '') ? p : today();
}

function suggestedHazards(day) {
  const set = new Set(D.activitiesOn(day).flatMap(a => a.hazards));
  if (day === today()) advisories(cachedWeather()).forEach(a => a.hazard && set.add(a.hazard));
  return set;
}

function initState(day) {
  const b = D.briefingOn(day);
  state = {
    day, company: null,
    hazards: new Set(b ? b.hazards : suggestedHazards(day)),
    notes: b ? b.notes : '',
    attendees: new Set(b ? b.attendees : []),
    dirty: false
  };
}

function hazardStrip(editable) {
  const fromActs = new Set(D.activitiesOn(state.day).flatMap(a => a.hazards));
  const fromWx = new Set(state.day === today() ? advisories(cachedWeather()).map(a => a.hazard).filter(Boolean) : []);
  return `<div class="hazards" role="group" aria-label="Risks and hazards today">
    ${HAZARDS.map(h => {
      const on = state.hazards.has(h.key);
      const why = fromWx.has(h.key) ? 'From today’s weather' : fromActs.has(h.key) ? 'From today’s activities' : '';
      return `<button type="button" class="hz ${on ? 'on' : ''}" ${editable ? `data-act="mtHazard" data-key="${h.key}"` : 'disabled'}
        aria-pressed="${on}" title="${esc(h.label)}${why ? `. ${why}` : ''}">
        <span class="hz-ic">${icon(h.icon)}</span><span class="hz-label">${esc(h.label)}</span>${why && on ? '<i class="hz-dot" aria-hidden="true"></i>' : ''}</button>`;
    }).join('')}
  </div>`;
}

function companies() {
  const acts = D.activitiesOn(state.day);
  const onSite = state.day === today() ? D.onSiteNow() : [];
  const ids = new Set([...acts.map(a => a.contractorId), ...onSite.map(a => store.get('people', a.personId)?.contractorId)].filter(Boolean));
  return store.all('contractors').filter(c => ids.has(c.id)).map(c => {
    const mine = acts.filter(a => a.contractorId === c.id);
    const sigs = mine.reduce((n, a) => n + D.signaturesOn(D.spaForActivity(a.id), state.day).length, 0);
    const people = onSite.filter(a => store.get('people', a.personId)?.contractorId === c.id).length;
    return { c, acts: mine.length, sigs, people };
  });
}

function companyCards() {
  const list = companies();
  if (!list.length) return emptyState('hard-hat', 'Nobody planned', 'No activities on the look-ahead for this day.');
  return `<button type="button" class="co-card all ${state.company ? '' : 'on'}" data-act="mtCompany" data-id="">
      <span class="co-all">${icon('users')}</span><span class="co-name">All companies</span>
      <span class="co-meta">${plural(list.length, 'company', 'companies')}</span></button>
    ${list.map(({ c, acts, sigs, people }) => `
    <button type="button" class="co-card ${state.company === c.id ? 'on' : ''}" data-act="mtCompany" data-id="${c.id}" aria-pressed="${state.company === c.id}">
      ${contractorMark(c, 'lg')}
      <span class="co-name">${esc(c.name)}</span>
      ${acts ? `<span class="co-meta"><b>${plural(acts, 'activity', 'activities')}</b></span>
      <span class="co-meta ${sigs ? 'ok' : 'warn'}">${plural(sigs, 'SPA signature')}</span>` : '<span class="co-meta muted">No planned activity</span>'}
      ${state.day === today() ? `<span class="co-meta muted">${people} on site</span>` : ''}
    </button>`).join('')}`;
}

function activityList() {
  const acts = D.activitiesOn(state.day).filter(a => !state.company || a.contractorId === state.company);
  if (!acts.length) return emptyState('chart-gantt', 'No activities', 'Nothing on the look-ahead for this selection.');
  return acts.map(a => {
    const s = D.spaForActivity(a.id);
    const sigs = D.signaturesOn(s, state.day).length;
    const permits = D.permitsFor(a.id).filter(p => ['active', 'requested'].includes(D.permitState(p)));
    return `<article class="act-card">
      <header><span class="act-ref"><i style="--c:${D.contractor(a.contractorId)?.color}"></i>${a.ref}</span>${badge(store.get('contractors', a.contractorId)?.short || '', 'neutral')}</header>
      <h3>${esc(a.title)}</h3>
      <p class="muted">${esc(zoneName(a.zoneId))}, crew of ${a.crew}</p>
      <div class="act-links">
        ${s ? `<a href="#/spa/${s.id}" class="chip ${sigs ? 'ok' : 'warn'}">${icon('signature')}${s.ref}: ${sigs}/${a.crew} signed</a>`
          : '<span class="chip warn">No SPA</span>'}
        ${permits.map(p => `<a href="#/permits/${p.id}" class="chip ${p.status === 'requested' ? 'warn' : 'ok'}">${icon(PERMIT_TYPES[p.type].icon)}${p.ref} ${PERMIT_STATUS[D.permitState(p)].label.toLowerCase()}</a>`).join('')}
      </div>
      <p class="act-hz">${a.hazards.map(k => `<span title="${esc(hazard(k).label)}">${icon(hazard(k).icon)}</span>`).join('')}</p>
    </article>`;
  }).join('');
}

function attendanceList(editable) {
  const ids = state.day === today() ? D.onSiteNow().map(a => a.personId) : [];
  const people = [...new Set([...ids, ...state.attendees])].map(id => store.get('people', id)).filter(Boolean)
    .sort((a, b) => a.contractorId.localeCompare(b.contractorId) || a.name.localeCompare(b.name));
  if (!people.length) return '<p class="muted">Attendance is taken from the people checked in today.</p>';
  return `<div class="attend">${people.map(p => `
    <label class="check"><input type="checkbox" ${state.attendees.has(p.id) ? 'checked' : ''} ${editable ? `data-change="mtAttend" data-id="${p.id}"` : 'disabled'}>
      <span>${esc(p.name)}<small>${esc(store.get('contractors', p.contractorId)?.short || '')}</small></span></label>`).join('')}</div>`;
}

function body(ctx) {
  const editable = can('meeting.run');
  const b = D.briefingOn(state.day);
  const zones = activeZones(state.day);
  const dels = D.deliveriesOn(state.day).filter(d => d.status !== 'cancelled');
  const adv = state.day === today() ? advisories(cachedWeather()) : [];
  const w = state.day === today() ? cachedWeather() : null;
  return `
    <section class="mt-risks" aria-labelledby="riskHead">
      <h2 id="riskHead" class="mt-risk-label">${icon('triangle-exclamation-point')}Risks and hazards</h2>
      ${hazardStrip(editable)}
    </section>
    ${adv.length || w ? `<div class="mt-weather">
      ${w ? `<span class="wx-inline">${icon(describeCode(w.now.code).icon)}${Math.round(w.now.temp)}°C, wind ${Math.round(w.now.wind)} m/s, gusts ${Math.round(w.now.gust)} m/s</span>` : ''}
      ${adv.map(a => `<span class="advice ${a.level}">${icon(a.icon)}${esc(a.text)}</span>`).join('')}</div>` : ''}

    <div class="mt-grid">
      <section class="mt-col" aria-labelledby="onSiteHead">
        <h2 id="onSiteHead" class="col-head">${state.day === today() ? 'On site today' : 'Planned on site'}</h2>
        <div class="co-list">${companyCards()}</div>
      </section>
      <section class="mt-col" aria-labelledby="actHead">
        <h2 id="actHead" class="col-head">Activities${state.company ? ` <span class="muted">${esc(store.get('contractors', state.company)?.short)}</span>` : ''}</h2>
        <div class="act-list">${activityList()}</div>
      </section>
      <section class="mt-col mt-map" aria-labelledby="mapHead">
        <h2 id="mapHead" class="col-head">Exclusion zones <span class="count">${zones.length}</span></h2>
        <div id="mtMap" class="map-box">${mapsAvailable() ? '' : '<p class="muted pad">The map could not be loaded.</p>'}</div>
        <ul class="ez-list">${zones.map(z => `<li><span class="ez-swatch" aria-hidden="true"></span><div><b>${esc(z.name)}</b><span>${esc(z.reason)}</span><small>Until ${fmtDay(z.to)}</small></div></li>`).join('') || '<li class="muted">No exclusion zones on this day.</li>'}</ul>
      </section>
    </div>

    <div class="mt-bottom">
      <section class="panel">
        <header class="panel-head"><h2>Deliveries</h2><a class="link" href="#/deliveries/${state.day}">Open deliveries</a></header>
        ${dels.length ? `<ul class="timeline compact">${dels.map(d => `<li class="${d.status}"><time>${d.from}</time><div><b>${esc(d.load)}</b><span>${esc(d.gate)}, ${contractorTag(d.contractorId)}</span></div></li>`).join('')}</ul>`
          : '<p class="panel-body muted">No deliveries booked.</p>'}
      </section>
      <section class="panel">
        <header class="panel-head"><h2>Key messages</h2></header>
        <div class="panel-body">
          <textarea class="notes" rows="5" maxlength="1200" placeholder="${editable ? 'What everyone needs to know today: changes to routes, inspections, visitors…' : 'No key messages.'}" ${editable ? 'data-change="mtNotes" data-live' : 'readonly'}>${esc(state.notes)}</textarea>
        </div>
      </section>
      <section class="panel">
        <header class="panel-head"><h2>Attendance</h2><span class="muted small">${state.attendees.size} ticked</span></header>
        <div class="panel-body">${attendanceList(editable)}
          ${editable ? `<button type="button" class="link-btn" data-act="mtAllPresent">Tick everyone on site</button>` : ''}</div>
      </section>
    </div>
    <p class="mt-status" id="mtStatus">${b ? `Recorded by ${esc(b.heldBy)} at ${fmtTime(b.heldAt)}${b.emailedAt ? `, emailed at ${fmtTime(b.emailedAt)}` : ''}.` : 'Not recorded yet.'}</p>`;
}

function drawMap() {
  if (map) { map.remove(); map = null; }
  const el = document.getElementById('mtMap');
  if (!el || !mapsAvailable()) return;
  map = createMap(el, { interactive: true });
  const g = L.layerGroup().addTo(map);
  store.all('items').forEach(i => drawItem(i, g, { muted: true }));
  activeZones(state.day).forEach(z => drawZone(z, g));
  D.activitiesOn(state.day).filter(a => !state.company || a.contractorId === state.company).forEach(a => {
    const zone = store.get('items', a.zoneId);
    if (!zone) return;
    const c = D.contractor(a.contractorId);
    const at = L.latLngBounds(zone.shape).getCenter();
    L.circleMarker(at, { radius: 7, color: '#fff', weight: 2, fillColor: c?.color || '#333', fillOpacity: 1 })
      .bindTooltip(`${a.ref} ${esc(a.title)}`, { direction: 'top' }).addTo(g);
  });
  fitSite(map, 0.04);
}

function briefingFields() {
  const s = store.settings();
  const fields = { Date: fmtDayLong(state.day), Site: `${s.siteName}, ${s.project}` };
  fields['Hazards today'] = [...state.hazards].map(k => hazard(k).label).join(', ') || 'None selected';
  const w = cachedWeather();
  if (state.day === today() && w) fields.Weather = `${Math.round(w.now.temp)} °C, wind ${Math.round(w.now.wind)} m/s, gusts ${Math.round(w.now.gust)} m/s. ${advisories(w).map(a => a.text).join(' ')}`;
  for (const a of D.activitiesOn(state.day)) {
    const sp = D.spaForActivity(a.id);
    const permits = D.permitsFor(a.id).filter(p => ['active', 'requested'].includes(D.permitState(p))).map(p => `${p.ref} ${PERMIT_STATUS[D.permitState(p)].label.toLowerCase()}`);
    fields[`${a.ref} ${a.title}`] = `${store.get('contractors', a.contractorId)?.name}, ${zoneName(a.zoneId)}. ${sp ? `${sp.ref} signed by ${D.signaturesOn(sp, state.day).length}` : 'No SPA'}${permits.length ? '. Permits: ' + permits.join(', ') : ''}.`;
  }
  activeZones(state.day).forEach(z => { fields[`Exclusion zone: ${z.name}`] = `${z.reason} Until ${fmtDay(z.to)}.`; });
  D.deliveriesOn(state.day).filter(d => d.status !== 'cancelled').forEach(d => { fields[`Delivery ${d.from} ${d.gate} (${d.ref})`] = `${d.load} (${store.get('contractors', d.contractorId)?.name})`; });
  if (state.notes) fields['Key messages'] = state.notes;
  fields.Attendance = `${state.attendees.size} people`;
  return fields;
}

function save(user) {
  const existing = D.briefingOn(state.day);
  const rec = { day: state.day, hazards: [...state.hazards], notes: state.notes, attendees: [...state.attendees], heldBy: user.name, heldAt: nowIso() };
  if (existing) store.update('briefings', existing.id, rec);
  else store.insert('briefings', { ...rec, emailedAt: null });
  state.dirty = false;
  store.audit(user, 'Saved morning meeting', fmtDayLong(state.day));
  return D.briefingOn(state.day);
}

export default {
  meta: { key: 'meeting', label: 'Morning meeting', icon: 'sunrise' },

  header(ctx) {
    const day = dayFrom(ctx);
    if (!state || state.day !== day) initState(day);
    const lead = can('meeting.run');
    return {
      title: 'Morning meeting',
      sub: `${store.settings().siteName}, ${fmtDayLong(day)}`,
      actions: `<div class="day-nav">
          <a class="icon-btn" href="#/meeting/${addDays(day, -1)}" aria-label="Previous day">${icon('chevron-left')}</a>
          ${day !== today() ? `<a class="btn ghost sm" href="#/meeting">Today</a>` : ''}
          <a class="icon-btn" href="#/meeting/${addDays(day, 1)}" aria-label="Next day">${icon('chevron-right')}</a></div>
        <button type="button" class="btn ghost" data-act="print">${icon('printer')}<span>Print</span></button>
        ${lead ? `<button type="button" class="btn ghost" data-act="mtEmail">${icon('mail')}<span>Email briefing</span></button>
          <button type="button" class="btn primary" data-act="mtSave">${icon('check')}<span>Save meeting</span></button>` : ''}`
    };
  },

  render(ctx) {
    if (!state || state.day !== dayFrom(ctx)) initState(dayFrom(ctx));
    return `<div id="mtBody" class="${isWeekend(state.day) ? 'weekend' : ''}">${body(ctx)}</div>`;
  },

  mount(ctx) {
    drawMap();
    if (state.day === today()) getWeather().then(w => {
      if (!w || !document.getElementById('mtBody')) return;
      // fold weather hazards into a new briefing once the forecast arrives
      if (!D.briefingOn(state.day) && !state.dirty) advisories(w).forEach(a => a.hazard && state.hazards.add(a.hazard));
      document.getElementById('mtBody').innerHTML = body(ctx);
      drawMap();
    });
  },

  update(ctx) {
    const el = document.getElementById('mtBody');
    if (!el) return;
    el.innerHTML = body(ctx);
    drawMap();
  },

  unmount() {
    if (map) { map.remove(); map = null; }
  },

  actions: {
    mtHazard(el) {
      const k = el.dataset.key;
      state.hazards.has(k) ? state.hazards.delete(k) : state.hazards.add(k);
      state.dirty = true;
      el.classList.toggle('on');
      el.setAttribute('aria-pressed', state.hazards.has(k));
    },
    mtCompany(el, ctx) {
      state.company = el.dataset.id || null;
      ctx.refresh();
    },
    mtAllPresent(el, ctx) {
      D.onSiteNow().forEach(a => state.attendees.add(a.personId));
      state.dirty = true;
      ctx.refresh();
    },
    mtSave(el, ctx) {
      save(ctx.user);
      toast('Morning meeting saved.', 'ok');
      ctx.refresh();
    },
    async mtEmail(el, ctx) {
      const b = save(ctx.user);
      const res = await busy(el, () => sendEmail({
        event: 'manual', subject: `Morning meeting ${fmtDay(state.day)}: ${store.settings().siteName}`,
        fields: briefingFields(), link: `#/meeting/${state.day}`, user: ctx.user
      }), 'Sending…');
      if (res.status === 'sent' || res.status === 'activation') store.update('briefings', b.id, { emailedAt: nowIso() });
      toast(describe(res), res.status === 'sent' ? 'ok' : res.status === 'failed' ? 'err' : 'info', 7000);
      ctx.refresh();
    }
  },

  changes: {
    mtNotes(el) { state.notes = el.value; state.dirty = true; },
    mtAttend(el) {
      el.checked ? state.attendees.add(el.dataset.id) : state.attendees.delete(el.dataset.id);
      state.dirty = true;
      const count = el.closest('.panel').querySelector('.panel-head .small');
      if (count) count.textContent = `${state.attendees.size} ticked`;
    }
  }
};
