// SiteGuard: app shell, sign-in, navigation and event wiring.

import { CONFIG } from './config.js';
import * as store from './store.js';
import * as auth from './auth.js';
import { $, $$, esc, timeAgo, fmtDayLong, today, debounce, formValues } from './util.js';
import { icon } from './icons.js';
import { toast, openDialog, closeDialog, setupDialog, avatar, busy, field, options } from './ui.js';
import { runChecks, unreadCount, notify } from './monitor.js';
import { flushQueue, sendEmail, describe } from './mail.js';
import { setupTooltips } from './charts.js';
import { hydratePhotos } from './photos.js';
import { getWeather, describeCode } from './weather.js';

import dashboard from './views/dashboard.js';
import meeting from './views/meeting.js';
import sitemap from './views/sitemap.js';
import lookahead from './views/lookahead.js';
import deliveries from './views/deliveries.js';
import observations from './views/observations.js';
import spa from './views/spa.js';
import permits from './views/permits.js';
import inspections from './views/inspections.js';
import plant from './views/plant.js';
import workforce from './views/workforce.js';
import reports from './views/reports.js';
import contacts from './views/contacts.js';
import profile from './views/profile.js';
import admin from './views/admin.js';

const VIEWS = { dashboard, meeting, map: sitemap, lookahead, deliveries, observations, spa, permits, inspections, plant, workforce, reports, contacts, profile, admin };

// The side menu. Other pages still exist and open from links inside the app;
// add them back here when they are ready to show.
const MENU = [
  { key: 'dashboard', icon: 'layout-dashboard', title: 'Dashboard', desc: 'Overview of reported hazards and safety status.' },
  { key: 'report', icon: 'triangle-exclamation-point', title: 'Report Hazard', desc: 'Report a hazard with description, photo and location.', perm: 'obs.create' },
  { key: 'observations', icon: 'clipboard-check', title: 'View Reports', desc: 'View previously submitted hazard reports.' },
  { key: 'map', icon: 'map', title: 'Site Map', desc: 'View the construction site and hazard locations.' },
  { key: 'reports', icon: 'chart-column', title: 'Statistics', desc: 'Display total reports and hazard status.' },
  { key: 'profile', icon: 'settings', title: 'Settings', desc: 'Basic application settings.' }
];

// Every screen adds its click, submit and change handlers to one registry
const ACTIONS = {}, SUBMITS = {}, CHANGES = {};
for (const v of Object.values(VIEWS)) {
  Object.assign(ACTIONS, v.actions || {});
  Object.assign(SUBMITS, v.submits || {});
  Object.assign(CHANGES, v.changes || {});
}

let current = null;     // the screen on show
let route = { view: 'dashboard', params: [] };

export const ctx = {
  get user() { return auth.currentUser(); },
  get route() { return route; },
  go: (hash) => { if (location.hash === hash) show(); else location.hash = hash; },
  refresh,
  toast
};

// ---------- routing ----------
function parseHash() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  return { view: VIEWS[parts[0]] ? parts[0] : 'dashboard', params: parts.slice(1) };
}

function show() {
  const user = auth.currentUser();
  if (!user) return showLogin();
  if (user.mustChangePassword) return showPasswordChange(user);
  let openReport = false;
  if (location.hash === '#/report') {
    // "Report Hazard" opens the reports list with the new-hazard form on top
    openReport = auth.can('obs.create', user);
    history.replaceState(null, '', '#/observations');
  }
  route = parseHash();
  let v = VIEWS[route.view];
  if (v.allowed && !v.allowed(user)) {
    toast('That page is only for administrators.', 'err');
    route = { view: 'dashboard', params: [] };
    v = VIEWS.dashboard;
    history.replaceState(null, '', '#/dashboard');
  }
  $('#login').hidden = true;
  $('#app').hidden = false;
  if (current && current !== v) current.unmount?.(ctx);
  const same = current === v;
  current = v;
  closeNav();
  renderChrome();
  renderView();
  if (!same) window.scrollTo(0, 0);
  if (openReport) observations.openForm(ctx);
}

