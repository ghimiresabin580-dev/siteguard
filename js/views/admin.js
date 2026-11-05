// Admin: users and access requests, email notifications, site settings, backups and the audit log.

import * as store from '../store.js';
import { ROLES, isAdmin, createUser, resetPassword } from '../auth.js';
import { esc, fmtDateTime, fmtStamp, timeAgo, today, download, nowIso, plural } from '../util.js';
import { icon } from '../icons.js';
import { toast, openDialog, closeDialog, confirmBox, badge, field, options, tabs, contractorOptions, busy, emptyState } from '../ui.js';
import { EVENTS, OUTBOX_STATUS, sendEmail, describe, retry } from '../mail.js';
import { CONFIG } from '../config.js';

const TABS = [['users', 'Users'], ['email', 'Email'], ['settings', 'Site settings'], ['data', 'Data'], ['audit', 'Audit log']];
const tabFrom = ctx => (TABS.some(([k]) => k === ctx.route.params[0]) ? ctx.route.params[0] : 'users');
const roleOptions = sel => options(Object.entries(ROLES).map(([k, r]) => [k, r.label]), sel);

// ---------- users ----------
function users(ctx) {
  const all = store.all('users');
  const pending = all.filter(u => u.status === 'pending');
  const others = all.filter(u => u.status !== 'pending').sort((a, b) => a.name.localeCompare(b.name));
  const company = id => store.get('contractors', id)?.name || '-';
  return `
    ${pending.length ? `<section class="panel attention-panel">
      <header class="panel-head"><h2>Access requests</h2>${badge(String(pending.length), 'warn')}</header>
      <ul class="requests">${pending.map(u => `<li>
        <div><b>${esc(u.name)}</b><small>${esc(u.email)}, ${esc(company(u.companyId))}${u.title ? `, ${esc(u.title)}` : ''}</small>
          ${u.note ? `<p class="muted">“${esc(u.note)}”</p>` : ''}<small class="muted">Asked ${timeAgo(u.createdAt)}</small></div>
        <select data-role-for="${u.id}" aria-label="Role for ${esc(u.name)}">${roleOptions(u.role || 'worker')}</select>
        <button type="button" class="btn sm ghost" data-act="admDecline" data-id="${u.id}">Decline</button>
        <button type="button" class="btn sm primary" data-act="admApprove" data-id="${u.id}">Approve</button>
      </li>`).join('')}</ul>
    </section>` : ''}
    <section class="panel">
      <header class="panel-head"><h2>${plural(others.length, 'user')}</h2><button type="button" class="btn sm primary" data-act="admNewUser">${icon('user-plus')}Add user</button></header>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Name</th><th>Role</th><th>Company</th><th>Last sign-in</th><th>Status</th><th></th></tr></thead>
        <tbody>${others.map(u => `<tr class="${u.status === 'disabled' ? 'dim' : ''}">
          <td><b>${esc(u.name)}</b><small class="block">${esc(u.email)}</small></td>
          <td data-label="Role">${u.id === ctx.user.id ? ROLES[u.role].label : `<select data-change="admRole" data-id="${u.id}" aria-label="Role for ${esc(u.name)}">${roleOptions(u.role)}</select>`}</td>
          <td data-label="Company">${esc(company(u.companyId))}</td>
          <td data-label="Last sign-in">${u.lastLoginAt ? timeAgo(u.lastLoginAt) : '<span class="muted">Never</span>'}</td>
          <td data-label="Status">${u.status === 'disabled' ? badge('Switched off', 'neutral') : u.lockedUntil && Date.parse(u.lockedUntil) > Date.now() ? badge('Locked', 'danger-soft') : u.mustChangePassword ? badge('Temporary password', 'warn-soft') : badge('Active', 'ok-soft')}</td>
          <td class="row-actions">${u.id === ctx.user.id ? '<span class="muted small">You</span>' : `
            <button type="button" class="btn sm ghost" data-act="admReset" data-id="${u.id}">Reset password</button>
            <button type="button" class="btn sm ghost" data-act="admToggle" data-id="${u.id}">${u.status === 'disabled' ? 'Switch on' : 'Switch off'}</button>`}</td>
        </tr>`).join('')}</tbody></table></div>
    </section>
    <p class="info-line">${icon('lock')}<span>Passwords are stored as salted PBKDF2 hashes, never as text. On this website, accounts and records are kept in each browser. Sharing them between devices needs a server.</span></p>`;
}

