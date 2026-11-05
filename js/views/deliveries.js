// Deliveries: booked time slots at the gates, with clashes flagged before lorries queue on the street.

import * as store from '../store.js';
import { can } from '../auth.js';
import { esc, today, addDays, fmtDay, fmtDayLong, parseDay, nowIso, fmtTime, plural } from '../util.js';
import { icon } from '../icons.js';
import { toast, openDialog, closeDialog, confirmBox, badge, contractorTag, contractorOptions, field, options, emptyState } from '../ui.js';
import { DELIVERY_STATUS, GATES } from '../domain.js';
import * as D from '../derive.js';

const NEEDS = { crane: 'Crane', forklift: 'Forklift or telehandler', pump: 'Concrete pump', banksman: 'Signaller at the gate' };
const ui = { day: null };
const START = 6, END = 18;   // hours shown on the gate lanes

const minutes = hhmm => +hhmm.slice(0, 2) * 60 + +hhmm.slice(3, 5);

function strip() {
  const first = addDays(ui.day, -3);
  return `<div class="date-strip">${Array.from({ length: 7 }, (_, i) => addDays(first, i)).map(d => {
    const n = D.deliveriesOn(d).filter(x => x.status !== 'cancelled').length;
    const dt = parseDay(d);
    return `<a href="#/deliveries/${d}" class="ds-day ${d === ui.day ? 'on' : ''} ${d === today() ? 'today' : ''}" ${d === ui.day ? 'aria-current="date"' : ''}>
      <small>${dt.toLocaleDateString('en-GB', { weekday: 'short' })}</small><b>${dt.getDate()}</b><span>${n ? plural(n, 'delivery', 'deliveries') : 'none'}</span></a>`;
  }).join('')}</div>`;
}

function lanes(list, clash) {
  const span = (END - START) * 60;
  const pos = t => Math.max(0, Math.min(100, (100 * (minutes(t) - START * 60)) / span));
  const hours = Array.from({ length: END - START + 1 }, (_, i) => START + i);
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const showNow = ui.day === today() && nowMin > START * 60 && nowMin < END * 60;
  return `<div class="lanes">
    <div class="lane-scale"><span></span><div>${hours.map(h => `<i style="left:${(100 * (h - START)) / (END - START)}%">${String(h).padStart(2, '0')}</i>`).join('')}</div></div>
    ${GATES.map(g => `<div class="lane"><span class="lane-name">${g}</span><div class="lane-track">
      ${hours.map(h => `<b style="left:${(100 * (h - START)) / (END - START)}%"></b>`).join('')}
      ${list.filter(d => d.gate === g && d.status !== 'cancelled').map(d => `
        <button type="button" class="slot ${d.status} ${clash.has(d.id) ? 'clash' : ''}" style="left:${pos(d.from)}%;width:${Math.max(1.5, pos(d.to) - pos(d.from))}%;--c:${D.contractor(d.contractorId)?.color}"
          data-act="delOpen" data-id="${d.id}" data-tip="${esc(`${d.from}–${d.to} ${d.load}${clash.has(d.id) ? '. Clashes with ' + clash.get(d.id).join(', ') : ''}`)}">${d.from}</button>`).join('')}
      ${showNow ? `<span class="lane-now" style="left:${(100 * (nowMin - START * 60)) / span}%"></span>` : ''}
    </div></div>`).join('')}
  </div>`;
}

function table(list, clash) {
  if (!list.length) return emptyState('truck', 'No deliveries booked', can('delivery.edit') ? 'Book a slot so the gate and the crane are free when the lorry arrives.' : '');
  return `<div class="table-wrap"><table class="table rows-click">
    <thead><tr><th>Time</th><th>Load</th><th>Company</th><th>Gate</th><th>Needs</th><th>Status</th><th></th></tr></thead>
    <tbody>${list.map(d => `
      <tr class="${d.status === 'cancelled' ? 'dim' : ''}" data-act="delOpen" data-id="${d.id}" tabindex="0">
        <td class="nowrap"><b>${d.from}–${d.to}</b><small class="block">${d.ref}</small></td>
        <td><b>${esc(d.load)}</b><small class="block">${esc([d.supplier, d.vehicle].filter(Boolean).join(', '))}</small>
          ${clash.has(d.id) ? `<span class="clash-note">${icon('triangle-exclamation-point')}Clashes with ${clash.get(d.id).join(', ')}</span>` : ''}</td>
        <td data-label="Company">${contractorTag(d.contractorId)}</td>
        <td data-label="Gate">${esc(d.gate)}</td>
        <td data-label="Needs">${d.needs.length ? d.needs.map(n => `<span class="tag">${esc(NEEDS[n] || n)}</span>`).join(' ') : '<span class="muted">-</span>'}</td>
        <td data-label="Status">${badge(DELIVERY_STATUS[d.status].label, DELIVERY_STATUS[d.status].tone)}${d.arrivedAt ? `<small class="block">in ${fmtTime(d.arrivedAt)}</small>` : ''}</td>
        <td class="row-actions">${can('delivery.status') ? statusButton(d) : ''}</td>
      </tr>`).join('')}</tbody></table></div>`;
}

