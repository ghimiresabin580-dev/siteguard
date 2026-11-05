// My profile: contact details, password and recent sign-ins.

import * as store from '../store.js';
import { ROLES, changePassword, passwordStrength } from '../auth.js';
import { esc, fmtDateTime, timeAgo } from '../util.js';
import { icon } from '../icons.js';
import { toast, field, avatar, busy, contractorTag } from '../ui.js';

const STRENGTH = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'];

export default {
  meta: { key: 'profile', label: 'My profile', icon: 'circle-user' },

  header: () => ({ title: 'My profile', sub: 'Your details, password and sign-in history' }),

  render(ctx) {
    const u = ctx.user;
    const mine = store.all('audit').filter(a => a.userId === u.id);
    const signIns = mine.filter(a => /sign-in|Signed in/i.test(a.action)).slice(0, 8);
    const recent = mine.filter(a => !/sign/i.test(a.action)).slice(0, 10);
    return `<div class="two-col">
      <div class="stack">
        <section class="panel">
          <header class="panel-head"><h2>Details</h2></header>
          <form id="profForm" data-submit="profSave" class="panel-body" novalidate>
            <div class="prof-top">${avatar(u.name, null, 'xl')}<div><b>${esc(u.name)}</b><span>${ROLES[u.role].label}${u.companyId ? `, ${contractorTag(u.companyId)}` : ''}</span><small>${esc(u.email)}</small></div></div>
            <div class="grid-2">
              ${field('Name', `<input name="name" required maxlength="60" value="${esc(u.name)}">`)}
              ${field('Phone', `<input name="phone" type="tel" maxlength="30" value="${esc(u.phone || '')}">`)}
            </div>
            ${field('Job title', `<input name="title" maxlength="50" value="${esc(u.title || '')}">`)}
            <p class="field-hint">Your email and role are set by the site administrator.</p>
            <button class="btn primary" type="submit">Save details</button>
          </form>
        </section>
        <section class="panel">
          <header class="panel-head"><h2>Change password</h2></header>
          <form id="pwForm" data-submit="profPassword" class="panel-body" novalidate>
            ${field('Current password', '<input type="password" name="current" required autocomplete="current-password">')}
            ${field('New password', '<input type="password" name="next" required minlength="10" autocomplete="new-password" data-change="pwMeter" data-live>', 'At least 10 characters with letters and numbers.')}
            <div class="pw-meter" id="pwMeter" data-level="0"><i></i><i></i><i></i><i></i><span></span></div>
            ${field('Repeat new password', '<input type="password" name="next2" required autocomplete="new-password">')}
            <button class="btn primary" type="submit">${icon('key-round')}Change password</button>
            <p class="field-hint">Changing it signs you out on other devices.</p>
          </form>
        </section>
      </div>
      <div class="stack">
        <section class="panel">
          <header class="panel-head"><h2>Sign-ins</h2></header>
          <ul class="feed">${signIns.map(a => `<li>${icon(/Failed/.test(a.action) ? 'circle-x' : 'log-in')}<p>${esc(a.action)}${a.detail ? ` <span class="muted">${esc(a.detail)}</span>` : ''}</p><time>${fmtDateTime(a.at)}</time></li>`).join('') || '<li class="muted">No sign-ins recorded.</li>'}</ul>
        </section>
        <section class="panel">
          <header class="panel-head"><h2>What you did recently</h2></header>
          <ul class="feed">${recent.map(a => `<li>${icon('check')}<p>${esc(a.action)} <span class="muted">${esc(a.detail)}</span></p><time>${timeAgo(a.at)}</time></li>`).join('') || '<li class="muted pad">Nothing yet.</li>'}</ul>
        </section>
      </div>
    </div>`;
  },

  changes: {
    pwMeter(el) {
      const level = el.value ? passwordStrength(el.value) : 0;
      const m = document.getElementById('pwMeter');
      m.dataset.level = el.value ? level : 0;
      m.querySelector('span').textContent = el.value ? STRENGTH[level] : '';
    }
  },

  submits: {
    profSave(form, v, btn, ctx) {
      store.update('users', ctx.user.id, { name: v.name, phone: v.phone, title: v.title });
      store.audit(ctx.user, 'Updated profile');
      toast('Details saved.', 'ok');
      ctx.refresh();
    },
    async profPassword(form, v, btn, ctx) {
      if (v.next !== v.next2) return toast('The two new passwords are different.', 'err');
      const res = await busy(btn, () => changePassword(ctx.user, v.current, v.next), 'Saving…');
      if (res.error) return toast(res.error, 'err');
      form.reset();
      toast('Password changed.', 'ok');
    }
  }
};