// ---------- email ----------
function email() {
  const s = store.settings();
  const out = store.all('outbox').slice(0, 40);
  const waiting = out.some(m => m.status === 'activation');
  return `<div class="two-col wide-left">
    <section class="panel">
      <header class="panel-head"><h2>Notification emails</h2></header>
      <form id="mailForm" data-submit="admMailSave" class="panel-body" novalidate>
        <label class="switch"><input type="checkbox" name="mailEnabled" ${s.mailEnabled ? 'checked' : ''}><span>Send email notifications</span></label>
        ${field('Send to', `<input name="mailTo" required maxlength="100" value="${esc(s.mailTo)}">`, 'An email address, or the alias FormSubmit sends after activation.')}
        <fieldset class="field"><legend class="field-label">Email me about</legend>
          ${Object.entries(EVENTS).map(([k, label]) => `<label class="check"><input type="checkbox" name="ev_${k}" ${s.events[k] ? 'checked' : ''}><span>${label}</span></label>`).join('')}
        </fieldset>
        ${field('Most emails per day', `<input type="number" name="dailyLimit" min="1" max="500" value="${s.dailyLimit}">`, 'Stops a busy day, or a public demo, from flooding the inbox.')}
        <div class="btn-row"><button class="btn primary" type="submit">Save</button>
          <button type="button" class="btn ghost" data-act="admTestMail">${icon('send')}Send a test email</button></div>
      </form>
    </section>
    <section class="panel">
      <header class="panel-head"><h2>How sending works</h2></header>
      <div class="panel-body prose">
        <p>The site runs on GitHub Pages with no server of its own, so emails go through <a href="https://formsubmit.co" target="_blank" rel="noopener">FormSubmit</a>.</p>
        <p><b>The first email to a new address needs activating.</b> FormSubmit sends a message titled “Action Required: Activate FormSubmit” to ${esc(s.mailTo)}. Open it and press <i>Activate Form</i>. Check the spam folder if it does not arrive.</p>
        <p>After that, every notification arrives within a minute. FormSubmit also sends a random alias you can paste above, so the address stays out of the page.</p>
        ${waiting ? `<p class="advice warn">${icon('mail-clock')}<span>Some emails are waiting for activation. After activating, press Send again on them.</span></p>` : ''}
      </div>
    </section>
  </div>
  <section class="panel">
    <header class="panel-head"><h2>Sent emails</h2><span class="muted small">Last 40 on this device</span></header>
    ${out.length ? `<div class="table-wrap"><table class="table">
      <thead><tr><th>When</th><th>Subject</th><th>To</th><th>Result</th><th></th></tr></thead>
      <tbody>${out.map(m => `<tr>
        <td class="nowrap">${fmtDateTime(m.at)}</td>
        <td><b>${esc(m.subject)}</b>${m.note ? `<small class="block muted">${esc(m.note)}</small>` : ''}</td>
        <td data-label="To">${esc(m.to)}</td>
        <td data-label="Result">${badge((OUTBOX_STATUS[m.status] || OUTBOX_STATUS.failed).label, (OUTBOX_STATUS[m.status] || OUTBOX_STATUS.failed).tone)}</td>
        <td class="row-actions">${['failed', 'queued', 'activation', 'limit', 'off'].includes(m.status) ? `<button type="button" class="btn sm ghost" data-act="admRetry" data-id="${m.id}">Send again</button>` : ''}</td>
      </tr>`).join('')}</tbody></table></div>`
      : emptyState('inbox', 'No emails yet', 'Send a test email to check that notifications reach the inbox.')}
  </section>`;
}

