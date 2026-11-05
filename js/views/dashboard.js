// Dashboard: what is happening on site today and what needs someone's attention.

import * as store from '../store.js';
import { can } from '../auth.js';
import { esc, today, fmtDayLong, timeAgo, greeting, daysUntil, dayDiff, plural, isWeekend } from '../util.js';
import { icon } from '../icons.js';
import { badge, contractorTag, zoneName, emptyState } from '../ui.js';
import { getWeather, cachedWeather, describeCode, advisories, workdayGust } from '../weather.js';
import * as D from '../derive.js';
import { obsType, SEVERITY, PERMIT_TYPES } from '../domain.js';

function attentionItems(user) {
  const T = today();
  const out = [];
  const add = (tone, ic, title, sub, href, cta) => out.push({ tone, ic, title, sub, href, cta });
  const me = D.personForUser(user);

  if (me && can('attendance.self', user) && !D.isOnSite(me.id)) add('info', 'hard-hat', 'You are not checked in today', 'Check in when you arrive so the site knows who is on site.', '#/workforce', 'Check in');
  if (me) {
    const mine = D.activitiesOn(T).filter(a => a.contractorId === me.contractorId).map(a => D.spaForActivity(a.id)).filter(Boolean);
    for (const s of mine) if (!D.hasSignedToday(s, me.id)) add('warn', 'signature', `Sign ${s.ref} before you start`, s.title, `#/spa/${s.id}`, 'Read and sign');
  }
  if (can('permit.approve', user)) {
    for (const p of store.all('permits').filter(p => p.status === 'requested')) {
      add('warn', PERMIT_TYPES[p.type].icon, `${p.ref} is waiting for approval`, `${PERMIT_TYPES[p.type].label}: ${p.title}`, `#/permits/${p.id}`, 'Review');
    }
  }
  for (const p of store.all('permits').filter(p => D.permitState(p) === 'expired')) {
    add('danger', 'file-check', `${p.ref} has run out but is still open`, p.title, `#/permits/${p.id}`, 'Close it');
  }
  for (const o of D.openObservations()) {
    const overdue = o.due && daysUntil(o.due) < 0;
    if (o.severity === 'high' || overdue || (o.due && o.due === T)) {
      add(o.severity === 'high' || overdue ? 'danger' : 'warn', obsType(o.type).icon,
        `${o.ref}: ${SEVERITY[o.severity].label.toLowerCase()} ${obsType(o.type).label.toLowerCase()} at ${zoneName(o.zoneId) || 'site'}`,
        `${o.description}${o.due ? ` Due ${overdue ? `${-daysUntil(o.due)} days ago` : 'today'}.` : ''}`, `#/observations/${o.id}`, 'Open');
    }
  }
  if (can('spa.edit', user)) {
    for (const a of D.activitiesOn(T).filter(a => a.status === 'active')) {
      const s = D.spaForActivity(a.id);
      if (!s) add('warn', 'clipboard-pen-line', `${a.ref} has no SPA`, a.title, '#/spa', 'Write SPA');
      else if (!D.signaturesOn(s).length) add('warn', 'signature', `Nobody has signed ${s.ref} today`, `${a.title}. The crew signs before starting.`, `#/spa/${s.id}`, 'Open SPA');
    }
  }
  if (can('plant.edit', user)) {
    for (const e of store.all('equipment')) {
      const st = D.equipmentState(e);
      if (st.state === 'expired') add('danger', 'forklift', `${e.reg} inspection expired`, `${e.name} must not be used until it is inspected.`, '#/plant', 'Record inspection');
    }
  }
  const clash = D.clashes(T);
  if (clash.size && can('delivery.edit', user)) {
    const refs = [...new Set(D.deliveriesOn(T).filter(d => clash.has(d.id)).map(d => d.ref))];
    add('warn', 'truck', `Delivery times clash at the gate`, `${refs.join(' and ')} overlap at the same gate.`, '#/deliveries', 'Rebook');
  }
  if (can('people.edit', user)) {
    const blocked = D.onSiteNow().map(a => store.get('people', a.personId)).filter(p => p && !D.personState(p).cleared);
    for (const p of blocked) add('danger', 'id-card', `${p.name} is on site but not cleared`, D.personState(p).problems.join(', '), '#/workforce', 'Check');
  }
  if (can('meeting.run', user) && !D.briefingOn(T) && !isWeekend(T)) add('info', 'sunrise', 'Morning meeting not recorded yet', 'Go through today’s hazards, activities and exclusion zones.', '#/meeting', 'Start');
  if (can('tr.do', user) && !D.trThisWeek() && new Date().getDay() >= 3) add('info', 'clipboard-check', 'TR measurement due this week', 'Walk the site and record this week’s TR index.', '#/inspections/tr', 'Start');
  if (user.role === 'admin') {
    const pending = store.all('users').filter(u => u.status === 'pending');
    if (pending.length) add('info', 'user-plus', `${plural(pending.length, 'access request')} to review`, pending.map(u => u.name).join(', '), '#/admin', 'Review');
  }
  const rank = { danger: 0, warn: 1, info: 2 };
  return out.sort((a, b) => rank[a.tone] - rank[b.tone]);
}

