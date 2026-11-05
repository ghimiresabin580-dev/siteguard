// Small helpers shared by every screen.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const uid = () => (crypto.randomUUID ? crypto.randomUUID()
  : 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36));

export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
export const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
export const initials = name => String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
export const byKey = (key, dir = 1) => (a, b) => (a[key] > b[key] ? dir : a[key] < b[key] ? -dir : 0);
export const sum = arr => arr.reduce((a, b) => a + b, 0);

// ---------- dates ----------
// Plain days are stored as "2026-11-05", moments as ISO strings in UTC.
export const pad = n => String(n).padStart(2, '0');
export const isoDay = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => isoDay();
export const parseDay = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, n) => { const d = parseDay(s); d.setDate(d.getDate() + n); return isoDay(d); };
export const dayDiff = (from, to) => {
  const a = parseDay(from), b = parseDay(to);
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 864e5);
};
export const daysUntil = s => dayDiff(today(), s);
export const isWeekend = s => [0, 6].includes(parseDay(s).getDay());
export const nowIso = () => new Date().toISOString();
export const dayOf = iso => isoDay(new Date(iso));

// a moment today (or n days away) at a local clock time, as ISO
export const at = (dayStr, hhmm) => {
  const d = parseDay(dayStr);
  const [h, m] = hhmm.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};
export const minutesAgo = m => new Date(Date.now() - m * 60000).toISOString();

const LOCALE = 'en-GB';
export const fmtDay = (s, opts = { weekday: 'short', day: 'numeric', month: 'short' }) =>
  s ? parseDay(s).toLocaleDateString(LOCALE, opts) : '';
export const fmtDayLong = s => fmtDay(s, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export const fmtDayShort = s => fmtDay(s, { day: 'numeric', month: 'short' });
export const fmtDayYear = s => fmtDay(s, { day: 'numeric', month: 'short', year: 'numeric' });
export const fmtTime = iso => iso ? new Date(iso).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' }) : '';
export const fmtDateTime = iso => {
  if (!iso) return '';
  const d = new Date(iso);
  const sameDay = isoDay(d) === today();
  return sameDay ? `Today ${fmtTime(iso)}` : `${d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' })} ${fmtTime(iso)}`;
};

// A full date and time for emails, which are read later: "Thu 5 Nov 2026, 12:33"
export const fmtStamp = iso => iso ? `${new Date(iso).toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}, ${fmtTime(iso)}` : '';

export function timeAgo(iso) {
  if (!iso) return 'never';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24 && dayOf(iso) === today()) return `${h} h ago`;
  const days = dayDiff(dayOf(iso), today());
  if (days === 1) return `yesterday ${fmtTime(iso)}`;
  if (days < 7) return `${days} days ago`;
  return fmtDayShort(dayOf(iso));
}

export function daysLeftText(n) {
  if (n < -1) return `Expired ${-n} days ago`;
  if (n === -1) return 'Expired yesterday';
  if (n === 0) return 'Ends today';
  if (n === 1) return 'Ends tomorrow';
  return `${n} days left`;
}

// Monday of the week a day belongs to
export const weekStart = s => { const d = parseDay(s); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return isoDay(d); };
export function isoWeek(s) {
  const d = parseDay(s);
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - yearStart) / 864e5 + 1) / 7);
}

export const greeting = () => {
  const h = new Date().getHours();
  return h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

// ---------- files ----------
export function download(filename, content, type = 'text/plain') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

export function toCSV(rows) {
  const cell = v => {
    const s = v == null ? '' : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n');
}

// ---------- forms ----------
// Reads a form into a plain object. Checkbox groups with the same name become arrays.
export function formValues(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === 'checkbox') {
      const group = form.querySelectorAll(`input[type=checkbox][name="${CSS.escape(el.name)}"]`).length > 1;
      if (group) { (out[el.name] ||= []); if (el.checked) out[el.name].push(el.value); }
      else out[el.name] = el.checked;
    } else if (el.type === 'radio') {
      if (el.checked) out[el.name] = el.value;
      else if (!(el.name in out)) out[el.name] = '';
    } else if (el.type !== 'file' && el.type !== 'submit' && el.type !== 'button') {
      out[el.name] = el.value.trim();
    }
  }
  return out;
}

export const debounce = (fn, ms = 200) => {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
};

// Deterministic random numbers for the sample data
export function seededRandom(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
