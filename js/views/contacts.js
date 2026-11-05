// Contacts: emergency information first, then the site team and the companies on site.

import * as store from '../store.js';
import { esc, plural, daysUntil } from '../util.js';
import { icon } from '../icons.js';
import { avatar, contractorMark } from '../ui.js';
import { ROLES } from '../auth.js';
import { CONFIG } from '../config.js';
import * as D from '../derive.js';

const tel = n => n ? `<a href="tel:${esc(n.replace(/\s/g, ''))}">${esc(n)}</a>` : '-';
const mail = e => e && !e.endsWith('.demo') ? `<a href="mailto:${esc(e)}">${esc(e)}</a>` : esc(e || '-');

export default {
  meta: { key: 'contacts', label: 'Contacts', icon: 'book-user' },

  header: () => ({ title: 'Contacts', sub: 'Emergency numbers, the site team and companies on site' }),

  render() {
    const s = store.settings();
    const { lat, lon } = CONFIG.site;
    const firstAiders = D.onSiteNow().map(a => store.get('people', a.personId)).filter(p => p?.firstAid && daysUntil(p.firstAid) >= 0);
    const team = store.all('users').filter(u => u.status === 'active' && u.companyId === 'c-main');
    return `
      <section class="emergency" aria-labelledby="emHead">
        <div class="em-call">
          <h2 id="emHead">In an emergency</h2>
          <a class="em-number" href="tel:112">${icon('phone')}112</a>
          <p>Then call the site manager. Send someone to the main gate to meet the ambulance.</p>
        </div>
        <dl class="facts em-facts">
          <div><dt>Tell the operator</dt><dd>${esc(s.siteName)}, ${esc(CONFIG.site.address)}. Main gate. Coordinates ${lat.toFixed(4)} N, ${lon.toFixed(4)} E.</dd></div>
          <div><dt>Assembly point</dt><dd>${esc(CONFIG.site.assemblyPoint)}</dd></div>
          <div><dt>First aid</dt><dd>${esc(CONFIG.site.firstAidPoint)}</dd></div>
          <div><dt>First aiders on site now</dt><dd>${firstAiders.length ? firstAiders.map(p => `${esc(p.name)}${p.phone ? ` (${tel(p.phone)})` : ''}`).join(', ') : 'Nobody with a valid first aid card has checked in.'}</dd></div>
          <div><dt>Hospital</dt><dd>${esc(CONFIG.site.hospital)}. <a href="https://www.openstreetmap.org/search?query=${encodeURIComponent(CONFIG.site.hospital)}" target="_blank" rel="noopener">Map</a></dd></div>
          <div><dt>Medical helpline</dt><dd><a href="tel:116117">116 117</a>, when it is not an emergency</dd></div>
        </dl>
      </section>

      <section class="panel">
        <header class="panel-head"><h2>Site team</h2></header>
        <ul class="people-list">${team.map(u => `<li>${avatar(u.name)}
          <div><b>${esc(u.name)}</b><small>${esc(u.title || ROLES[u.role].label)}</small></div>
          <span>${tel(u.phone)}</span><span class="hide-sm">${mail(u.email)}</span></li>`).join('')}</ul>
      </section>

      <section class="panel">
        <header class="panel-head"><h2>Companies on site</h2></header>
        <ul class="people-list">${store.all('contractors').filter(c => c.id !== 'c-main').map(c => `<li>${contractorMark(c)}
          <div><b>${esc(c.name)}</b><small>${esc(c.trade)}. Contact: ${esc(c.contact || '-')}</small></div>
          <span>${tel(c.phone)}</span><span class="hide-sm">${mail(c.email)}</span></li>`).join('')}</ul>
      </section>`;
  }
};
