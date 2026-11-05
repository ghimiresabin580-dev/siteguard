// Accounts, sign-in and permissions.
// Passwords are never stored: only a salted PBKDF2-SHA256 hash (120 000 rounds, WebCrypto).
// On the static website the accounts live in this browser (see store.js).

import { CONFIG } from './config.js';
import * as store from './store.js';
import { nowIso } from './util.js';

export const ROLES = {
  admin: { label: 'Administrator', summary: 'Everything, plus users, email and site settings' },
  manager: { label: 'Site manager', summary: 'Runs the site: plans, permits, deliveries and reports' },
  hse: { label: 'HSE coordinator', summary: 'Safety: permits, observations, inspections and reports' },
  supervisor: { label: 'Supervisor', summary: 'Contractor lead: plans work, writes SPAs, requests permits' },
  worker: { label: 'Worker', summary: 'Raises observations and signs SPAs' }
};

const LEAD = ['meeting.run', 'activity.edit', 'delivery.edit', 'delivery.status', 'obs.create', 'obs.manage', 'spa.edit', 'spa.sign',
  'permit.request', 'permit.approve', 'check.do', 'lift.do', 'tr.do', 'plant.edit', 'people.edit', 'attendance.edit', 'zone.edit',
  'report.send', 'contractor.edit'];
const PERMS = {
  admin: ['*'],
  manager: LEAD,
  hse: LEAD,
  supervisor: ['activity.edit', 'delivery.edit', 'delivery.status', 'obs.create', 'spa.edit', 'spa.sign', 'permit.request', 'check.do',
    'lift.do', 'attendance.edit', 'people.edit'],
  worker: ['obs.create', 'spa.sign', 'attendance.self']
};

export function can(perm, user = currentUser()) {
  if (!user) return false;
  const list = PERMS[user.role] || [];
  return list.includes('*') || list.includes(perm);
}
export const isAdmin = (user = currentUser()) => user?.role === 'admin';

// ---------- hashing ----------
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const unhex = s => new Uint8Array(s.match(/../g).map(h => parseInt(h, 16)));
export const secureContextOk = () => !!(window.crypto && crypto.subtle);

async function pbkdf2(password, saltHex, iterations = 120000) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unhex(saltHex), iterations }, key, 256);
  return hex(bits);
}
const randomHex = bytes => hex(crypto.getRandomValues(new Uint8Array(bytes)));

async function hashFor(password) {
  const salt = randomHex(16);
  return { salt, pwHash: await pbkdf2(password, salt), iterations: 120000 };
}