function renderHeader(withActions = true) {
  const head = current.header ? current.header(ctx) : { title: current.meta.label };
  $('#pageTitle').textContent = head.title;
  $('#pageSub').textContent = head.sub || '';
  $('#pageSub').hidden = !head.sub;
  if (withActions) $('#pageActions').innerHTML = head.actions || '';
  $('#pageIcon').innerHTML = icon(current.meta.icon);
  document.title = `${head.title} - ${CONFIG.app}`;
}

function renderView() {
  const root = $('#view');
  current.unmount?.(ctx);
  renderHeader();
  root.innerHTML = current.render(ctx);
  root.dataset.view = current.meta.key;
  current.mount?.(ctx, root);
  hydratePhotos(root);
}

function refresh() {
  if (!current || $('#app').hidden) return;
  const y = window.scrollY;
  if (current.update) { current.update(ctx); renderHeader(false); }
  else renderView();
  renderChrome();
  window.scrollTo(0, y);
}

// ---------- chrome: sidebar, top bar ----------
function renderChrome() {
  const user = auth.currentUser();
  if (!user) return;
  const s = store.settings();
  const items = MENU.filter(m => menuVisible(m, user));
  $('#nav').innerHTML = items.map((m, i) => menuLink(m, i + 1, user)).join('');
  $('#navFoot').innerHTML = `
    ${auth.isAdmin(user) ? navLink('admin', user) : ''}
    <button type="button" class="nav-link" data-act="signOut">${icon('log-out')}<span>Sign out</span></button>`;
  const unread = unreadCount(user);
  $('#bellCount').textContent = unread > 9 ? '9+' : unread;
  $('#bellCount').hidden = !unread;
  $('#userBtn').innerHTML = avatar(user.name, roleColor(user.role));
  $('#userBtn').setAttribute('aria-label', `${user.name}, account menu`);
  $('#fab').hidden = !auth.can('obs.create', user) || route.view === 'observations';
}

function menuVisible(m, user) {
  if (m.perm) return auth.can(m.perm, user);
  return !VIEWS[m.key].meta.hideFor?.includes(user.role);
}

function menuLink(m, n, user) {
  const v = VIEWS[m.key];
  const active = route.view === m.key;
  const count = v?.meta.badge ? v.meta.badge(user) : 0;
  return `<a class="menu-item ${active ? 'on' : ''}" href="#/${m.key}" ${active ? 'aria-current="page"' : ''}>
    <span class="menu-ic">${icon(m.icon)}</span>
    <span class="menu-text"><b>${n}. ${m.title}</b><small>${m.desc}</small></span>
    ${count ? `<b class="nav-count">${count}</b>` : ''}
    <span class="menu-go">${icon('chevron-right')}</span></a>`;
}

function navLink(key, user) {
  const v = VIEWS[key];
  if (v.meta.hideFor?.includes(user.role)) return '';
  const active = route.view === key;
  const count = v.meta.badge ? v.meta.badge(user) : 0;
  return `<a class="nav-link ${active ? 'on' : ''}" href="#/${key}" ${active ? 'aria-current="page"' : ''}>
    ${icon(v.meta.icon)}<span>${v.meta.label}</span>${count ? `<b class="nav-count">${count}</b>` : ''}</a>`;
}

const roleColor = role => ({ admin: '#1d3b5a', manager: '#4f6d8f', hse: '#1f7a80', supervisor: '#8a5a2b', worker: '#5b6b7b' })[role];

function openNav() { document.body.classList.add('nav-open'); $('#navToggle').setAttribute('aria-expanded', 'true'); }
function closeNav() { document.body.classList.remove('nav-open'); $('#navToggle')?.setAttribute('aria-expanded', 'false'); }

// ---------- pop-over menus (notifications, account) ----------
function togglePop(id, html) {
  const pop = $('#' + id);
  const open = !pop.hidden;
  $$('.pop').forEach(p => { p.hidden = true; });
  if (open) return;
  pop.innerHTML = html;
  pop.hidden = false;
}