function feed() {
  const since = Date.now() - 36 * 3600e3;
  const ev = [];
  const recent = iso => iso && Date.parse(iso) > since;
  store.all('observations').forEach(o => {
    if (recent(o.createdAt)) ev.push([o.createdAt, 'footprints', `<b>${esc(o.reportedBy)}</b> raised <a href="#/observations/${o.id}">${o.ref}</a>, ${esc(obsType(o.type).label.toLowerCase())} at ${esc(zoneName(o.zoneId) || 'site')}`]);
    if (recent(o.closedAt)) ev.push([o.closedAt, 'circle-check', `<b>${esc(o.closedBy)}</b> closed <a href="#/observations/${o.id}">${o.ref}</a>`]);
  });
  store.all('permits').forEach(p => {
    if (recent(p.requestedAt)) ev.push([p.requestedAt, 'file-check', `<b>${esc(p.requestedBy)}</b> requested <a href="#/permits/${p.id}">${p.ref}</a> (${PERMIT_TYPES[p.type].label.toLowerCase()})`]);
    if (recent(p.approvedAt)) ev.push([p.approvedAt, 'badge-check', `<b>${esc(p.approvedBy)}</b> approved <a href="#/permits/${p.id}">${p.ref}</a>`]);
  });
  store.all('deliveries').forEach(d => {
    if (recent(d.arrivedAt)) ev.push([d.arrivedAt, 'truck', `${esc(d.load)} arrived at the ${esc(d.gate.toLowerCase())} (${d.ref})`]);
  });
  store.all('spas').forEach(s => s.signatures.forEach(g => {
    if (recent(g.at)) ev.push([g.at, 'signature', `<b>${esc(g.name)}</b> signed <a href="#/spa/${s.id}">${s.ref}</a>`]);
  }));
  store.all('lifts').forEach(l => {
    if (recent(l.at)) ev.push([l.at, 'anchor', `<b>${esc(l.by)}</b> recorded a lift: ${esc(l.load)}`]);
  });
  return ev.sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12);
}

function weatherPanel(w) {
  if (!w) return `<div class="panel-body"><p class="muted">Weather is loading. If it does not appear, the forecast service cannot be reached from this network.</p></div>`;
  const d = describeCode(w.now.code);
  const peak = workdayGust(w);
  const adv = advisories(w);
  return `<div class="panel-body weather">
      <div class="wx-now">${icon(d.icon, 'wx-icon')}<div><p class="wx-temp">${Math.round(w.now.temp)}°C</p><p class="muted">${d.text}, feels like ${Math.round(w.now.feels)}°C</p></div></div>
      <dl class="facts">
        <div><dt>Wind now</dt><dd>${Math.round(w.now.wind)} m/s, gusts ${Math.round(w.now.gust)}</dd></div>
        <div><dt>Highest gust 07–17</dt><dd>${peak ? `${Math.round(peak.gust)} m/s at ${peak.time.slice(11, 16)}` : '-'}</dd></div>
        <div><dt>Today</dt><dd>${Math.round(w.today.min)} to ${Math.round(w.today.max)} °C, ${(w.today.precip ?? 0).toFixed(1)} mm</dd></div>
        <div><dt>Daylight</dt><dd>${w.today.sunrise}–${w.today.sunset}</dd></div>
      </dl>
      ${adv.map(a => `<p class="advice ${a.level}">${icon(a.icon)}<span>${esc(a.text)}</span></p>`).join('')}
      ${w.stale ? '<p class="muted small">Showing the last forecast received. The weather service is not answering right now.</p>' : ''}
    </div>`;
}

