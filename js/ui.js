// Building blocks for the screens: dialogs, side panels, toasts and small pieces of markup.

import { esc, initials, $ } from './util.js';
import { icon } from './icons.js';
import * as store from './store.js';

// ---------- toasts ----------
export function toast(message, tone = 'info', ms) {
  if (!message) return;
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = `toast ${tone}`;
  el.setAttribute('role', tone === 'err' ? 'alert' : 'status');
  el.innerHTML = `${icon(tone === 'err' ? 'circle-x' : tone === 'ok' ? 'circle-check' : 'info')}<span>${esc(message)}</span>`;
  box.appendChild(el);
  while (box.children.length > 3) box.firstElementChild.remove();
  const remove = () => { el.classList.add('out'); setTimeout(() => el.remove(), 200); };
  el.addEventListener('click', remove);
  setTimeout(remove, ms || (tone === 'err' ? 7000 : 4200));
}

// ---------- dialogs (centred) and panels (from the right) ----------
let onDialogClose = null;

export function openDialog({ title, body, footer = '', wide = false, panel = false, onClose = null, label = '' }) {
  const dlg = $('#dlg');
  if (dlg.open) {
    // replacing an open dialog: finish the old one now, the queued close event is ignored below
    const prev = onDialogClose; onDialogClose = null;
    dlg.close();
    if (prev) prev();
  }
  dlg.className = panel ? 'panel' : wide ? 'wide' : '';
  dlg.innerHTML = `
    <div class="dlg-shell">
      <header class="dlg-head">
        <div>${label ? `<p class="dlg-label">${label}</p>` : ''}<h2 id="dlgTitle">${title}</h2></div>
        <button type="button" class="icon-btn" data-act="closeDialog" aria-label="Close">${icon('x')}</button>
      </header>
      <div class="dlg-body">${body}</div>
      ${footer ? `<footer class="dlg-foot">${footer}</footer>` : ''}
    </div>`;
  dlg.setAttribute('aria-labelledby', 'dlgTitle');
  onDialogClose = onClose;
  dlg.showModal();
  const first = dlg.querySelector('[autofocus]') || dlg.querySelector('.dlg-body input:not([type=hidden]):not([type=checkbox]):not([type=radio]), .dlg-body select, .dlg-body textarea');
  if (first && !panel) setTimeout(() => first.focus(), 30);
  return dlg;
}

export function closeDialog() {
  const dlg = $('#dlg');
  if (dlg.open) dlg.close();
}

export function setupDialog() {
  const dlg = $('#dlg');
  dlg.addEventListener('close', () => {
    if (dlg.open) return;   // already showing the next dialog
    const fn = onDialogClose; onDialogClose = null;
    dlg.innerHTML = '';
    if (fn) fn();
  });
  // click on the dimmed backdrop closes the dialog
  dlg.addEventListener('mousedown', e => { if (e.target === dlg) dlg.close(); });
}

export function confirmBox({ title, text, ok = 'Confirm', danger = false }) {
  return new Promise(resolve => {
    let answer = false;
    openDialog({
      title,
      body: `<p class="lead">${text}</p>`,
      footer: `<button type="button" class="btn ghost" data-act="closeDialog">Cancel</button>
        <button type="button" class="btn ${danger ? 'danger' : 'primary'}" id="confirmOk">${ok}</button>`,
      onClose: () => resolve(answer)
    });
    $('#confirmOk').addEventListener('click', () => { answer = true; closeDialog(); });
    setTimeout(() => $('#confirmOk')?.focus(), 30);
  });
}

// ---------- small pieces ----------
export const badge = (text, tone = 'neutral', ic = '') => `<span class="badge ${tone}">${ic ? icon(ic) : ''}${esc(text)}</span>`;

export function avatar(name, color, size = '') {
  return `<span class="avatar ${size}" style="${color ? `--av:${color}` : ''}" aria-hidden="true">${esc(initials(name))}</span>`;
}

export function contractorMark(c, size = '') {
  if (!c) return `<span class="cmark ${size}" style="--c:#8696a7">?</span>`;
  return `<span class="cmark ${size}" style="--c:${c.color}" title="${esc(c.name)}">${esc(c.short)}</span>`;
}
export function contractorTag(id) {
  const c = store.get('contractors', id);
  if (!c) return '<span class="muted">Not assigned</span>';
  return `<span class="ctag"><i style="--c:${c.color}"></i>${esc(c.name)}</span>`;
}
export const contractorName = id => store.get('contractors', id)?.name || '';
export const zoneName = id => store.get('items', id)?.name || '';

export function emptyState(ic, title, text = '', action = '') {
  return `<div class="empty">${icon(ic)}<h3>${title}</h3>${text ? `<p>${text}</p>` : ''}${action}</div>`;
}

export const options = (list, selected, { blank } = {}) =>
  (blank !== undefined ? `<option value="">${esc(blank)}</option>` : '') +
  list.map(o => {
    const [value, label] = Array.isArray(o) ? o : [o.value ?? o.id ?? o, o.label ?? o.name ?? o];
    return `<option value="${esc(value)}" ${String(value) === String(selected ?? '') ? 'selected' : ''}>${esc(label)}</option>`;
  }).join('');

export const contractorOptions = (selected, blank = 'Choose a company') =>
  options(store.all('contractors').map(c => [c.id, c.name]), selected, { blank });

export const zoneOptions = (selected, blank = 'Choose a place') =>
  options(store.all('items').map(i => [i.id, i.name]), selected, { blank });

export function field(label, control, hint = '', cls = '') {
  return `<label class="field ${cls}"><span class="field-label">${label}</span>${control}${hint ? `<small class="field-hint">${hint}</small>` : ''}</label>`;
}

export function segmented(name, list, value) {
  return `<div class="segmented" role="radiogroup">${list.map(([v, label, ic]) => `
    <label class="seg"><input type="radio" name="${name}" value="${esc(v)}" ${String(v) === String(value) ? 'checked' : ''}>
      <span>${ic ? icon(ic) : ''}${esc(label)}</span></label>`).join('')}</div>`;
}

export function tabs(list, active, act = 'tab') {
  return `<div class="tabs" role="tablist">${list.map(([key, label, count]) => `
    <button type="button" role="tab" class="tab ${key === active ? 'on' : ''}" aria-selected="${key === active}" data-act="${act}" data-key="${key}">
      ${esc(label)}${count != null ? `<span class="tab-count">${count}</span>` : ''}</button>`).join('')}</div>`;
}

export const progress = (value, max, tone = '') =>
  `<div class="meter ${tone}" role="progressbar" aria-valuenow="${value}" aria-valuemin="0" aria-valuemax="${max}"><i style="width:${max ? Math.round(100 * value / max) : 0}%"></i></div>`;

// shows a loading state on a button while the promise runs
export async function busy(btn, fn, text = 'Working…') {
  if (!btn) return fn();
  const old = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner" aria-hidden="true"></span>${esc(text)}`;
  try { return await fn(); }
  finally { if (btn.isConnected) { btn.disabled = false; btn.innerHTML = old; } }
}