function notificationsHtml(user) {
  const list = store.all('notifications').slice(0, 30);
  const kindIcon = { access: 'user-plus', permit: 'file-check', observation: 'footprints', plant: 'forklift', people: 'id-card', delivery: 'truck' };
  return `<div class="pop-head"><b>Notifications</b>
      ${list.some(n => !n.readBy.includes(user.id)) ? '<button type="button" class="link-btn" data-act="readAll">Mark all as read</button>' : ''}</div>
    <div class="pop-list">${list.length ? list.map(n => `
      <a class="note ${n.readBy.includes(user.id) ? '' : 'unread'}" href="${esc(n.link || '#/dashboard')}" data-act="readNote" data-id="${n.id}">
        ${icon(kindIcon[n.kind] || 'bell')}
        <span><b>${esc(n.title)}</b><small>${esc(n.body || '')}</small><small class="when">${timeAgo(n.at)}</small></span>
      </a>`).join('') : '<p class="pop-empty">Nothing new. Alerts about permits, inspections and serious observations show up here.</p>'}</div>`;
}

function accountHtml(user) {
  return `<div class="pop-account">
      ${avatar(user.name, roleColor(user.role), 'lg')}
      <div><b>${esc(user.name)}</b><small>${esc(user.title || auth.ROLES[user.role].label)}</small><small>${esc(user.email)}</small></div>
    </div>
    <div class="pop-menu">
      <a href="#/profile" data-act="closePops">${icon('circle-user')}My profile</a>
      ${auth.isAdmin(user) ? `<a href="#/admin" data-act="closePops">${icon('shield-check')}Admin</a>` : ''}
      <button type="button" data-act="signOut">${icon('log-out')}Sign out</button>
    </div>`;
}

// ---------- weather chip ----------
async function renderWeatherChip() {
  const w = await getWeather();
  const el = $('#weatherChip');
  if (!w || !el) { if (el) el.hidden = true; return; }
  const d = describeCode(w.now.code);
  el.hidden = false;
  el.innerHTML = `${icon(d.icon)}<span>${Math.round(w.now.temp)}°C</span><span class="muted">Gusts ${Math.round(w.now.gust)} m/s</span>`;
  el.title = `${d.text}. Wind ${Math.round(w.now.wind)} m/s, gusts ${Math.round(w.now.gust)} m/s. Updated ${new Date(w.fetchedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}.`;
}

// ---------- global actions ----------
Object.assign(ACTIONS, {
  closeDialog: () => closeDialog(),
  toggleNav: () => (document.body.classList.contains('nav-open') ? closeNav() : openNav()),
  closeNav: () => closeNav(),
  bell: () => togglePop('notePop', notificationsHtml(auth.currentUser())),
  account: () => togglePop('accountPop', accountHtml(auth.currentUser())),
  closePops: () => $$('.pop').forEach(p => { p.hidden = true; }),
  readNote: el => {
    const user = auth.currentUser();
    store.update('notifications', el.dataset.id, n => ({ readBy: [...new Set([...n.readBy, user.id])] }));
    $$('.pop').forEach(p => { p.hidden = true; });
    renderChrome();
  },
  readAll: () => {
    const user = auth.currentUser();
    store.all('notifications').forEach(n => { if (!n.readBy.includes(user.id)) n.readBy.push(user.id); });
    store.save();
    $('#notePop').innerHTML = notificationsHtml(user);
    renderChrome();
  },
  signOut: () => {
    $$('.pop').forEach(p => { p.hidden = true; });
    closeDialog();
    current?.unmount?.(ctx);
    current = null;
    auth.signOut();
    showLogin('You have signed out.');
  },
  raiseObservation: () => observations.openForm(ctx),
  print: () => window.print(),
  // sign-in page
  demoSignIn: async el => {
    const form = $('#signInForm');
    form.email.value = el.dataset.email;
    form.password.value = CONFIG.demoPassword;
    form.requestSubmit();
  },
  togglePassword: el => {
    const input = el.parentElement.querySelector('input');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    el.innerHTML = icon(show ? 'eye-off' : 'eye');
    el.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  },
  loginPanel: el => renderLogin(el.dataset.panel)
});