// ---------- settings ----------
function settings() {
  const s = store.settings();
  return `<section class="panel narrow">
    <header class="panel-head"><h2>Site settings</h2></header>
    <form id="siteForm" data-submit="admSiteSave" class="panel-body" novalidate>
      <div class="grid-2">
        ${field('Site name', `<input name="siteName" required maxlength="60" value="${esc(s.siteName)}">`)}
        ${field('Project', `<input name="project" required maxlength="80" value="${esc(s.project)}">`)}
      </div>
      <div class="grid-2">
        ${field('Crane wind limit (m/s)', `<input type="number" name="windLimit" min="5" max="25" step="0.5" required value="${s.windLimit}">`, 'Lift checks are blocked when gusts reach this.')}
        ${field('Warn before expiry (days)', `<input type="number" name="warnDays" min="1" max="60" required value="${s.warnDays}">`, 'For plant inspections and safety cards.')}
      </div>
      ${field('Last lost-time injury', `<input type="date" name="lastInjuryDate" max="${today()}" value="${s.lastInjuryDate || ''}">`, 'Starts the “days without a lost-time injury” count on the dashboard.')}
      <label class="switch"><input type="checkbox" name="keepDemoCurrent" ${s.keepDemoCurrent ? 'checked' : ''}><span>Keep demo dates current</span></label>
      <p class="field-hint">Moves every date forward each day so the sample site never looks old. Switch it off when you use SiteGuard for real work.</p>
      <button class="btn primary" type="submit">Save settings</button>
    </form>
  </section>`;
}

// ---------- data ----------
function data() {
  let bytes = 0;
  try { bytes = (localStorage.getItem('siteguard.data.v2') || '').length * 2; } catch { }
  return `<div class="two-col">
    <section class="panel">
      <header class="panel-head"><h2>Backup</h2></header>
      <div class="panel-body">
        <p>Everything SiteGuard knows is saved in this browser (${(bytes / 1024).toFixed(0)} kB, photos not included). Download a backup before clearing the browser or moving to another computer.</p>
        <div class="btn-row">
          <button type="button" class="btn primary" data-act="admExport">${icon('download')}Download backup</button>
          <label class="btn ghost">${icon('upload')}Restore from backup<input type="file" accept="application/json,.json" hidden data-change="admImport"></label>
        </div>
      </div>
    </section>
    <section class="panel">
      <header class="panel-head"><h2>Start again</h2></header>
      <div class="panel-body">
        <p>Puts the sample Malmi Airfield site back and removes every change made on this device, including accounts and passwords.</p>
        <button type="button" class="btn danger-ghost" data-act="admReset2">${icon('rotate-cw')}Reset to the sample site</button>
      </div>
    </section>
  </div>
  <p class="info-line">${icon('info')}<span>SiteGuard ${CONFIG.version}. The first version with its ASP.NET Core server and phone apps is in <a href="SiteGuard.zip" download>SiteGuard.zip</a>.</span></p>`;
}

// ---------- audit ----------
function audit() {
  const list = store.all('audit').slice(0, 200);
  return `<section class="panel">
    <header class="panel-head"><h2>Audit log</h2><span class="muted small">Latest ${list.length}</span></header>
    ${list.length ? `<div class="table-wrap"><table class="table compact">
      <thead><tr><th>When</th><th>Who</th><th>What</th><th>Details</th></tr></thead>
      <tbody>${list.map(a => `<tr><td class="nowrap">${fmtDateTime(a.at)}</td><td>${esc(a.userName)}</td><td>${esc(a.action)}</td><td class="muted">${esc(a.detail)}</td></tr>`).join('')}</tbody>
    </table></div>` : emptyState('list-checks', 'Nothing logged yet')}
  </section>`;
}

function showTempPassword(user, password, intro) {
  openDialog({
    title: 'Temporary password',
    body: `<p class="lead">${intro}</p>
      <div class="temp-pw"><code id="tempPw">${esc(password)}</code><button type="button" class="btn ghost sm" data-act="admCopy">${icon('copy')}Copy</button></div>
      <p class="muted small">Give it to ${esc(user.name)} in person or by text message. They choose their own password when they sign in. It is not shown again.</p>`,
    footer: '<button type="button" class="btn primary" data-act="closeDialog">Done</button>'
  });
}