// constant-time compare of two hex strings
function same(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function passwordProblem(pw) {
  if (pw.length < 10) return 'Use at least 10 characters.';
  if (!/[A-Za-zÀ-ÿ]/.test(pw) || !/\d/.test(pw)) return 'Use both letters and numbers.';
  if (/^(.)\1+$/.test(pw)) return 'Choose a less predictable password.';
  return null;
}

export function passwordStrength(pw) {
  let s = 0;
  if (pw.length >= 10) s++;
  if (pw.length >= 14) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(4, s); // 0-4
}

// ---------- session ----------
const SESSION_KEY = 'siteguard.session';
let session = null;

function readSession() {
  for (const box of [sessionStorage, localStorage]) {
    try {
      const raw = box.getItem(SESSION_KEY);
      if (raw) return JSON.parse(raw);
    } catch { /* storage blocked */ }
  }
  return null;
}
function writeSession(s, remember) {
  try {
    sessionStorage.removeItem(SESSION_KEY); localStorage.removeItem(SESSION_KEY);
    if (s) (remember ? localStorage : sessionStorage).setItem(SESSION_KEY, JSON.stringify(s));
  } catch { /* storage blocked: session lasts until reload */ }
}

export function currentUser() {
  if (!session) session = readSession();
  if (!session) return null;
  const user = store.get('users', session.userId);
  const valid = user && user.status === 'active' && user.sessionVersion === session.version && Date.now() < session.expiresAt;
  if (!valid) { session = null; writeSession(null); return null; }
  return user;
}

// Keeps an active session alive (idle sessions end after CONFIG.sessionHours)
export function touchSession() {
  if (!session || session.remember) return;
  session.expiresAt = Date.now() + CONFIG.sessionHours * 3600e3;
  writeSession(session, false);
}

export async function signIn(email, password, remember) {
  if (!secureContextOk()) return { error: 'Sign-in needs a secure connection. Open the site with https://.' };
  const user = store.find('users', u => u.email.toLowerCase() === String(email).trim().toLowerCase());
  if (!user) {
    await pbkdf2(password || 'x', '00000000000000000000000000000000'); // same timing as a wrong password
    return { error: 'Email or password is wrong.' };
  }
  if (user.lockedUntil && Date.now() < Date.parse(user.lockedUntil)) {
    const mins = Math.ceil((Date.parse(user.lockedUntil) - Date.now()) / 60000);
    return { error: `Too many failed attempts. Try again in ${mins} min, or ask the site administrator to reset your password.` };
  }
  const hash = await pbkdf2(password, user.salt, user.iterations);
  if (!same(hash, user.pwHash)) {
    const failed = (user.failed || 0) + 1;
    const lock = failed >= CONFIG.maxFailedSignIns;
    store.update('users', user.id, { failed: lock ? 0 : failed, lockedUntil: lock ? new Date(Date.now() + CONFIG.lockMinutes * 60000).toISOString() : null });
    store.audit(user, 'Failed sign-in', lock ? 'Account locked for ' + CONFIG.lockMinutes + ' min' : `Attempt ${failed}`);
    const left = CONFIG.maxFailedSignIns - failed;
    return { error: lock ? `Too many failed attempts. The account is locked for ${CONFIG.lockMinutes} minutes.`
      : `Email or password is wrong.${left <= 2 ? ` ${left} ${left === 1 ? 'try' : 'tries'} left before the account locks.` : ''}` };
  }
  if (user.status === 'pending') return { error: 'Your access request is waiting for the site administrator to approve it.' };
  if (user.status === 'disabled') return { error: 'This account has been switched off. Contact the site administrator.' };

  store.update('users', user.id, { failed: 0, lockedUntil: null, lastLoginAt: nowIso() });
  session = {
    userId: user.id, version: user.sessionVersion, remember: !!remember,
    expiresAt: Date.now() + (remember ? CONFIG.rememberDays * 864e5 : CONFIG.sessionHours * 3600e3)
  };
  writeSession(session, remember);
  store.audit(user, 'Signed in', remember ? 'Kept signed in on this device' : '');
  return { user };
}

export function signOut() {
  const user = currentUser();
  if (user) store.audit(user, 'Signed out');
  session = null;
  writeSession(null);
}

export async function changePassword(user, current, next) {
  if (!user.mustChangePassword) {
    const ok = same(await pbkdf2(current, user.salt, user.iterations), user.pwHash);
    if (!ok) return { error: 'Your current password is wrong.' };
  }
  const problem = passwordProblem(next);
  if (problem) return { error: problem };
  const h = await hashFor(next);
  const version = user.sessionVersion + 1;
  store.update('users', user.id, { ...h, mustChangePassword: false, sessionVersion: version });
  session = { ...(session || readSession()), userId: user.id, version };
  writeSession(session, session.remember);
  store.audit(user, 'Changed password');
  return { ok: true };
}

export async function requestAccess({ name, email, password, companyId, trade, phone, note }) {
  if (!secureContextOk()) return { error: 'Registration needs a secure connection (https).' };
  if (!name || !email) return { error: 'Fill in your name and email.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'That email address does not look right.' };
  if (store.find('users', u => u.email.toLowerCase() === email.toLowerCase())) return { error: 'There is already an account with this email. Sign in instead.' };
  const problem = passwordProblem(password);
  if (problem) return { error: problem };
  const user = store.insert('users', {
    name, email, role: 'worker', title: trade || '', companyId: companyId || null, phone: phone || '', note: note || '',
    ...(await hashFor(password)), status: 'pending', lastLoginAt: null, failed: 0, lockedUntil: null, mustChangePassword: false, sessionVersion: 1
  });
  store.audit(user, 'Requested access', email);
  return { user };
}

// Admin tools
export async function createUser(fields, admin) {
  const password = tempPassword();
  const user = store.insert('users', {
    ...fields, ...(await hashFor(password)), status: 'active', lastLoginAt: null, failed: 0, lockedUntil: null,
    mustChangePassword: true, sessionVersion: 1
  });
  store.audit(admin, 'Created user', `${user.name} (${ROLES[user.role].label})`);
  return { user, password };
}

export async function resetPassword(userId, admin) {
  const password = tempPassword();
  const user = store.get('users', userId);
  store.update('users', userId, { ...(await hashFor(password)), mustChangePassword: true, failed: 0, lockedUntil: null, sessionVersion: user.sessionVersion + 1 });
  store.audit(admin, 'Reset password', user.name);
  return password;
}

export function tempPassword() {
  const words = ['Kivi', 'Routa', 'Halla', 'Kide', 'Virta', 'Tuuli', 'Valo', 'Lumi', 'Kallio', 'Joki'];
  const pick = () => words[crypto.getRandomValues(new Uint32Array(1))[0] % words.length];
  const digits = String(crypto.getRandomValues(new Uint32Array(1))[0] % 10000).padStart(4, '0');
  return `${pick()}-${pick()}-${digits}`;
}