Object.assign(SUBMITS, {
  async signIn(form, values, btn) {
    const res = await busy(btn, () => auth.signIn(values.email, values.password, values.remember), 'Signing in…');
    if (res.error) { showLoginError(res.error); return; }
    if (location.hash.length < 3) history.replaceState(null, '', '#/dashboard');
    afterSignIn();
  },
  async requestAccess(form, values, btn) {
    if (values.password !== values.password2) return showLoginError('The two passwords are different.');
    const res = await busy(btn, () => auth.requestAccess(values), 'Sending…');
    if (res.error) return showLoginError(res.error);
    const company = store.get('contractors', values.companyId)?.name || 'Not given';
    notify('access', `Access request from ${values.name}`, `${company}${values.trade ? ', ' + values.trade : ''}`, '#/admin');
    sendEmail({
      event: 'accessRequest', subject: `Access request: ${values.name}, ${company}`,
      fields: { Name: values.name, Email: values.email, Company: company, Trade: values.trade || '-', Phone: values.phone || '-', Message: values.note || '-',
        'What to do': 'Sign in as an administrator and approve or decline the request in Admin > Users.' },
      link: '#/admin'
    });
    renderLogin('requested');
  },
  async forgotPassword(form, values, btn) {
    const user = store.find('users', u => u.email.toLowerCase() === values.email.toLowerCase());
    await busy(btn, async () => {
      if (user) {
        store.audit(user, 'Asked for a password reset');
        notify('access', `${user.name} needs a new password`, 'Reset it in Admin > Users', '#/admin');
        await sendEmail({
          event: 'accessRequest', subject: `Password reset requested: ${user.name}`,
          fields: { Name: user.name, Email: user.email, 'What to do': 'Sign in as an administrator, open Admin > Users and choose Reset password. Give the temporary password to the person directly.' },
          link: '#/admin'
        });
      }
    }, 'Sending…');
    // the same answer either way, so the form does not reveal which emails have accounts
    renderLogin('reset-sent');
  },
  async firstPassword(form, values, btn) {
    if (values.next !== values.next2) return toast('The two passwords are different.', 'err');
    const user = auth.currentUser();
    const res = await busy(btn, () => auth.changePassword(user, '', values.next), 'Saving…');
    if (res.error) return toast(res.error, 'err');
    closeDialog();
    toast('Password saved. Welcome to SiteGuard.', 'ok');
    show();
  }
});

// ---------- sign-in page ----------
function showLogin(message) {
  $('#app').hidden = true;
  $('#login').hidden = false;
  document.title = `Sign in - ${CONFIG.app}`;
  renderLogin('signin', message);
}

function showLoginError(text) {
  const box = $('#loginMsg');
  box.className = 'login-msg err';
  box.innerHTML = `${icon('circle-x')}<span>${esc(text)}</span>`;
  box.hidden = false;
}