export default {
  meta: { key: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard' },

  header: ctx => ({
    title: 'Dashboard',
    sub: `${greeting()}, ${ctx.user.name.split(' ')[0]}. ${fmtDayLong(today())}`,
    actions: can('obs.create') ? `<button type="button" class="btn primary" data-act="raiseObservation">${icon('plus')}<span>Raise observation</span></button>` : ''
  }),

  render(ctx) {
    const user = ctx.user;
    const T = today();
    const onSite = D.onSiteNow();
    const acts = D.activitiesOn(T);
    const activePermits = store.all('permits').filter(p => D.permitState(p) === 'active');
    const waiting = store.all('permits').filter(p => p.status === 'requested');
    const openObs = D.openObservations();
    const high = openObs.filter(o => o.severity === 'high');
    const dels = D.deliveriesOn(T).filter(d => d.status !== 'cancelled');
    const left = dels.filter(d => d.status === 'booked');
    const companies = new Set(onSite.map(a => store.get('people', a.personId)?.contractorId)).size;
    const lti = dayDiff(store.settings().lastInjuryDate || T, T);
    const items = attentionItems(user);
    const events = feed();

    const stat = (href, value, label, sub, tone = '') => `
      <a class="rail-item ${tone}" href="${href}"><span class="rail-value">${value}</span><span class="rail-label">${label}</span><span class="rail-sub">${sub}</span></a>`;

    return `
      <section class="rail" aria-label="Site today">
        ${stat('#/workforce', onSite.length, 'on site now', `${plural(companies, 'company', 'companies')}`)}
        ${stat('#/lookahead', acts.length, 'activities today', `${acts.filter(a => a.status === 'active').length} in progress`)}
        ${stat('#/permits', activePermits.length, 'active permits', waiting.length ? `${waiting.length} awaiting approval` : 'none waiting', waiting.length ? 'warn' : '')}
        ${stat('#/observations', openObs.length, 'open observations', high.length ? `${high.length} high` : 'none high', high.length ? 'danger' : '')}
        ${stat('#/deliveries', dels.length, 'deliveries today', `${left.length} still to come`)}
        <div class="rail-item sign" title="Counted from the last injury that caused time off work">
          <span class="rail-value">${lti}</span><span class="rail-label">days without a lost-time injury</span><span class="rail-sub">Report every near miss</span>
        </div>
      </section>

      <div class="dash-grid">
        <section class="panel" aria-labelledby="attHead">
          <header class="panel-head"><h2 id="attHead">Needs attention</h2>${items.length ? badge(String(items.length), items.some(i => i.tone === 'danger') ? 'danger' : 'warn') : ''}</header>
          ${items.length ? `<ul class="attention">${items.map(i => `
            <li class="att ${i.tone}">
              <span class="att-icon">${icon(i.ic)}</span>
              <div class="att-text"><b>${esc(i.title)}</b><span>${esc(i.sub)}</span></div>
              <a class="btn sm ${i.tone === 'danger' ? 'danger-ghost' : 'ghost'}" href="${i.href}">${esc(i.cta)}</a>
            </li>`).join('')}</ul>`
            : emptyState('circle-check', 'All clear', 'Nothing needs you right now. New permits, serious observations and expiring inspections will show up here.')}
        </section>

        <div class="dash-side">
          <section class="panel" aria-labelledby="wxHead">
            <header class="panel-head"><h2 id="wxHead">Weather on site</h2><a class="muted small" href="https://open-meteo.com/" target="_blank" rel="noopener">Weather data by Open-Meteo.com</a></header>
            <div id="dashWeather">${weatherPanel(cachedWeather())}</div>
          </section>

          <section class="panel" aria-labelledby="delHead">
            <header class="panel-head"><h2 id="delHead">Deliveries today</h2><a class="link" href="#/deliveries">All deliveries</a></header>
            ${dels.length ? `<ul class="timeline">${dels.map(d => `
              <li class="${d.status}"><time>${d.from}</time><div><b>${esc(d.load)}</b><span>${esc(d.gate)}, ${contractorTag(d.contractorId)}</span></div>
                ${badge(d.status === 'unloaded' ? 'Unloaded' : d.status === 'arrived' ? 'On site' : 'Booked', d.status === 'unloaded' ? 'ok-soft' : d.status === 'arrived' ? 'warn-soft' : 'info-soft')}</li>`).join('')}</ul>`
              : '<p class="panel-body muted">No deliveries booked for today.</p>'}
          </section>
        </div>
      </div>

      <section class="panel" aria-labelledby="feedHead">
        <header class="panel-head"><h2 id="feedHead">Latest on site</h2></header>
        ${events.length ? `<ul class="feed">${events.map(([at, ic, html]) => `<li>${icon(ic)}<p>${html}</p><time>${timeAgo(at)}</time></li>`).join('')}</ul>`
          : '<p class="panel-body muted">Nothing recorded in the last day and a half.</p>'}
      </section>`;
  },

  mount() {
    getWeather().then(w => { const el = document.getElementById('dashWeather'); if (el && w) el.innerHTML = weatherPanel(w); });
  }
};
