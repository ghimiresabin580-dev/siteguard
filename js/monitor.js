// Background checks while SiteGuard is open: plant inspections, permits that are running out
// and workers' cards. Each one notifies once per stage (ending soon, expired) by in-app alert and email.

import * as store from './store.js';
import { sendEmail } from './mail.js';
import { daysUntil, daysLeftText, fmtDayYear, fmtTime, fmtStamp, nowIso } from './util.js';

export function notify(kind, title, body, link) {
  store.insert('notifications', { at: nowIso(), kind, title, body, link, readBy: [] }, { front: true });
  const list = store.all('notifications');
  if (list.length > 150) list.length = 150;
}

const stage = days => (days < 0 ? 2 : days <= store.settings().warnDays ? 1 : 0);

function checkEquipment() {
  const due = [];
  for (const e of store.all('equipment')) {
    const need = stage(daysUntil(e.validUntil));
    if (need > (e.noticeLevel || 0)) due.push([e, need]);
    else if (need < (e.noticeLevel || 0)) store.update('equipment', e.id, { noticeLevel: need, noticeAt: null });
  }
  if (!due.length) return;
  for (const [e, need] of due) {
    store.update('equipment', e.id, { noticeLevel: need, noticeAt: nowIso() });
    notify('plant', need === 2 ? `${e.reg} inspection has expired` : `${e.reg} inspection ends ${daysUntil(e.validUntil) === 0 ? 'today' : 'soon'}`,
      `${e.name}: valid until ${fmtDayYear(e.validUntil)}`, '#/plant');
  }
  const expired = due.filter(([, n]) => n === 2).length;
  const subject = due.length === 1
    ? `${expired ? 'Inspection expired' : 'Inspection ends soon'}: ${due[0][0].name} (${due[0][0].reg})`
    : `${due.length} machines need inspection${expired ? `, ${expired} expired` : ''}`;
  const fields = { 'What happened': expired ? 'A machine on site has an expired inspection and must not be used until it is inspected.' : 'Book the next inspection before these run out.' };
  for (const [e] of due) fields[`${e.reg} ${e.name}`] = `${daysLeftText(daysUntil(e.validUntil))} (valid until ${fmtDayYear(e.validUntil)})`;
  sendEmail({ event: 'inspectionDue', subject, fields, link: '#/plant' });
}

function checkPermits() {
  const now = Date.now();
  for (const p of store.all('permits')) {
    if (p.status !== 'active' || p.expiryNotified) continue;
    const left = Date.parse(p.validTo) - now;
    if (left > 60 * 60000) continue;
    store.update('permits', p.id, { expiryNotified: true });
    const ended = left <= 0;
    notify('permit', `${p.ref} ${ended ? 'has run out' : 'runs out within the hour'}`, `${p.title}. Close it or issue a new permit.`, `#/permits/${p.id}`);
    sendEmail({
      event: 'permitExpiring',
      subject: `${p.ref} ${ended ? 'has run out' : 'runs out at ' + fmtTime(p.validTo)}: ${p.title}`,
      fields: { Permit: `${p.ref} ${p.title}`, 'Valid until': fmtStamp(p.validTo), 'Requested by': p.requestedBy, 'What to do': 'Close the permit when the work is finished, or issue a new one before work continues.' },
      link: `#/permits/${p.id}`
    });
  }
}

const CARDS = { safetyCard: 'Occupational safety card', hotWorkCard: 'Hot work card', firstAid: 'First aid certificate', electrical: 'Electrical safety card (SFS 6002)' };

function checkCards() {
  const due = [];
  for (const p of store.all('people')) {
    const notice = { ...(p.cardNotice || {}) };
    let changed = false;
    for (const key of Object.keys(CARDS)) {
      if (!p[key]) continue;
      const need = stage(daysUntil(p[key]));
      if (need > (notice[key] || 0)) { due.push([p, key, need]); notice[key] = need; changed = true; }
      else if (need < (notice[key] || 0)) { notice[key] = need; changed = true; }
    }
    if (changed) store.update('people', p.id, { cardNotice: notice });
  }
  if (!due.length) return;
  for (const [p, key, need] of due) notify('people', `${p.name}: ${CARDS[key].toLowerCase()} ${need === 2 ? 'has expired' : 'ends soon'}`, daysLeftText(daysUntil(p[key])), '#/workforce');
  const fields = { 'What to do': 'Ask the contractor for a renewed card before the worker continues on site.' };
  for (const [p, key] of due) fields[`${CARDS[key]}: ${p.name}, ${store.get('contractors', p.contractorId)?.name || ''}`] = `${daysLeftText(daysUntil(p[key]))} (${fmtDayYear(p[key])})`;
  sendEmail({ event: 'cardExpiring', subject: due.length === 1 ? `${CARDS[due[0][1]]} ending: ${due[0][0].name}` : `${due.length} safety cards need renewing`, fields, link: '#/workforce' });
}

export function runChecks() {
  try { checkEquipment(); checkPermits(); checkCards(); }
  catch (e) { console.error('Background check failed', e); }
}

export const unreadCount = user => store.all('notifications').filter(n => !n.readBy.includes(user.id)).length;
export const CARD_LABELS = CARDS;
