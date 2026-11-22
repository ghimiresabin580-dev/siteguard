// Hazard reports for the main screens. They are the "Don't walk by" observations
// (without good-practice notes), with a short title and a category on top.

import * as store from './store.js';
import { esc, fmtTime, dayOf, today, addDays } from './util.js';
import { icon } from './icons.js';
import { zoneName } from './ui.js';

export const CATEGORIES = [
  { key: 'electrical', label: 'Electrical', icon: 'zap', words: ['cable', 'lead', 'electric', 'wire', 'socket', 'power'] },
  { key: 'slips', label: 'Slips and trips', icon: 'snowflake', words: ['ice', 'slip', 'trip', 'mud', 'wet'] },
  { key: 'height', label: 'Falls from height', icon: 'arrow-up-to-line', words: ['edge', 'scaffold', 'ladder', 'toe board', 'railing', 'hole', 'dropped', 'level'] },
  { key: 'housekeeping', label: 'Housekeeping', icon: 'recycle', words: ['packaging', 'offcut', 'skip', 'waste', 'pallet', 'banding', 'material', 'stair', 'rebar'] },
  { key: 'vehicles', label: 'Plant and vehicles', icon: 'tractor', words: ['truck', 'lorry', 'reversing', 'delivery', 'vehicle', 'excavator', 'forklift'] },
  { key: 'lifting', label: 'Lifting', icon: 'anchor', words: ['beam', 'load', 'lift', 'crane'] },
  { key: 'ppe', label: 'PPE', icon: 'hard-hat', words: ['hard hat', 'eye protection', 'gloves', 'vest', 'ppe'] },
  { key: 'fire', label: 'Fire', icon: 'flame', words: ['fire', 'hot work', 'smoke', 'welding'] },
  { key: 'other', label: 'Other', icon: 'triangle-exclamation-point', words: [] }
];

export const RISK = {
  high: { label: 'High Risk', short: 'High', color: '#e53935', cls: 'r-high' },
  medium: { label: 'Medium Risk', short: 'Medium', color: '#f9a825', cls: 'r-medium' },
  low: { label: 'Low Risk', short: 'Low', color: '#43a047', cls: 'r-low' }
};

export const STATUS = {
  open: { label: 'Open', cls: 's-open' },
  progress: { label: 'In Progress', cls: 's-progress' },
  closed: { label: 'Resolved', cls: 's-resolved' }
};

export const category = o => CATEGORIES.find(c => c.key === o.category)
  || CATEGORIES.find(c => c.words.some(w => o.description?.toLowerCase().includes(w)))
  || CATEGORIES[CATEGORIES.length - 1];

// Older reports had no title: use the start of the description
export function title(o) {
  if (o.title) return o.title;
  const first = String(o.description || 'Hazard').split(/[.,:;]| - /)[0].trim();
  return first.length > 46 ? first.slice(0, 44).replace(/\s+\S*$/, '') + '…' : first;
}

export const all = () => store.all('observations').filter(o => o.type !== 'good');
export const isOpen = o => o.status !== 'closed';
export const thisMonth = o => o.createdAt.slice(0, 7) === today().slice(0, 7);

export function when(o) {
  const day = dayOf(o.createdAt);
  if (day === today()) return `Today, ${fmtTime(o.createdAt)}`;
  if (day === addDays(today(), -1)) return `Yesterday, ${fmtTime(o.createdAt)}`;
  return `${new Date(o.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, ${fmtTime(o.createdAt)}`;
}

export const where = o => zoneName(o.zoneId) || 'Site';

export const riskPill = o => `<span class="pill ${RISK[o.severity]?.cls || 'r-low'}">${RISK[o.severity]?.label || 'Low Risk'}</span>`;
export const statusPill = o => `<span class="pill ${STATUS[o.status].cls}">${STATUS[o.status].label}</span>`;

// A photo when there is one, otherwise the category icon on a tinted square
export function thumb(o) {
  if (o.photos?.length) return `<span class="thumb"><img data-photo="${o.photos[0]}" alt=""></span>`;
  return `<span class="thumb thumb-ic ${RISK[o.severity]?.cls || ''}">${icon(category(o).icon)}</span>`;
}

export function row(o, { status = true, place = true } = {}) {
  return `<button type="button" class="h-row" data-act="openHazard" data-id="${o.id}">
    ${thumb(o)}
    <span class="h-main">
      <b>${esc(title(o))}</b>
      ${riskPill(o)}
      ${place ? `<small>${esc(where(o))}</small>` : ''}
      <small>${when(o)}</small>
    </span>
    ${status ? statusPill(o) : ''}
    <span class="h-go">${icon('chevron-right')}</span>
  </button>`;
}
