// Inspection checklists: the templates people can run, scoring, and a few demo records.

import * as store from './store.js';
import { today, addDays } from './util.js';

// critical: a failed answer raises a high-risk hazard instead of medium
export const TEMPLATES = [
  {
    key: 'scaffold', tone: 'amber', title: 'Scaffold', icon: 'construction', every: 'Weekly and after bad weather', items: [
      { t: 'Scaffold tag is in place and in date', critical: true },
      { t: 'Base plates and sole boards are sound and level' },
      { t: 'Guardrails, mid-rails and toe boards are complete', critical: true },
      { t: 'Platforms are fully boarded with no gaps' },
      { t: 'Access ladder is tied and extends 1 m above the platform' },
      { t: 'Ties and anchors are in place as designed', critical: true },
      { t: 'No materials stored beyond the load class' },
      { t: 'Debris netting and sheeting are intact' }
    ]
  },
  {
    key: 'ladder', tone: 'blue', title: 'Ladder', icon: 'arrow-up-to-line', every: 'Before each use', items: [
      { t: 'Stiles are straight and undamaged' },
      { t: 'Rungs, feet and locking bars are intact', critical: true },
      { t: 'Standing on firm, level ground at about 1 in 4' },
      { t: 'Tied, footed or secured against slipping', critical: true },
      { t: 'Used only for short, light work' }
    ]
  },
  {
    key: 'ppe', tone: 'green', title: 'PPE', icon: 'hard-hat', every: 'Daily, at the gate', items: [
      { t: 'Hard hat is worn and within its date' },
      { t: 'High-visibility clothing is clean and visible' },
      { t: 'Safety boots are worn' },
      { t: 'Eye protection is worn for the task' },
      { t: 'Gloves suit the work' },
      { t: 'Hearing protection is used in noisy areas' },
      { t: 'Site ID card with tax number is visible' }
    ]
  },
  {
    key: 'excavation', tone: 'earth', title: 'Excavation', icon: 'shovel', every: 'Daily, before work starts', items: [
      { t: 'Edge protection is at least 1 m back from the edge', critical: true },
      { t: 'Sides are shored or battered back as planned', critical: true },
      { t: 'Spoil heaps are at least 1 m from the edge' },
      { t: 'Safe ladder access is in place' },
      { t: 'Underground services are located and marked', critical: true },
      { t: 'Water is under control' },
      { t: 'Vehicles are kept back with stop blocks' }
    ]
  },
  {
    key: 'fire', tone: 'red', title: 'Fire and hot work', icon: 'flame', every: 'Before and after hot work', items: [
      { t: 'Hot work permit is valid and on site', critical: true },
      { t: 'Extinguishers are present and in date' },
      { t: 'Combustibles are cleared or covered within 10 m' },
      { t: 'Fire watch is planned for at least 1 hour after', critical: true },
      { t: 'Gas cylinders are upright, chained and capped' },
      { t: 'Escape routes and fire exits are clear' }
    ]
  },
  {
    key: 'electrical', tone: 'violet', title: 'Electrical', icon: 'zap', every: 'Weekly', items: [
      { t: 'Distribution boards are closed, locked and labelled' },
      { t: 'Residual current devices tested this week', critical: true },
      { t: 'Cables run overhead or are protected on walkways' },
      { t: 'No damaged leads, plugs or tools', critical: true },
      { t: 'Site lighting works in all work areas' }
    ]
  },
  {
    key: 'housekeeping', tone: 'teal', title: 'Housekeeping', icon: 'recycle', every: 'Daily', items: [
      { t: 'Walkways and stairs are clear' },
      { t: 'Materials are stacked stable and banded' },
      { t: 'Waste is sorted into the right skips' },
      { t: 'Rebar ends are capped and nails removed' },
      { t: 'Lighting is good enough to work safely' }
    ]
  },
  {
    key: 'plant', tone: 'orange', title: 'Mobile plant', icon: 'tractor', every: 'Before each shift', items: [
      { t: 'Daily check is filled in the log book' },
      { t: 'Lights, beacon and reversing alarm work' },
      { t: 'Seat belt is fitted and worn', critical: true },
      { t: 'No hydraulic or fuel leaks' },
      { t: 'Operator holds a valid card for this machine', critical: true },
      { t: 'Exclusion zone or banksman is in place' }
    ]
  }
];

export const template = key => TEMPLATES.find(t => t.key === key) || null;

// Score = passed ÷ (passed + failed); "not applicable" is left out
export function score(answers) {
  const vals = Object.values(answers || {});
  const pass = vals.filter(a => a.r === 'pass').length;
  const fail = vals.filter(a => a.r === 'fail').length;
  return pass + fail ? Math.round(100 * pass / (pass + fail)) : null;
}

export const grade = s => s == null ? 'none' : s >= 90 ? 'good' : s >= 70 ? 'fair' : 'poor';

export const all = () => store.all('inspections').slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));

export function lastFor(key) { return all().find(i => i.template === key) || null; }

// A few finished inspections so the demo is not empty. Runs once per browser.
export function ensureDemo() {
  if (store.all('inspections').length || store.settings().inspectionsSeeded) return;
  const at = (days, hm) => `${addDays(today(), days)}T${hm}:00`;
  const item = name => store.find('items', i => i.name.toLowerCase().includes(name))?.id || null;
  const make = (key, days, hm, by, fails = {}, zone = null, nas = []) => {
    const tpl = template(key);
    const answers = {};
    tpl.items.forEach((_, k) => { answers[k] = { r: nas.includes(k) ? 'na' : fails[k] ? 'fail' : 'pass', note: fails[k] || '' }; });
    return { ref: '', template: key, zoneId: zone, by, byId: null, answers, score: score(answers), notes: '', hazards: [], createdAt: new Date(at(days, hm)).toISOString() };
  };
  const demo = [
    make('ppe', 0, '07:05', 'Mikko Virtanen', { 4: 'Two joiners cutting without gloves' }, item('site cabins')),
    make('scaffold', -1, '14:20', 'Laura Mäkinen', { 4: 'Ladder not tied at level 2' }, item('block b')),
    make('excavation', -1, '07:30', 'Pekka Nieminen', {}, item('block c'), [6]),
    make('electrical', -3, '10:10', 'Laura Mäkinen', {}, item('block a')),
    make('housekeeping', -4, '15:40', 'Mikko Virtanen', { 0: 'Packaging on the stair at level 1', 2: 'Mixed waste in the metal skip' }, item('block a'))
  ];
  demo.reverse().forEach(r => store.insert('inspections', { ...r, ref: store.nextRef('INS') }));
  store.setSettings({ inspectionsSeeded: true });
}
