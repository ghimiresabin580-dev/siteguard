// Email notifications. The site is static (GitHub Pages), so emails go through FormSubmit:
// https://formsubmit.co - a JSON POST to /ajax/<address> is delivered to that inbox.
// Every email is logged in the outbox (Admin > Email) with its result.

import { CONFIG } from './config.js';
import * as store from './store.js';
import { nowIso, today, dayOf } from './util.js';

export const EVENTS = {
  highObservation: 'High-severity observations and near misses',
  allObservations: 'Every new observation',
  permitRequest: 'Permits waiting for approval',
  permitExpiring: 'Permits about to run out',
  inspectionDue: 'Plant inspections ending or expired',
  cardExpiring: 'Workers’ safety cards ending or expired',
  accessRequest: 'New access requests and password resets'
};

const validTarget = to => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || /^[a-f0-9]{20,64}$/i.test(to);
const appLink = hash => location.origin + location.pathname + (hash || '');

/**
 * Sends an email to the site's notification address.
 * @param {object} o
 * @param {string} o.event   key from EVENTS for automatic emails, or 'manual'
 * @param {string} o.subject
 * @param {object} o.fields  rows of the email (label: value)
 * @param {string} [o.link]  in-app link such as '#/permits/ptw-PTW-0318'
 * @param {object} [o.user]  who caused the email
 */
export async function sendEmail({ event = 'manual', subject, fields, link, user }) {
  const s = store.settings();
  const to = (s.mailTo || '').trim();

  if (!s.mailEnabled) return log({ event, subject, fields, to, status: 'off', note: 'Email notifications are switched off.' });
  if (event !== 'manual' && event !== 'test' && !s.events?.[event]) return { status: 'skipped' };
  if (!validTarget(to)) return log({ event, subject, fields, to, status: 'failed', note: 'The notification address is not valid.' });

  const sentToday = store.all('outbox').filter(m => ['sent', 'activation'].includes(m.status) && dayOf(m.at) === today()).length;
  if (sentToday >= (s.dailyLimit || CONFIG.mail.dailyLimit)) {
    return log({ event, subject, fields, to, status: 'limit', note: `Daily limit of ${s.dailyLimit} emails reached. It will not be sent.` });
  }

  const entry = log({ event, subject, fields: { ...fields, ...(user ? { 'Sent by': user.name } : {}) }, link, to, status: 'sending' });
  return deliver(entry);
}

async function deliver(entry) {
  const payload = {
    _subject: entry.subject,
    _template: 'table',
    _captcha: 'false',
    ...entry.fields,
    Site: `${store.settings().siteName}, ${store.settings().project}`,
    ...(entry.link ? { 'Open in SiteGuard': appLink(entry.link) } : {})
  };
  let status, note = '';
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(CONFIG.mail.endpoint + entry.to, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal
    });
    clearTimeout(timer);
    let body = null;
    try { body = await res.json(); } catch { /* not JSON */ }
    const message = body?.message || '';
    if (res.ok && (body?.success === true || body?.success === 'true')) status = 'sent';
    else if (/activat/i.test(message) || (res.ok && !body)) {
      // a first email to a new address, or an HTML page instead of JSON, means the form is not activated yet
      status = 'activation';
      note = 'FormSubmit sent an activation link to this address. Open it once and emails start arriving.';
    }
    else { status = 'failed'; note = message || `The email service answered ${res.status}.`; }
  } catch (e) {
    status = navigator.onLine === false || e.name === 'TypeError' || e.name === 'AbortError' ? 'queued' : 'failed';
    note = status === 'queued' ? 'No connection. It will be sent when the device is back online.' : e.message;
  }
  store.update('outbox', entry.id, { status, note, tries: (entry.tries || 0) + 1, sentAt: status === 'sent' ? nowIso() : entry.sentAt || null });
  return { status, note, to: entry.to };
}

function log({ event, subject, fields, link, to, status, note = '' }) {
  return store.insert('outbox', { at: nowIso(), event, subject, fields, link: link || null, to, status, note, tries: 0 }, { front: true });
}

export async function retry(id) {
  const entry = store.get('outbox', id);
  if (!entry) return null;
  store.update('outbox', id, { status: 'sending', to: store.settings().mailTo });
  return deliver(store.get('outbox', id));
}

// Sends emails that were written while the device was offline
export async function flushQueue() {
  if (navigator.onLine === false) return;
  const stale = m => m.status === 'sending' && Date.now() - Date.parse(m.at) > 120000;   // page closed while sending
  const queued = store.all('outbox').filter(m => (m.status === 'queued' || stale(m)) && (m.tries || 0) < 6);
  for (const m of queued) await retry(m.id);
}

export function describe(result) {
  if (!result) return '';
  switch (result.status) {
    case 'sent': return `Email sent to ${result.to}`;
    case 'activation': return 'Email waiting for activation: open the FormSubmit email in the inbox once.';
    case 'queued': return 'No connection. The email will go out when you are back online.';
    case 'limit': return 'Daily email limit reached, so no email was sent.';
    case 'off': return 'Email notifications are switched off in Admin > Email.';
    case 'skipped': return '';
    default: return 'The email could not be sent: ' + (result.note || 'unknown error');
  }
}

export const OUTBOX_STATUS = {
  sending: { label: 'Sending', tone: 'info-soft' },
  sent: { label: 'Sent', tone: 'ok-soft' },
  activation: { label: 'Needs activation', tone: 'warn-soft' },
  queued: { label: 'Waiting for connection', tone: 'warn-soft' },
  failed: { label: 'Failed', tone: 'danger-soft' },
  limit: { label: 'Daily limit', tone: 'neutral' },
  off: { label: 'Email off', tone: 'neutral' }
};
