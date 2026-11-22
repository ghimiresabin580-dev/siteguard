// Settings: account, app preferences, data on this device and information about SiteGuard.

import * as store from '../store.js';
import * as H from '../hazards.js';
import { CONFIG } from '../config.js';
import { isAdmin, ROLES, currentUser } from '../auth.js';
import { esc, today, toCSV, download, fmtDateTime } from '../util.js';
import { icon } from '../icons.js';
import { openDialog, closeDialog, toast } from '../ui.js';
import { prefs, setPrefs } from '../prefs.js';

const card = (ic, title, desc, attrs) => `
  <${attrs.startsWith('href') ? 'a' : 'button type="button"'} class="m-card m-link" ${attrs}>
    <span class="m-ic plain">${icon(ic)}</span>
    <span class="m-text"><b>${title}</b><small>${desc}</small></span>
    <span class="m-go">${icon('chevron-right')}</span>
  </${attrs.startsWith('href') ? 'a' : 'button'}>`;

export default {
  meta: { key: 'settings', label: 'Settings', icon: 'settings' },
  render: ctx => {
    const u = ctx.user;
    return `<div class="m-menu">
      ${card('user-round', 'User Profile', 'Edit your account', 'href="#/profile"')}
      ${card('settings', 'App Settings', 'Text size and welcome screen', 'data-act="stApp"')}
      ${card('database', 'Data & Storage', 'Report data and backup', 'data-act="stData"')}
      ${isAdmin(u) ? card('shield-check', 'Administration', 'Users, access requests and email', 'href="#/admin"') : ''}
      ${card('info', 'About', 'App version and information', 'data-act="stAbout"')}
    </div>
    <p class="m-who">Signed in as <b>${esc(u.name)}</b>, ${esc(ROLES[u.role].label.toLowerCase())}</p>
    <button type="button" class="m-btn ghost" data-act="signOut">${icon('log-out')}Sign out</button>`;
  },

  actions: {
    stApp() {
      const p = prefs();
      openDialog({
        title: 'App Settings',
        body: `<form id="stAppForm" data-submit="stAppSave" class="m-form" novalidate>
          <fieldset class="m-field"><legend>Text size</legend>
            <div class="seg2">
              <label><input type="radio" name="textSize" value="normal" ${p.textSize !== 'large' ? 'checked' : ''}><span>Normal</span></label>
              <label><input type="radio" name="textSize" value="large" ${p.textSize === 'large' ? 'checked' : ''}><span>Large</span></label>
            </div></fieldset>
          <label class="m-check"><input type="checkbox" name="welcome" ${p.welcome ? 'checked' : ''}>
            <span><b>Welcome screen</b><small>Show the Get Started screen before signing in</small></span></label>
          <p class="m-note">Language: English. Email alerts for serious hazards are set by the site administrator.</p>
        </form>`,
        footer: `<button type="button" class="btn ghost" data-act="closeDialog">Cancel</button>
          <button type="submit" class="btn primary" form="stAppForm">Save</button>`
      });
    },
    stData() {
      const list = H.all();
      const photos = list.reduce((n, o) => n + (o.photos?.length || 0), 0);
      openDialog({
        title: 'Data & Storage',
        body: `<dl class="m-facts">
            <div><dt>Hazard reports</dt><dd>${list.length}</dd></div>
            <div><dt>Photos</dt><dd>${photos}</dd></div>
            <div><dt>Saved</dt><dd>${store.isPersistent() ? 'In this browser' : 'Not saved (storage blocked)'}</dd></div>
          </dl>
          <p class="m-note">Reports are kept on this device. Download them to share with others or keep a copy.</p>
          <div class="m-actions">
            <button type="button" class="btn primary" data-act="stCsv">${icon('download')}Download reports (CSV)</button>
            ${isAdmin(currentUser()) ? `<button type="button" class="btn ghost" data-act="stGoAdmin">${icon('shield-check')}Backup and restore</button>` : ''}
          </div>`
      });
    },
    stGoAdmin: (el, ctx) => { closeDialog(); ctx.go('#/admin'); },
    stCsv() {
      const list = H.all();
      const csv = toCSV([['Ref', 'Title', 'Category', 'Risk', 'Status', 'Location', 'Description', 'Reported by', 'Reported', 'Resolved'],
        ...list.map(o => [o.ref, H.title(o), H.category(o).label, H.RISK[o.severity].short, H.STATUS[o.status].label, H.where(o),
          o.description, o.reportedBy, fmtDateTime(o.createdAt), o.closedAt ? fmtDateTime(o.closedAt) : ''])]);
      download(`siteguard-reports-${today()}.csv`, csv, 'text/csv');
    },
    stAbout() {
      openDialog({
        title: 'About SiteGuard',
        body: `<div class="about">
          <span class="about-logo">${icon('shield-check')}</span>
          <p><b>SiteGuard ${esc(CONFIG.version)}</b><br>Construction site safety: report hazards, follow them up and see how the site is doing.</p>
          <p class="m-note">Site: ${esc(store.settings().siteName)}, ${esc(store.settings().project)}</p>
          <p class="m-note">Map library Leaflet. Imagery Esri, Maxar, Earthstar Geographics. Weather by Open-Meteo.com. Icons Lucide. Typeface Barlow.</p>
        </div>`
      });
    }
  },
  submits: {
    stAppSave(form, v) {
      setPrefs({ textSize: v.textSize, welcome: !!v.welcome });
      closeDialog();
      toast('Settings saved.', 'ok');
    }
  }
};