function sitePlanSvg() {
  // the site outline from the map, drawn like a site plan
  const items = store.all('items');
  const pts = items.flatMap(i => i.shape);
  const lats = pts.map(p => p[0]), lons = pts.map(p => p[1]);
  const [minLat, maxLat, minLon, maxLon] = [Math.min(...lats), Math.max(...lats), Math.min(...lons), Math.max(...lons)];
  const k = Math.cos(minLat * Math.PI / 180);
  const w = (maxLon - minLon) * k, h = maxLat - minLat;
  const S = 560 / Math.max(w, h);
  const xy = ([la, lo]) => [((lo - minLon) * k * S + 20).toFixed(1), ((maxLat - la) * S + 20).toFixed(1)];
  const W = w * S + 40, H = h * S + 40;
  const shapes = items.map(i => {
    const p = i.shape.map(xy);
    if (i.type === 0 || i.type === 5) {
      const c = p.reduce((a, b) => [a[0] + +b[0] / p.length, a[1] + +b[1] / p.length], [0, 0]);
      return `<polygon points="${p.map(q => q.join(',')).join(' ')}" class="${i.type === 5 ? 'lift' : 'zone'}"/>
        <text x="${c[0].toFixed(1)}" y="${(c[1] + 4).toFixed(1)}" text-anchor="middle">${esc(i.name)}</text>`;
    }
    if (i.type === 1) return `<circle cx="${p[0][0]}" cy="${p[0][1]}" r="5" class="gate"/>`;
    return `<polyline points="${p.map(q => q.join(',')).join(' ')}" class="${['', '', 'fence', 'walk', 'route'][i.type]}"/>`;
  }).join('');
  const zones = store.all('exclusionZones').map(z => `<polygon points="${z.shape.map(xy).map(q => q.join(',')).join(' ')}" class="ez"/>`).join('');
  return `<svg class="siteplan" viewBox="0 0 ${W.toFixed(0)} ${H.toFixed(0)}" aria-hidden="true">${zones}${shapes}</svg>`;
}