const statusButton = d => d.status === 'booked' ? `<button type="button" class="btn sm ghost" data-act="delStatus" data-id="${d.id}" data-status="arrived">Arrived</button>`
  : d.status === 'arrived' ? `<button type="button" class="btn sm ghost" data-act="delStatus" data-id="${d.id}" data-status="unloaded">Unloaded</button>` : '';

function body() {
  const list = D.deliveriesOn(ui.day);
  const clash = D.clashes(ui.day);
  return `${strip()}
    <section class="panel">
      <header class="panel-head"><h2>${fmtDayLong(ui.day)}</h2><span class="muted small">${plural(list.filter(d => d.status !== 'cancelled').length, 'delivery', 'deliveries')}</span></header>
      ${list.length ? lanes(list, clash) : ''}
      ${table(list, clash)}
    </section>`;
}

function form(d = {}) {
  return `<form id="delForm" data-submit="delSave" data-id="${d.id || ''}" novalidate>
    <div class="grid-3">
      ${field('Day', `<input type="date" name="day" required value="${d.day || ui.day}" data-change="delCheck">`)}
      ${field('From', `<input type="time" name="from" required step="900" value="${d.from || '08:00'}" data-change="delCheck">`)}
      ${field('To', `<input type="time" name="to" required step="900" value="${d.to || '08:30'}" data-change="delCheck">`)}
    </div>
    ${field('What is being delivered', `<input name="load" required maxlength="80" value="${esc(d.load || '')}" placeholder="For example: steel beams, 20 t">`)}
    <div class="grid-2">
      ${field('Supplier', `<input name="supplier" required maxlength="60" value="${esc(d.supplier || '')}">`)}
      ${field('For company', `<select name="contractorId" required>${contractorOptions(d.contractorId)}</select>`)}
    </div>
    <div class="grid-2">
      ${field('Gate', `<select name="gate" data-change="delCheck">${options(GATES, d.gate || GATES[0])}</select>`)}
      ${field('Vehicle', `<input name="vehicle" maxlength="60" value="${esc(d.vehicle || '')}" placeholder="Lorry with crane arm, van…">`)}
    </div>
    <fieldset class="field"><legend class="field-label">Needs on arrival</legend>
      <div class="chips">${Object.entries(NEEDS).map(([k, label]) => `<label class="chip-check"><input type="checkbox" name="needs" value="${k}" ${(d.needs || []).includes(k) ? 'checked' : ''}><span>${label}</span></label>`).join('')}</div></fieldset>
    ${field('Notes for the gate (optional)', `<textarea name="notes" rows="2" maxlength="300">${esc(d.notes || '')}</textarea>`)}
    <p id="delClash" class="advice warn" hidden></p>
  </form>`;
}

function openDetail(id) {
  const d = store.get('deliveries', id);
  if (!d) return;
  const clash = D.clashes(d.day).get(d.id);
  openDialog({
    title: d.load, label: `${d.ref}, ${fmtDay(d.day)}`, panel: true,
    body: `<div class="detail-top">${badge(DELIVERY_STATUS[d.status].label, DELIVERY_STATUS[d.status].tone)}</div>
      ${clash ? `<p class="advice warn">${icon('triangle-exclamation-point')}Same gate at the same time as ${clash.join(', ')}.</p>` : ''}
      <dl class="facts cols">
        <div><dt>Slot</dt><dd>${d.from}–${d.to}</dd></div>
        <div><dt>Gate</dt><dd>${esc(d.gate)}</dd></div>
        <div><dt>Supplier</dt><dd>${esc(d.supplier)}</dd></div>
        <div><dt>For</dt><dd>${contractorTag(d.contractorId)}</dd></div>
        <div><dt>Vehicle</dt><dd>${esc(d.vehicle || '-')}</dd></div>
        <div><dt>Booked by</dt><dd>${esc(d.bookedBy)}</dd></div>
      </dl>
      ${d.needs.length ? `<h3 class="sub-head">Needs on arrival</h3><p>${d.needs.map(n => `<span class="tag">${esc(NEEDS[n] || n)}</span>`).join(' ')}</p>` : ''}
      ${d.notes ? `<h3 class="sub-head">Notes</h3><p>${esc(d.notes)}</p>` : ''}
      <div class="detail-actions">
        ${can('delivery.status') ? statusButton(d) : ''}
        ${can('delivery.edit') && d.status === 'booked' ? `<button type="button" class="btn ghost" data-act="delEdit" data-id="${d.id}">${icon('pencil')}Change booking</button>
          <button type="button" class="btn danger-ghost" data-act="delCancel" data-id="${d.id}">Cancel delivery</button>` : ''}
      </div>`
  });
}

