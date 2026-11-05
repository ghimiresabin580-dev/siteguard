// Facts worked out from the stored records, shared by several screens.

import * as store from './store.js';
import { today, daysUntil, dayOf, weekStart, addDays } from './util.js';

export const personForUser = user => user ? store.find('people', p => p.userId === user.id) : null;

export const attendanceToday = () => store.all('attendance').filter(a => a.day === today());
export const onSiteNow = () => attendanceToday().filter(a => !a.outAt);
export const isOnSite = personId => onSiteNow().some(a => a.personId === personId);

export const activitiesOn = day => store.all('activities').filter(a => a.start <= day && a.end >= day && a.status !== 'done');

export const spaForActivity = activityId => store.find('spas', s => s.activityId === activityId && s.status !== 'closed');
export const signaturesOn = (spa, day = today()) => (spa?.signatures || []).filter(s => dayOf(s.at) === day);
export const hasSignedToday = (spa, personId) => signaturesOn(spa).some(s => s.personId === personId);

export function permitState(p) {
  if (p.status === 'active' && Date.parse(p.validTo) < Date.now()) return 'expired';
  return p.status;
}
export const permitsFor = activityId => store.all('permits').filter(p => p.activityId === activityId);

export const openObservations = () => store.all('observations').filter(o => o.status !== 'closed');

export function deliveriesOn(day) {
  return store.all('deliveries').filter(d => d.day === day).sort((a, b) => a.from.localeCompare(b.from));
}
// Two bookings clash when they use the same gate at overlapping times
export function clashes(day) {
  const list = deliveriesOn(day).filter(d => d.status !== 'cancelled');
  const out = new Map();
  for (const a of list) for (const b of list) {
    if (a.id >= b.id || a.gate !== b.gate) continue;
    if (a.from < b.to && b.from < a.to) {
      out.set(a.id, [...(out.get(a.id) || []), b.ref]);
      out.set(b.id, [...(out.get(b.id) || []), a.ref]);
    }
  }
  return out;
}

export function equipmentState(e) {
  const left = daysUntil(e.validUntil);
  return { left, state: left < 0 ? 'expired' : left <= store.settings().warnDays ? 'soon' : 'ok' };
}

export const CARD_KEYS = ['safetyCard', 'hotWorkCard', 'firstAid', 'electrical'];
// Cleared to work: inducted and occupational safety card valid
export function personState(p) {
  const problems = [];
  if (!p.inductedOn) problems.push('Not inducted');
  if (!p.safetyCard) problems.push('No safety card');
  else if (daysUntil(p.safetyCard) < 0) problems.push('Safety card expired');
  if (p.hotWorkCard && daysUntil(p.hotWorkCard) < 0) problems.push('Hot work card expired');
  const soon = CARD_KEYS.some(k => p[k] && daysUntil(p[k]) >= 0 && daysUntil(p[k]) <= store.settings().warnDays);
  return { cleared: !problems.some(x => x !== 'Hot work card expired'), problems, soon };
}

export const briefingOn = day => store.find('briefings', b => b.day === day);

export const trThisWeek = () => store.all('tr').find(t => t.day >= weekStart(today()) && t.day <= addDays(weekStart(today()), 6)) || null;

export const zoneLabel = id => store.get('items', id)?.name || '';
export const contractor = id => store.get('contractors', id);
