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
import home from './views/home.js';
import overview from './views/overview.js';
import report from './views/report.js';
import hazards from './views/hazardlist.js';
import hazardMap from './views/hazardmap.js';
import stats from './views/stats.js';
import settings from './views/settings.js';
import { prefs, applyPrefs } from './prefs.js';

const VIEWS = { home, overview, report, hazards, sitemap: hazardMap, stats, settings, dashboard, meeting, map: sitemap, lookahead, deliveries, observations, spa, permits, inspections, plant, workforce, reports, contacts, profile, admin };

// The screens of the new design. Every other page still works from links and opens
// in a wider layout; add it to the home menu when it should be shown again.
const MAIN = new Set(['home', 'overview', 'report', 'hazards', 'sitemap', 'stats', 'settings']);

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
  return { view: VIEWS[parts[0]] ? parts[0] : 'home', params: parts.slice(1) };
}

function show() {
  const user = auth.currentUser();
  if (!user) return showLogin();
  if (user.mustChangePassword) return showPasswordChange(user);
  route = parseHash();
  let v = VIEWS[route.view];
  if (v.allowed && !v.allowed(user)) {
    toast(v.deniedText || 'That page is only for administrators.', 'err');
    route = { view: 'home', params: [] };
    v = VIEWS.home;
    history.replaceState(null, '', '#/home');
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
}

function renderHeader(withActions = true) {
  const head = current.header ? current.header(ctx) : { title: current.meta.label };
  $('#pageTitle').textContent = head.title;
  const main = MAIN.has(current.meta.key);
  $('#pageSub').textContent = main ? '' : head.sub || '';
  if (withActions) {
    $('#pageActions').innerHTML = main ? head.actions || '' : '';
    $('#subActions').innerHTML = main ? '' : head.actions || '';
  }
  $('#subbar').hidden = main || (!head.sub && !head.actions);
  document.title = `${head.title} - ${CONFIG.app}`;
}

function renderView() {
  const root = $('#view');
  current.unmount?.(ctx);
  renderHeader();
  root.innerHTML = current.render(ctx);
  root.dataset.view = current.meta.key;
  document.body.dataset.layout = current.meta.full ? 'full' : MAIN.has(current.meta.key) ? 'main' : 'wide';
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
  const isHome = !!current?.meta.home;
  $('#backBtn').hidden = isHome;
  $('#appBrand').hidden = !isHome;
  $('#pageTitle').hidden = isHome;
  $('#bellBtn').hidden = !isHome;
  const unread = unreadCount(user);
  $('#bellCount').textContent = unread > 9 ? '9+' : unread;
  $('#bellCount').hidden = !unread;
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
  raiseObservation: () => ctx.go('#/report'),
  goBack: () => {
    $$('.pop').forEach(p => { p.hidden = true; });
    ctx.go(['profile', 'admin'].includes(route.view) ? '#/settings' : '#/home');
  },
  getStarted: () => {
    try { sessionStorage.setItem('siteguard.started', '1'); } catch { }
    renderLogin('signin');
  },
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
    if (location.hash.length < 3) history.replaceState(null, '', '#/home');
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
  let started = false;
  try { started = !!sessionStorage.getItem('siteguard.started'); } catch { }
  if (!message && !started && prefs().welcome) renderSplash();
  else renderLogin('signin', message);
}

function renderSplash() {
  document.title = CONFIG.app;
  $('#login').innerHTML = `<div class="splash">
      ${skylineSvg()}
      <div class="splash-in">
        ${logo('splash-logo')}
        <h1 class="splash-name">Site<span>Guard</span></h1>
        <p class="splash-tag">Construction Site Safety</p>
      </div>
      <button type="button" class="splash-go" data-act="getStarted">Get Started ${icon('arrow-right')}</button>
    </div>`;
}

// Cranes and a building frame against the evening sky
function skylineSvg() {
  const frame = [];
  for (let f = 0; f < 4; f++) for (let c = 0; c < 6; c++) frame.push(`<rect x="${500 + c * 32}" y="${710 - f * 42}" width="32" height="42"/>`);
  return `<svg class="splash-sky" viewBox="0 0 800 800" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#14202f"/><stop offset=".45" stop-color="#3b3a4a"/><stop offset=".72" stop-color="#b8643a"/><stop offset=".9" stop-color="#e9a04b"/></linearGradient></defs>
    <rect width="800" height="800" fill="url(#sky)"/>
    <circle cx="560" cy="640" r="70" fill="#f6c46a" opacity=".55"/>
    <g fill="none" stroke="#0d1218" stroke-width="3" opacity=".95">
      <path d="M120 800V430M110 800V440M130 800V440M120 430h300M120 430h-60M120 430v-44l26 44M120 386l190 44M120 386l-50 44M380 430v120"/>
      <path d="M690 800V470M682 800V478M698 800V478M690 470H520M690 470h80M690 470v-36l-22 36M690 434l-140 36M690 434l70 36M560 470v90"/>
      <g stroke-width="2">${frame.join('')}</g>
    </g>
    <rect x="0" y="752" width="800" height="48" fill="#0d1218"/>
    <path d="M0 760 L120 740 L260 755 L400 735 L520 752 L800 742 V800 H0Z" fill="#0d1218"/>
    <g fill="#0d1218">
      <path d="M300 800v-118a22 22 0 0 1 22-22h20a22 22 0 0 1 22 22V800Z"/><circle cx="332" cy="630" r="22"/><path d="M306 626a26 22 0 0 1 52 0h6v8h-64v-8Z"/>
      <path d="M390 800v-124a24 24 0 0 1 24-24h20a24 24 0 0 1 24 24V800Z"/><circle cx="424" cy="620" r="23"/><path d="M397 616a27 23 0 0 1 54 0h6v8h-66v-8Z"/>
    </g>
    <path d="M394 680h60v52h-60z" fill="#e36a1e" opacity=".85"/><path d="M394 694h60M394 714h60" stroke="#e8e26a" stroke-width="5"/>
    <path d="M304 690h56v46h-56z" fill="#e3a21e" opacity=".85"/><path d="M304 704h56M304 722h56" stroke="#e8e26a" stroke-width="5"/>
    <rect width="800" height="800" fill="#000" opacity=".18"/>
  </svg>`;
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

// Shield with a hard hat: the SiteGuard mark
export const logo = (cls = 'logo') => `<svg class="${cls}" viewBox="0 0 64 72" aria-hidden="true">
  <path d="M32 3 6 13v19c0 17 11 30 26 37 15-7 26-20 26-37V13Z" fill="none" stroke="currentColor" stroke-width="5" stroke-linejoin="round"/>
  <path d="M16 44h32" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>
  <path d="M19 42c0-9 5.5-15.5 13-15.5S45 33 45 42Z" fill="currentColor"/>
  <path d="M32 26.5V36" stroke="var(--logo-gap, #1d5a22)" stroke-width="3"/>
  <path d="M23 52c2.6 2.6 5.6 4 9 4s6.4-1.4 9-4" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>`;

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
    const label = (invalid.closest('label, fieldset')?.querySelector('.field-label, .m-field > span:first-child, .m-field > legend')?.textContent || 'This field').replace('*', '').trim();
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
applyPrefs();
$('#brandLogo').innerHTML = logo('brand-logo');
$('#backBtn').innerHTML = icon('arrow-left');
store.onChange(debounce(() => { if (!$('#app').hidden) renderChrome(); }, 50));

if (auth.currentUser()) afterSignIn();
else showLogin();

window.SiteGuard = { version: CONFIG.version };