function renderLogin(panel = 'signin', message = '') {
  const s = store.settings();
  const demo = [
    ['u-sabin', 'Administrator'], ['u-laura', 'Site manager'], ['u-aino', 'HSE coordinator'], ['u-mikko', 'Supervisor'], ['u-piotr', 'Worker']
  ].map(([id, role]) => [store.get('users', id), role]).filter(([u]) => u && u.status === 'active');

  const pwField = (name, label, auto, extra = '') => field(label, `<span class="pw-wrap"><input type="password" name="${name}" autocomplete="${auto}" required ${extra}>
    <button type="button" class="icon-btn" data-act="togglePassword" aria-label="Show password">${icon('eye')}</button></span>`);

  const panels = {
    signin: `
      <h1>Sign in</h1>
      <p class="login-lead">Use the email your site administrator registered for you.</p>
      <form id="signInForm" data-submit="signIn" novalidate>
        ${field('Email', '<input type="email" name="email" autocomplete="username" required autofocus>')}
        ${pwField('password', 'Password', 'current-password')}
        <div class="login-row">
          <label class="check"><input type="checkbox" name="remember"> Keep me signed in on this device</label>
          <button type="button" class="link-btn" data-act="loginPanel" data-panel="forgot">Forgot password?</button>
        </div>
        <button class="btn primary block" type="submit">${icon('log-in')}Sign in</button>
      </form>
      <p class="login-switch">New on site? <button type="button" class="link-btn" data-act="loginPanel" data-panel="request">Request access</button></p>
      <section class="demo-accounts" aria-labelledby="demoHead">
        <h2 id="demoHead">Try a demo account</h2>
        <p>Each account sees what that role would. Password for all of them: <code>${esc(CONFIG.demoPassword)}</code></p>
        <div class="demo-list">${demo.map(([u, role]) => `
          <button type="button" class="demo-acc" data-act="demoSignIn" data-email="${esc(u.email)}">
            ${avatar(u.name, roleColor(u.role))}<span><b>${role}</b><small>${esc(u.name)}</small></span>${icon('chevron-right')}
          </button>`).join('')}</div>
      </section>`,
    request: `
      <button type="button" class="link-btn back" data-act="loginPanel" data-panel="signin">${icon('arrow-left')}Back to sign in</button>
      <h1>Request access</h1>
      <p class="login-lead">The site administrator approves new accounts, usually on the day of your site induction.</p>
      <form data-submit="requestAccess" novalidate>
        <div class="grid-2">
          ${field('Full name', '<input name="name" autocomplete="name" required maxlength="60">')}
          ${field('Phone', '<input name="phone" type="tel" autocomplete="tel" maxlength="30">')}
        </div>
        ${field('Email', '<input type="email" name="email" autocomplete="email" required maxlength="80">')}
        <div class="grid-2">
          ${field('Company', `<select name="companyId">${options(store.all('contractors').map(c => [c.id, c.name]), '', { blank: 'Choose your company' })}</select>`)}
          ${field('Trade or role', '<input name="trade" maxlength="40" placeholder="For example electrician">')}
        </div>
        <div class="grid-2">
          ${pwField('password', 'Password', 'new-password', 'minlength="10"')}
          ${pwField('password2', 'Repeat password', 'new-password')}
        </div>
        <p class="field-hint">At least 10 characters with letters and numbers.</p>
        ${field('Message to the administrator (optional)', '<textarea name="note" rows="2" maxlength="300"></textarea>')}
        <button class="btn primary block" type="submit">${icon('send')}Send request</button>
      </form>`,
    requested: `
      <div class="login-done">${icon('mail-check')}
        <h1>Request sent</h1>
        <p>The site administrator has been told. You can sign in once your account is approved.</p>
        <button type="button" class="btn ghost" data-act="loginPanel" data-panel="signin">Back to sign in</button></div>`,
    forgot: `
      <button type="button" class="link-btn back" data-act="loginPanel" data-panel="signin">${icon('arrow-left')}Back to sign in</button>
      <h1>Forgot your password?</h1>
      <p class="login-lead">The site administrator sets a temporary password for you and you choose a new one when you sign in.</p>
      <form data-submit="forgotPassword" novalidate>
        ${field('Your email', '<input type="email" name="email" autocomplete="username" required autofocus>')}
        <button class="btn primary block" type="submit">${icon('send')}Ask for a new password</button>
      </form>`,
    'reset-sent': `
      <div class="login-done">${icon('mail-check')}
        <h1>Request sent</h1>
        <p>If that email has an account, the site administrator has been asked to reset the password. They will give you a temporary one.</p>
        <button type="button" class="btn ghost" data-act="loginPanel" data-panel="signin">Back to sign in</button></div>`
  };

  $('#login').innerHTML = `
    <div class="login-art">
      <div class="brand">${logo()}<span>SiteGuard</span></div>
      ${sitePlanSvg()}
      <div class="login-site">
        <p class="login-site-name">${esc(s.siteName)}</p>
        <p>${esc(s.project)}</p>
        <p class="login-date">${fmtDayLong(today())}</p>
      </div>
    </div>
    <main class="login-card">
      <div class="brand mobile-only">${logo()}<span>SiteGuard</span></div>
      <div id="loginMsg" class="login-msg" ${message ? '' : 'hidden'}>${message ? `${icon('info')}<span>${esc(message)}</span>` : ''}</div>
      ${panels[panel]}
      <p class="login-foot">${store.isPersistent() ? 'Demo site: accounts and records are saved in this browser only.' : 'This browser blocks storage, so nothing is kept after you close the page.'}</p>
    </main>`;
  const focus = $('#login [autofocus]');
  if (focus && window.innerWidth > 700) focus.focus();
}

