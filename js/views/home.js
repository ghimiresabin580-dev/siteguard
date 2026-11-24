// Home: how the site is doing right now, then the main menu.

import * as store from '../store.js';
import * as H from '../hazards.js';
import * as C from '../checklists.js';
import { can, currentUser } from '../auth.js';
import { esc, today, dayOf } from '../util.js';
import { icon } from '../icons.js';

const ITEMS = [
  { href: '#/overview', icon: 'chart-column', tone: 'navy', title: 'Dashboard', desc: 'Overview of safety and hazards' },
  { href: '#/report', icon: 'triangle-exclamation-point', tone: 'amber', title: 'Report Hazard', desc: 'Report a new safety hazard', perm: 'obs.create' },
  { href: '#/hazards', icon: 'clipboard-list', tone: 'slate', title: 'View Reports', desc: 'See all reported hazards' },
  { href: '#/inspections', icon: 'clipboard-check', tone: 'blue', title: 'Inspections', desc: 'Checklists for scaffolds, PPE and more' },
  { href: '#/sitemap', icon: 'map-pin', tone: 'green', title: 'Site Map', desc: 'View site and hazard locations' },
  { href: '#/stats', icon: 'chart-column', tone: 'teal', title: 'Statistics', desc: 'Safety reports and analysis' },
  { href: '#/settings', icon: 'settings', tone: 'slate', title: 'Settings', desc: 'App and user settings' }
];

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Working late' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function status() {
  C.ensureDemo();
  const open = H.all().filter(o => o.status !== 'closed');
  const high = open.filter(o => o.severity === 'high').length;
  const inspToday = C.all().filter(i => dayOf(i.createdAt) === today()).length;
  const s = store.settings();
  const level = high ? 'alert' : open.length ? 'watch' : 'clear';
  const line = high ? `${high} high-risk hazard${high === 1 ? ' needs' : 's need'} action`
    : open.length ? `${open.length} open hazard${open.length === 1 ? '' : 's'}, none high risk` : 'No open hazards. Keep it that way.';
  return `<section class="hero hero-${level}">
    <div class="hero-top">
      <div><p class="hero-hi">${greeting()}, ${esc(currentUser().name.split(' ')[0])}</p>
        <p class="hero-site">${esc(s.siteName)}</p></div>
      <time class="hero-date">${new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</time>
    </div>
    <p class="hero-line"><span class="hero-dot"></span>${line}</p>
    <div class="hero-facts">
      <a href="#/hazards/open"><b>${open.length}</b><small>Open</small></a>
      <a href="#/hazards/open"><b>${high}</b><small>High risk</small></a>
      <a href="#/inspections"><b>${inspToday}</b><small>Inspected today</small></a>
    </div>
    ${can('obs.create') ? `<a class="hero-cta" href="#/report">${icon('triangle-exclamation-point')}Report a hazard</a>` : ''}
  </section>`;
}

export default {
  meta: { key: 'home', label: 'SiteGuard', icon: 'shield-check', home: true },
  render: () => `${status()}
    <nav class="m-menu" aria-label="Main menu">${ITEMS.filter(i => !i.perm || can(i.perm)).map(i => `
    <a class="m-card m-link" href="${i.href}">
      <span class="m-ic ${i.tone}">${icon(i.icon)}</span>
      <span class="m-text"><b>${i.title}</b><small>${i.desc}</small></span>
      <span class="m-go">${icon('chevron-right')}</span>
    </a>`).join('')}</nav>`
};