function checkClash() {
  const f = document.getElementById('delForm');
  const out = document.getElementById('delClash');
  if (!f || !out) return;
  const { day, from, to, gate } = { day: f.day.value, from: f.from.value, to: f.to.value, gate: f.gate.value };
  const hit = D.deliveriesOn(day).filter(d => d.id !== f.dataset.id && d.status !== 'cancelled' && d.gate === gate && d.from < to && from < d.to);
  out.hidden = !hit.length;
  out.innerHTML = hit.length ? `${icon('triangle-exclamation-point')}<span>${gate} is already booked ${hit.map(d => `${d.from}–${d.to} (${esc(d.load)})`).join(' and ')}. Pick another time or gate if you can.</span>` : '';
}

export default {
  meta: { key: 'deliveries', hideFor: ['worker'], label: 'Deliveries', icon: 'truck' },

  header(ctx) {
    ui.day = /^\d{4}-\d{2}-\d{2}$/.test(ctx.route.params[0] || '') ? ctx.route.params[0] : today();
    return {
      title: 'Deliveries',
      sub: 'Gate bookings, crane and unloading needs',
      actions: `<div class="day-nav">
        <a class="icon-btn" href="#/deliveries/${addDays(ui.day, -1)}" aria-label="Previous day">${icon('chevron-left')}</a>
        ${ui.day !== today() ? `<a class="btn ghost sm" href="#/deliveries/${today()}">Today</a>` : ''}
        <a class="icon-btn" href="#/deliveries/${addDays(ui.day, 1)}" aria-label="Next day">${icon('chevron-right')}</a></div>
        ${can('delivery.edit') ? `<button type="button" class="btn primary" data-act="delNew">${icon('plus')}<span>Book delivery</span></button>` : ''}`
    };
  },

  render: () => `<div id="delBody">${body()}</div>`,
  update() { const el = document.getElementById('delBody'); if (el) el.innerHTML = body(); },

  actions: {
    delOpen: el => openDetail(el.dataset.id),
    delNew() {
      openDialog({ title: 'Book a delivery', body: form(), wide: true,
        footer: `<button type="button" class="btn ghost" data-act="closeDialog">Cancel</button><button class="btn primary" type="submit" form="delForm">Book slot</button>` });
      checkClash();
    },
    delEdit(el) {
      const d = store.get('deliveries', el.dataset.id);
      openDialog({ title: `Change ${d.ref}`, body: form(d), wide: true,
        footer: `<button type="button" class="btn ghost" data-act="delOpen" data-id="${d.id}">Back</button><button class="btn primary" type="submit" form="delForm">Save booking</button>` });
      checkClash();
    },
    async delCancel(el, ctx) {
      const d = store.get('deliveries', el.dataset.id);
      if (!(await confirmBox({ title: `Cancel ${d.ref}?`, text: `${esc(d.load)} on ${fmtDay(d.day)} at ${d.from}. Let the supplier know too.`, ok: 'Cancel delivery', danger: true }))) return openDetail(d.id);
      store.update('deliveries', d.id, { status: 'cancelled' });
      store.audit(ctx.user, 'Cancelled delivery', d.ref);
      toast(`${d.ref} cancelled.`);
      ctx.refresh();
    },
    delStatus(el, ctx, e) {
      e?.stopPropagation();
      const d = store.get('deliveries', el.dataset.id);
      const status = el.dataset.status;
      store.update('deliveries', d.id, { status, ...(status === 'arrived' ? { arrivedAt: nowIso() } : { unloadedAt: nowIso() }) });
      store.audit(ctx.user, status === 'arrived' ? 'Delivery arrived' : 'Delivery unloaded', d.ref);
      toast(status === 'arrived' ? `${d.ref} marked as on site.` : `${d.ref} unloaded.`, 'ok');
      if (document.getElementById('dlg').open) openDetail(d.id);
      ctx.refresh();
    }
  },

  changes: { delCheck: () => checkClash() },

  submits: {
    delSave(form, v, btn, ctx) {
      if (v.to <= v.from) return toast('The slot must end after it starts.', 'err');
      const rec = { day: v.day, from: v.from, to: v.to, load: v.load, supplier: v.supplier, contractorId: v.contractorId, gate: v.gate,
        vehicle: v.vehicle, needs: v.needs || [], notes: v.notes };
      const id = form.dataset.id;
      let d;
      if (id) { d = store.update('deliveries', id, rec); store.audit(ctx.user, 'Changed delivery', d.ref); }
      else { d = store.insert('deliveries', { ref: store.nextRef('DEL'), ...rec, status: 'booked', bookedBy: ctx.user.name, arrivedAt: null }); store.audit(ctx.user, 'Booked delivery', d.ref); }
      closeDialog();
      const clash = D.clashes(d.day).get(d.id);
      toast(clash ? `${d.ref} booked, but it overlaps ${clash.join(', ')} at the ${d.gate.toLowerCase()}.` : `${d.ref} booked for ${fmtDay(d.day)} at ${d.from}.`, clash ? 'info' : 'ok', 6000);
      if (d.day !== ui.day) ctx.go(`#/deliveries/${d.day}`);
      else ctx.refresh();
    }
  }
};