export default {
  meta: { key: 'admin', label: 'Admin', icon: 'shield-check', badge: () => store.all('users').filter(u => u.status === 'pending').length },
  allowed: user => isAdmin(user),

  header: ctx => ({ title: 'Admin', sub: { users: 'Who can sign in, and what they can do', email: `Notifications to ${store.settings().mailTo}`, settings: 'Site details and limits', data: 'Backups and the sample data', audit: 'Who did what, and when' }[tabFrom(ctx)] }),

  render(ctx) {
    const tab = tabFrom(ctx);
    const pending = store.all('users').filter(u => u.status === 'pending').length;
    return `${tabs(TABS.map(([k, l]) => [k, l, k === 'users' && pending ? pending : null]), tab, 'admTab')}
      <div class="tab-body">${{ users, email, settings, data, audit }[tab](ctx)}</div>`;
  },

  actions: {
    admTab: (el, ctx) => ctx.go(el.dataset.key === 'users' ? '#/admin' : `#/admin/${el.dataset.key}`),
    admApprove(el, ctx) {
      const u = store.get('users', el.dataset.id);
      const role = document.querySelector(`[data-role-for="${u.id}"]`)?.value || 'worker';
      store.update('users', u.id, { status: 'active', role });
      store.audit(ctx.user, 'Approved access', `${u.name} as ${ROLES[role].label}`);
      const person = store.find('people', p => p.userId === u.id || p.name === u.name);
      if (person) store.update('people', person.id, { userId: u.id });
      else if (u.companyId) store.insert('people', { name: u.name, contractorId: u.companyId, trade: u.title || ROLES[role].label, phone: u.phone || '', taxNo: '', inductedOn: null, safetyCard: null, hotWorkCard: null, firstAid: null, electrical: null, userId: u.id, notes: '', cardNotice: {} });
      toast(`${u.name} can now sign in as ${ROLES[role].label.toLowerCase()}.`, 'ok');
      ctx.refresh();
    },
    async admDecline(el, ctx) {
      const u = store.get('users', el.dataset.id);
      if (!(await confirmBox({ title: `Decline ${esc(u.name)}?`, text: 'The request is deleted. They can ask again later.', ok: 'Decline', danger: true }))) return;
      store.remove('users', u.id);
      store.audit(ctx.user, 'Declined access', u.name);
      toast('Request declined.');
      ctx.refresh();
    },
    admNewUser() {
      openDialog({
        title: 'Add a user',
        body: `<form id="newUser" data-submit="admCreate" novalidate>
          <div class="grid-2">${field('Name', '<input name="name" required maxlength="60">')}${field('Email', '<input type="email" name="email" required maxlength="80">')}</div>
          <div class="grid-2">${field('Role', `<select name="role">${roleOptions('worker')}</select>`)}${field('Company', `<select name="companyId">${contractorOptions('', 'Choose a company')}</select>`)}</div>
          <div class="grid-2">${field('Job title', '<input name="title" maxlength="50">')}${field('Phone', '<input name="phone" type="tel" maxlength="30">')}</div>
          <p class="field-hint">SiteGuard makes a temporary password. They choose their own the first time they sign in.</p></form>`,
        wide: true,
        footer: `<button type="button" class="btn ghost" data-act="closeDialog">Cancel</button><button class="btn primary" type="submit" form="newUser">Create user</button>`
      });
    },
    async admReset(el, ctx) {
      const u = store.get('users', el.dataset.id);
      if (!(await confirmBox({ title: `Reset the password for ${esc(u.name)}?`, text: 'Their current password stops working and they are signed out everywhere.', ok: 'Reset password' }))) return;
      const pw = await resetPassword(u.id, ctx.user);
      showTempPassword(u, pw, `${esc(u.name)} can sign in with this password once.`);
      ctx.refresh();
    },
    admToggle(el, ctx) {
      const u = store.get('users', el.dataset.id);
      const off = u.status !== 'disabled';
      store.update('users', u.id, { status: off ? 'disabled' : 'active', sessionVersion: u.sessionVersion + (off ? 1 : 0) });
      store.audit(ctx.user, off ? 'Switched off user' : 'Switched on user', u.name);
      toast(off ? `${u.name} can no longer sign in.` : `${u.name} can sign in again.`, 'ok');
      ctx.refresh();
    },
    admCopy() {
      const text = document.getElementById('tempPw')?.textContent || '';
      navigator.clipboard?.writeText(text).then(() => toast('Copied.', 'ok', 1500), () => toast('Select the password and copy it.', 'err'));
    },
    async admTestMail(el, ctx) {
      const res = await busy(el, () => sendEmail({
        event: 'test', subject: `SiteGuard test email from ${store.settings().siteName}`,
        fields: { Message: 'This is a test. If you can read it, SiteGuard notifications reach this inbox.', 'Sent from': location.origin + location.pathname, Time: fmtStamp(nowIso()) },
        link: '#/admin/email', user: ctx.user
      }), 'Sending…');
      toast(describe(res), res.status === 'sent' ? 'ok' : res.status === 'failed' ? 'err' : 'info', 9000);
      ctx.refresh();
    },
    async admRetry(el, ctx) {
      const res = await busy(el, () => retry(el.dataset.id), 'Sending…');
      toast(describe(res), res?.status === 'sent' ? 'ok' : 'info', 7000);
      ctx.refresh();
    },
    admExport(el, ctx) {
      store.audit(ctx.user, 'Downloaded backup');
      download(`siteguard-backup-${today()}.json`, store.exportData(), 'application/json');
    },
    async admReset2(el, ctx) {
      if (!(await confirmBox({ title: 'Reset to the sample site?', text: 'Every change on this device is removed, including accounts you added. Download a backup first if you need it.', ok: 'Reset everything', danger: true }))) return;
      store.resetData();
      toast('The sample site is back. Sign in again.', 'ok');
      ctx.go('#/dashboard');
      location.reload();
    }
  },

  changes: {
    admRole(el, ctx) {
      const u = store.get('users', el.dataset.id);
      store.update('users', u.id, { role: el.value });
      store.audit(ctx.user, 'Changed role', `${u.name} to ${ROLES[el.value].label}`);
      toast(`${u.name} is now ${ROLES[el.value].label.toLowerCase()}.`, 'ok');
    },
    async admImport(el, ctx) {
      const file = el.files[0];
      if (!file) return;
      if (!(await confirmBox({ title: 'Restore this backup?', text: `Everything on this device is replaced with ${esc(file.name)}.`, ok: 'Restore', danger: true }))) { el.value = ''; return; }
      try {
        store.importData(await file.text());
        toast('Backup restored. Sign in again.', 'ok');
        setTimeout(() => location.reload(), 800);
      } catch (e) { toast(e.message || 'That file could not be read.', 'err'); }
      el.value = '';
    }
  },

  submits: {
    async admCreate(form, v, btn, ctx) {
      if (store.find('users', u => u.email.toLowerCase() === v.email.toLowerCase())) return toast('A user with this email already exists.', 'err');
      const { user, password } = await busy(btn, () => createUser({ name: v.name, email: v.email, role: v.role, companyId: v.companyId || null, title: v.title, phone: v.phone }, ctx.user), 'Creating…');
      showTempPassword(user, password, `${esc(user.name)} has been added as ${ROLES[user.role].label.toLowerCase()}.`);
      ctx.refresh();
    },
    admMailSave(form, v, btn, ctx) {
      const to = v.mailTo.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) && !/^[a-f0-9]{20,64}$/i.test(to)) return toast('Enter an email address or a FormSubmit alias.', 'err');
      const events = Object.fromEntries(Object.keys(EVENTS).map(k => [k, !!v['ev_' + k]]));
      const changed = to !== store.settings().mailTo;
      store.setSettings({ mailTo: to, mailEnabled: !!v.mailEnabled, events, dailyLimit: Math.max(1, +v.dailyLimit || 40) });
      store.audit(ctx.user, 'Changed email settings', to);
      toast(changed ? 'Saved. Send a test email: a new address needs activating once.' : 'Email settings saved.', 'ok', 6000);
      ctx.refresh();
    },
    admSiteSave(form, v, btn, ctx) {
      store.setSettings({ siteName: v.siteName, project: v.project, windLimit: +v.windLimit, warnDays: +v.warnDays, lastInjuryDate: v.lastInjuryDate || null, keepDemoCurrent: !!v.keepDemoCurrent });
      store.audit(ctx.user, 'Changed site settings');
      toast('Site settings saved.', 'ok');
      ctx.refresh();
    }
  }
};