export const logo = () => `<svg class="logo" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="7" fill="#13263a"/>
  <path d="M16 5.5 7.5 9v6.2c0 5.4 3.6 9.6 8.5 11.3 4.9-1.7 8.5-5.9 8.5-11.3V9z" fill="#f5b800"/>
  <path d="m12 16 3 3 5.5-6" fill="none" stroke="#13263a" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function showPasswordChange(user) {
  $('#login').hidden = true;
  $('#app').hidden = false;
  renderChrome();
  openDialog({
    title: 'Choose a new password',
    body: `<p class="lead">You signed in with a temporary password. Choose your own before you continue.</p>
      <form id="firstPw" data-submit="firstPassword" novalidate>
        ${field('New password', '<input type="password" name="next" autocomplete="new-password" required minlength="10" autofocus>', 'At least 10 characters with letters and numbers.')}
        ${field('Repeat new password', '<input type="password" name="next2" autocomplete="new-password" required>')}
      </form>`,
    footer: `<button type="button" class="btn ghost" data-act="signOut">Sign out</button><button class="btn primary" type="submit" form="firstPw">Save password</button>`,
    onClose: () => { if (auth.currentUser()?.mustChangePassword) setTimeout(() => showPasswordChange(auth.currentUser()), 0); }
  });
}

function afterSignIn() {
  const user = auth.currentUser();
  runChecks();
  flushQueue();
  show();
  renderWeatherChip();
  if (user && !user.mustChangePassword) toast(`Signed in as ${user.name}`, 'ok', 2500);
}

// ---------- event wiring ----------
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-act]');
  if (!e.target.closest('.pop, #bellBtn, #userBtn')) $$('.pop').forEach(p => { p.hidden = true; });
  if (!el) return;
  const fn = ACTIONS[el.dataset.act];
  if (!fn) return;
  if (el.tagName === 'A' && el.dataset.act !== 'readNote' && el.dataset.act !== 'closePops') e.preventDefault();
  try { await fn(el, ctx, e); }
  catch (err) { console.error(err); toast(err.message || 'Something went wrong.', 'err'); }
});

document.addEventListener('submit', async e => {
  const form = e.target.closest('form[data-submit]');
  if (!form) return;
  e.preventDefault();
  const fn = SUBMITS[form.dataset.submit];
  if (!fn) return;
  const invalid = [...form.elements].find(el => el.willValidate && !el.checkValidity());
  if (invalid) {
    invalid.focus();
    const label = invalid.closest('label, fieldset')?.querySelector('.field-label')?.textContent || 'This field';
    if (invalid.type === 'checkbox') toast('Tick every box that is needed before saving.', 'err');
    else toast(invalid.validity.valueMissing ? `${label}: fill this in.` : `${label}: ${invalid.validationMessage}`, 'err');
    return;
  }
  const btn = e.submitter || form.querySelector('[type=submit]') || document.querySelector(`[form="${form.id}"][type=submit]`);
  try { await fn(form, formValues(form), btn, ctx); }
  catch (err) { console.error(err); toast(err.message || 'Something went wrong.', 'err'); }
});

const onChangeEvent = async e => {
  const el = e.target.closest('[data-change]');
  if (!el) return;
  const fn = CHANGES[el.dataset.change];
  if (!fn) return;
  if (e.type === 'input' && !el.matches('[data-live]')) return;
  try { await fn(el, ctx, e); }
  catch (err) { console.error(err); toast(err.message || 'Something went wrong.', 'err'); }
};
document.addEventListener('change', onChangeEvent);
document.addEventListener('input', onChangeEvent);

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeNav(); $$('.pop').forEach(p => { p.hidden = true; }); }
  // table rows and cards that open something work with the keyboard too
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[data-act]:not(button):not(a):not(input):not(select):not(textarea):not(label)')) {
    e.preventDefault();
    e.target.click();
  }
});

window.addEventListener('hashchange', show);
window.addEventListener('online', () => flushQueue());

// keep the session alive while someone is using the app, and end it when it runs out
const touch = debounce(() => auth.touchSession(), 1000);
['pointerdown', 'keydown'].forEach(t => document.addEventListener(t, touch, { passive: true }));
setInterval(() => {
  if ($('#app').hidden) return;
  if (!auth.currentUser()) { current?.unmount?.(ctx); current = null; showLogin('Your session ended. Sign in again to continue.'); return; }
  runChecks();
  renderChrome();
}, 60000);
setInterval(() => { if (!document.hidden && !$('#app').hidden) renderWeatherChip(); }, 20 * 60000);

// ---------- start ----------
try {
  store.load();
} catch (e) {
  console.error(e);
}
setupDialog();
setupTooltips();
$('#brandLogo').innerHTML = `<span class="side-shield">${icon('shield-check')}</span>`;
store.onChange(debounce(() => { if (!$('#app').hidden) renderChrome(); }, 50));

if (auth.currentUser()) afterSignIn();
else showLogin();

window.SiteGuard = { version: CONFIG.version };
