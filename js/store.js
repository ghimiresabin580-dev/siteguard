// Saves SiteGuard data in this browser (localStorage). Photos live in IndexedDB (photos.js).
// Every change goes through insert/update/remove so the screens can redraw.

import { buildSeed } from './seed.js';
import { uid, nowIso, today, dayDiff, addDays } from './util.js';

const KEY = 'siteguard.data.v2';
let data = null;
let persistent = true;
const listeners = new Set();

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
    persistent = false;
  }
  if (!data || data.version !== 2) { data = buildSeed(); save(); }
  rollDemoDates();
  return data;
}

export const isPersistent = () => persistent;

export function save() {
  if (!persistent) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (e) {
    if (e && (e.name === 'QuotaExceededError' || e.code === 22)) throw new Error('Storage on this device is full. Export a backup in Admin > Data and remove old records.');
    persistent = false;
  }
}

export const onChange = fn => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = (name) => listeners.forEach(fn => { try { fn(name); } catch (e) { console.error(e); } });

// ---------- reading ----------
export const all = name => data[name] || [];
export const get = (name, id) => all(name).find(r => r.id === id) || null;
export const find = (name, fn) => all(name).find(fn) || null;
export const settings = () => data.settings;

// ---------- writing ----------
export function insert(name, record, { front = false } = {}) {
  const rec = { id: uid(), createdAt: nowIso(), ...record };
  data[name] ||= [];
  front ? data[name].unshift(rec) : data[name].push(rec);
  save(); emit(name);
  return rec;
}

export function update(name, id, patch) {
  const rec = get(name, id);
  if (!rec) throw new Error('That record no longer exists. Reload the page.');
  Object.assign(rec, typeof patch === 'function' ? patch(rec) : patch, { updatedAt: nowIso() });
  save(); emit(name);
  return rec;
}

export function remove(name, id) {
  const list = all(name);
  const k = list.findIndex(r => r.id === id);
  if (k >= 0) { list.splice(k, 1); save(); emit(name); }
}

export function setSettings(patch) {
  Object.assign(data.settings, patch);
  save(); emit('settings');
}

// Next reference number: nextRef('DWB') -> "DWB-0158"
export function nextRef(prefix) {
  data.counters[prefix] = (data.counters[prefix] || 0) + 1;
  save();
  return `${prefix}-${String(data.counters[prefix]).padStart(4, '0')}`;
}

// ---------- audit trail ----------
export function audit(user, action, detail = '') {
  data.audit.unshift({ id: uid(), at: nowIso(), userId: user?.id || null, userName: user?.name || 'System', action, detail });
  if (data.audit.length > 800) data.audit.length = 800;
  save();
}

// ---------- backup ----------
export const exportData = () => JSON.stringify({ ...data, exportedAt: nowIso() }, null, 2);

export function importData(text) {
  const parsed = JSON.parse(text);
  if (parsed.version !== 2 || !Array.isArray(parsed.users) || !parsed.settings) throw new Error('This file is not a SiteGuard backup.');
  delete parsed.exportedAt;
  data = parsed;
  save(); emit('*');
}

export function resetData() {
  data = buildSeed();
  save(); emit('*');
}

// ---------- demo mode ----------
// The sample site is created relative to the day it was loaded. When "keep demo dates current"
// is on, every stored date moves forward by the days that have passed, so the demo never goes stale.
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const SKIP = new Set(['outbox', 'audit', 'counters', 'settings']);

function shift(value, days) {
  if (DAY_RE.test(value)) return addDays(value, days);
  if (TS_RE.test(value)) { const d = new Date(value); d.setDate(d.getDate() + days); return d.toISOString(); }
  return value;
}
function walk(obj, days) {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (typeof v === 'string') obj[k] = shift(v, days);
    else if (v && typeof v === 'object') walk(v, days);
  }
}
function rollDemoDates() {
  const t = today();
  const days = dayDiff(data.rolledOn || t, t);
  if (days <= 0) return;
  if (data.settings.keepDemoCurrent) {
    for (const name of Object.keys(data)) {
      if (SKIP.has(name) || !Array.isArray(data[name])) continue;
      if (name === 'users') data.users.forEach(u => { u.createdAt = shift(u.createdAt, days); });
      else walk(data[name], days);
    }
  }
  data.rolledOn = t;
  save();
}
