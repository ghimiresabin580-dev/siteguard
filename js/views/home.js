// Home: the main menu of SiteGuard.

import { can, currentUser } from '../auth.js';
import { icon } from '../icons.js';

const ITEMS = [
  { href: '#/overview', icon: 'chart-column', tone: 'navy', title: 'Dashboard', desc: 'Overview of safety and hazards' },
  { href: '#/report', icon: 'triangle-exclamation-point', tone: 'amber', title: 'Report Hazard', desc: 'Report a new safety hazard', perm: 'obs.create' },
  { href: '#/hazards', icon: 'clipboard-list', tone: 'slate', title: 'View Reports', desc: 'See all reported hazards' },
  { href: '#/sitemap', icon: 'map-pin', tone: 'green', title: 'Site Map', desc: 'View site and hazard locations' },
  { href: '#/inspections', icon: 'clipboard-check', tone: 'blue', title: 'Inspections', desc: 'Site walk, lift and TR checks', hideFor: ['worker'] },
  { href: '#/stats', icon: 'chart-column', tone: 'green', title: 'Statistics', desc: 'Safety reports and analysis' },
  { href: '#/settings', icon: 'settings', tone: 'slate', title: 'Settings', desc: 'App and user settings' }
];

export default {
  meta: { key: 'home', label: 'SiteGuard', icon: 'shield-check', home: true },
  render: () => `<nav class="m-menu" aria-label="Main menu">${ITEMS.filter(i => (!i.perm || can(i.perm)) && !i.hideFor?.includes(currentUser()?.role)).map(i => `
    <a class="m-card m-link" href="${i.href}">
      <span class="m-ic ${i.tone}">${icon(i.icon)}</span>
      <span class="m-text"><b>${i.title}</b><small>${i.desc}</small></span>
      <span class="m-go">${icon('chevron-right')}</span>
    </a>`).join('')}</nav>`
};
