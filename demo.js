// SiteGuard online demo. Runs the real SiteGuard screens (app.js) with sample data:
// this script answers the same /api/... calls the SiteGuard server answers, in the browser.
(() => {
  'use strict';
  // SG_PREVIEW is set only on the claude.ai page, which cannot load map pictures or offer plain downloads
  const PREVIEW = !!window.SG_PREVIEW;
  const uuid = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36));
  const HSE = 'hse@yourcompany.com';
  const WARN = 14;

  // ---------- dates (like the server: plain dates for inspections, UTC times without Z) ----------
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => iso(new Date());
  const addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); return iso(new Date(y, m - 1, d + n)); };
  const dayNum = s => { const [y, m, d] = s.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 864e5); };
  const daysLeft = v => dayNum(v.validUntil) - dayNum(today());
  const noticeFor = v => { const d = daysLeft(v); return d < 0 ? 2 : d <= WARN ? 1 : 0; };
  const ago = minutes => new Date(Date.now() - minutes * 60000).toISOString().replace('Z', '');
  const inDays = days => new Date(Date.now() + days * 864e5).toISOString().replace('Z', '');

  // ---------- sample site: the same layout as Seed in Program.cs ----------
  const LAT = 60.2539, LON = 25.0442;
  const P = (x, y) => {
    const n = (32 - y) * 2.6, e = (x - 50) * 2.6;
    return [+(LAT + n / 111320).toFixed(7), +(LON + e / (111320 * Math.cos(LAT * Math.PI / 180))).toFixed(7)];
  };
  const area = (x, y, w, h) => JSON.stringify([P(x, y), P(x + w, y), P(x + w, y + h), P(x, y + h)]);
  const line = (...pts) => JSON.stringify(pts);
  const point = (x, y) => JSON.stringify([P(x, y)]);
  const item = (name, type, shape, status = 0, checkedMinsAgo = null) =>
    ({ id: uuid(), name, type, status, shape, lastCheckedUtc: checkedMinsAgo == null ? null : ago(checkedMinsAgo) });

  const items = [
    item('Zone A', 0, area(6, 7, 30, 17), 1, 95), item('Zone B', 0, area(40, 7, 26, 17), 1, 80),
    item('Zone C', 0, area(70, 7, 24, 17), 2, 70), item('Zone D', 0, area(12, 34, 24, 12)),
    item('North fence', 2, line(P(3, 3.5), P(97, 3.5)), 1, 120), item('Crane barrier', 2, line(P(38, 32), P(63.5, 32), P(63.5, 48)), 1, 65),
    item('Vehicle route', 4, line(P(8, 28), P(66.5, 28), P(66.5, 60.5)), 1, 60),
    item('Walkway west', 3, line(P(3.5, 8), P(3.5, 55))), item('Walkway south', 3, line(P(3.5, 55), P(62, 55)), 1, 50),
    item('Crane lift area', 5, area(40, 34, 22, 13), 1, 45), item('Storage lift area', 5, area(70, 34, 22, 12)),
    item('Main gate', 1, point(66.5, 61.5), 1, 30), item('Side gate', 1, point(97, 16))
  ].sort((a, b) => a.type - b.type || a.name.localeCompare(b.name));
  const byName = n => items.find(i => i.name === n);

  const reports = [
    { type: 0, severity: 1, place: 'Zone C', comment: 'Open edge at the excavation, barrier missing', reportedBy: 'Mikko', mins: 70 },
    { type: 2, severity: 0, place: 'Walkway west', comment: 'Worker on the walkway without a helmet', reportedBy: 'Aino', mins: 300 },
    { type: 1, severity: 2, place: 'Crane lift area', comment: 'Load swung close to a worker during a lift', reportedBy: 'Pekka', mins: 1560 },
    { type: 0, severity: 1, place: 'Zone A', comment: 'Mud on the walkway after rain', reportedBy: 'Mikko', mins: 4300 }
  ].map(r => ({ id: uuid(), type: r.type, severity: r.severity, siteItemId: byName(r.place).id, latitude: null, longitude: null,
    photoPath: null, comment: r.comment, reportedBy: r.reportedBy, createdUtc: ago(r.mins) }));
  let checks = 9;
  const lifts = [{ id: uuid(), liftAreaId: byName('Crane lift area').id, liftAreaName: 'Crane lift area', planConfirmed: true, zoneClear: true,
    radioCheckDone: true, weatherOk: true, notes: 'Steel beams to Zone B', operator: 'Pekka', createdUtc: ago(130) }];
  const radio = [
    { id: uuid(), text: 'Area clear', sentBy: 'Pekka', sentUtc: ago(125) },
    { id: uuid(), text: 'Reversing', sentBy: 'Dumper driver', sentUtc: ago(190) },
    { id: uuid(), text: 'Stop', sentBy: 'Aino', sentUtc: ago(320) }];
  const docs = [
    { id: uuid(), title: 'Traffic plan', type: 0, fileUrl: 'docs/sample.html?name=Traffic%20plan', expiresUtc: inDays(30) },
    { id: uuid(), title: 'Hot work permit', type: 1, fileUrl: 'docs/sample.html?name=Hot%20work%20permit', expiresUtc: inDays(5) },
    { id: uuid(), title: 'Crane lift plan', type: 2, fileUrl: 'docs/sample.html?name=Crane%20lift%20plan', expiresUtc: inDays(60) }];
  const cleaning = [
    { description: 'Clear packaging from walkway', area: 'Walkway south' },
    { description: 'Sweep mud off vehicle route', area: 'Vehicle route' },
    { description: 'Tidy material storage', area: 'Zone D' }
  ].map((t, k) => ({ id: uuid(), ...t, beforePhotoPath: null, afterPhotoPath: null, done: false, createdUtc: ago(200 + k * 30), completedUtc: null }));

  const vehicle = (name, regNumber, type, left, level, notifiedMinsAgo) => {
    const validUntil = addDays(today(), left);
    return { id: uuid(), name, regNumber, type, lastInspected: addDays(validUntil, -365), validUntil, notes: null,
      hseNoticeLevel: level, hseNotifiedUtc: level ? ago(notifiedMinsAgo) : null, createdUtc: ago(60 * 24 * 30) };
  };
  const vehicles = [
    vehicle('Excavator CAT 320', 'EXC-01', 0, 9, 1, 60 * 24 * 5),
    vehicle('Wheel loader Volvo L90', 'WL-02', 1, -3, 2, 60 * 24 * 2),
    vehicle('Mobile crane Liebherr LTM 1050', 'CR-03', 3, 45, 0),
    vehicle('Dump truck Scania', 'ABC-123', 2, 160, 0),
    vehicle('Telehandler JCB 540', 'TH-05', 4, 220, 0)];
  const inspections = vehicles.map(v => ({ id: uuid(), vehicleId: v.id, inspectedOn: v.lastInspected, validUntil: v.validUntil,
    inspector: 'Inspection company', notes: null, recordedBy: 'Site manager', createdUtc: v.createdUtc }));

  // ---------- live alerts (stands in for the SignalR hub) ----------
  const hub = {};
  window.signalR = { HubConnectionBuilder: class {
    withUrl() { return this; }
    withAutomaticReconnect() { return this; }
    build() { return { on: (name, fn) => { hub[name] = fn; }, start: () => Promise.resolve() }; }
  } };
  const push = (name, ...args) => { try { hub[name] && hub[name](...args); } catch { } };

  // ---------- the HSE email (same content as InspectionEmail.Build on the server) ----------
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const longDay = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); };
  const statusText = d => d < 0 ? `EXPIRED ${-d} day${d === -1 ? '' : 's'} ago` : d === 0 ? 'Ends today' : `Ends in ${d} day${d === 1 ? '' : 's'}`;
  const label = v => v.regNumber ? `${v.name} (${v.regNumber})` : v.name;

  function buildEmail(list, statusReport) {
    const expired = list.filter(v => daysLeft(v) < 0).length;
    const attention = list.filter(v => daysLeft(v) <= WARN).length;
    const subject = statusReport ? `SiteGuard: vehicle inspection status (${attention} of ${list.length} need attention)`
      : list.length === 1 ? (expired === 1 ? 'Vehicle inspection EXPIRED: ' : 'Vehicle inspection ends soon: ') + label(list[0])
      : `Vehicle inspections need attention: ${list.length} vehicles` + (expired ? `, ${expired} expired` : '');
    const intro = statusReport ? `Inspection status of all ${list.length} vehicles on site. ${attention} need attention.`
      : 'The inspection of these vehicles is ending or has ended. Please book a new inspection. A vehicle whose inspection has expired must not be used on site.';
    const sentAt = new Date().toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const rows = list.map(v => {
      const d = daysLeft(v);
      const color = d < 0 ? '#dc2626' : d <= WARN ? '#b45309' : '#15803d';
      const status = d > WARN ? `Valid (${d} days left)` : statusText(d);
      return `<tr style="border-bottom:1px solid #e2e8f0"><td><b>${esc(v.name)}</b></td><td>${esc(v.regNumber)}</td><td>${longDay(v.validUntil)}</td><td style="color:${color};font-weight:bold">${esc(status)}</td></tr>`;
    }).join('');
    const html = `<div style="font-family:Segoe UI,Arial,sans-serif;color:#0f172a;max-width:680px">
      <h2 style="margin:0 0 8px;color:#0f2a43">Vehicle inspections</h2><p>${esc(intro)}</p>
      <table cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:14px">
      <tr style="background:#0f2a43;color:#ffffff;text-align:left"><th>Vehicle</th><th>Reg. / ID</th><th>Valid until</th><th>Status</th></tr>${rows}</table>
      <p style="color:#64748b;font-size:12px">Sent by SiteGuard on ${esc(sentAt)}. HSE gets one email when an inspection has ${WARN} days left and another when it has expired.</p></div>`;
    return { subject, html };
  }

  function showEmail(mail, kind) {
    const sheet = document.getElementById('mailSheet');
    if (!sheet) return;
    document.getElementById('mailKind').textContent = kind;
    document.getElementById('mailSubject').textContent = mail.subject;
    document.getElementById('mailBody').innerHTML = mail.html;
    sheet.hidden = false;
    document.getElementById('mailClose').focus();
  }
  document.addEventListener('click', e => {
    if (e.target.id === 'mailClose' || e.target.id === 'mailSheet') document.getElementById('mailSheet').hidden = true;
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { const s = document.getElementById('mailSheet'); if (s) s.hidden = true; } });

  // VehicleInspectionMonitor: email HSE once when 14 days are left and once when expired
  function monitor() {
    const toTell = [];
    for (const v of vehicles) {
      const need = noticeFor(v);
      if (need > v.hseNoticeLevel) toTell.push([v, need]);
      else if (need < v.hseNoticeLevel) v.hseNoticeLevel = need;
    }
    if (!toTell.length) return;
    for (const [v, n] of toTell) { v.hseNoticeLevel = n; v.hseNotifiedUtc = ago(0); }
    const list = toTell.map(t => t[0]).sort((a, b) => a.validUntil.localeCompare(b.validUntil));
    const expired = toTell.filter(t => t[1] === 2).length;
    const first = toTell[0][0];
    const text = toTell.length === 1
      ? (expired ? `Inspection EXPIRED: ${first.name}. Do not use it. ` : `Inspection ends soon: ${first.name}. `) + 'HSE has been emailed.'
      : `${toTell.length} vehicle inspections need attention (${expired} expired). HSE has been emailed.`;
    push('VehicleInspection', { text, expired: expired > 0 });
    showEmail(buildEmail(list, false), 'Sent automatically');
  }

  // ---------- the API ----------
  const ok = body => ({ status: 200, body });
  const bad = message => ({ status: 400, body: message });
  const notFound = () => ({ status: 404 });
  const clean = (s, max, fallback) => { s = (s ?? '').toString().trim(); return s ? s.slice(0, max) : fallback; };

  function route(method, url, raw) {
    const p = url.pathname;
    const body = () => (typeof raw === 'string' && raw ? JSON.parse(raw) : {});
    let m;

    if (p === '/api/items') return ok(items);
    if (p === '/api/photos' && method === 'POST') {
      const file = raw instanceof FormData ? raw.get('file') : null;
      if (!file) return bad('Only photos (jpg, png, webp, heic) are allowed.');
      return ok({ url: URL.createObjectURL(file) });
    }
    if (p === '/api/reports' && method === 'POST') {
      const r = body();
      const it = items.find(i => i.id === r.siteItemId);
      const rep = { id: uuid(), type: r.type, severity: r.severity, siteItemId: it ? it.id : null, latitude: r.latitude ?? null, longitude: r.longitude ?? null,
        photoPath: r.photoPath ?? null, comment: r.comment ? clean(r.comment, 500, '') : null, reportedBy: clean(r.reportedBy, 60, 'Worker'), createdUtc: ago(0) };
      reports.unshift(rep);
      if (it && rep.severity !== 0) it.status = 2;
      if (rep.severity === 2) setTimeout(() => push('SeriousReport', { id: rep.id, type: rep.type, severity: 2, place: it ? it.name : null, comment: rep.comment, reportedBy: rep.reportedBy, createdUtc: rep.createdUtc }), 200);
      return { status: 201, body: rep };
    }
    if (p === '/api/reports') {
      const days = +(url.searchParams.get('days') || 7);
      const since = Date.now() - days * 864e5;
      return ok(reports.filter(r => new Date(r.createdUtc + 'Z').getTime() >= since).slice(0, 50)
        .map(r => ({ ...r, place: (items.find(i => i.id === r.siteItemId) || {}).name ?? null })));
    }
    if (p === '/api/checks' && method === 'POST') {
      const e = body();
      if (e.result !== 1 && e.result !== 2) return bad('Result must be OK or Problem.');
      const it = items.find(i => i.id === e.siteItemId);
      if (!it) return notFound();
      it.status = e.result; it.lastCheckedUtc = ago(0); checks++;
      if (e.result === 2) reports.unshift({ id: uuid(), type: 0, severity: 1, siteItemId: it.id, latitude: null, longitude: null, photoPath: e.photoPath ?? null,
        comment: 'Found during shift check', reportedBy: clean(e.checkedBy, 60, 'Worker'), createdUtc: ago(0) });
      return ok(it);
    }
    if (p === '/api/lifts' && method === 'POST') {
      const l = body();
      if (!(l.planConfirmed && l.zoneClear && l.radioCheckDone && l.weatherOk)) return bad('Lift checklist is not complete.');
      const it = items.find(i => i.id === l.liftAreaId);
      if (!it || it.type !== 5) return bad('Choose a lift area.');
      const rec = { ...l, id: uuid(), liftAreaName: it.name, operator: clean(l.operator, 60, 'Worker'), notes: l.notes ? clean(l.notes, 300, '') : null, createdUtc: ago(0) };
      lifts.unshift(rec);
      return ok(rec);
    }
    if (p === '/api/lifts') return ok(lifts.slice(0, 20));
    if (p === '/api/documents' && method === 'POST') {
      const d = body();
      if (!d.title || !d.title.trim()) return bad('Title is required.');
      const link = d.fileUrl || '';
      if (!((link.startsWith('/') && !link.startsWith('//')) || link.startsWith('https://') || link.startsWith('http://')))
        return bad('Link must start with /, http:// or https://');
      const doc = { id: uuid(), title: clean(d.title, 100, 'Document'), type: d.type, fileUrl: link, expiresUtc: String(d.expiresUtc).replace('Z', '') };
      docs.push(doc);
      return ok(doc);
    }
    if (p === '/api/documents') {
      return ok([...docs].sort((a, b) => a.expiresUtc.localeCompare(b.expiresUtc)).map(d => {
        const days = Math.floor((new Date(d.expiresUtc + 'Z') - Date.now()) / 864e5);
        return { ...d, daysLeft: days, state: days < 0 ? 'expired' : days <= 7 ? 'soon' : 'ok' };
      }));
    }

    // vehicle inspections
    if (p === '/api/email/status') return ok({ ready: true, hseTo: HSE, warnDaysBefore: WARN });
    if (p === '/api/vehicles' && method === 'GET') {
      return ok([...vehicles].sort((a, b) => a.validUntil.localeCompare(b.validUntil) || a.name.localeCompare(b.name)).map(v => ({
        ...v, daysLeft: daysLeft(v), state: ['ok', 'soon', 'expired'][noticeFor(v)],
        history: inspections.filter(i => i.vehicleId === v.id).sort((a, b) => b.inspectedOn.localeCompare(a.inspectedOn) || b.createdUtc.localeCompare(a.createdUtc))
      })));
    }
    if (p === '/api/vehicles' && method === 'POST') {
      const n = body();
      if (!n.name || !n.name.trim()) return bad('Name is required.');
      if (!n.validUntil) return bad('Give the date the inspection is valid until.');
      if (n.lastInspected && (n.lastInspected > today() || n.lastInspected >= n.validUntil))
        return bad('The last inspection must be in the past and before the valid-until date.');
      const v = { id: uuid(), name: clean(n.name, 80, 'Vehicle'), regNumber: clean(n.regNumber, 30, ''), type: n.type, lastInspected: n.lastInspected || null,
        validUntil: n.validUntil, notes: n.notes ? clean(n.notes, 300, '') : null, hseNoticeLevel: 0, hseNotifiedUtc: null, createdUtc: ago(0) };
      vehicles.push(v);
      if (n.lastInspected) inspections.push({ id: uuid(), vehicleId: v.id, inspectedOn: n.lastInspected, validUntil: n.validUntil, inspector: null, notes: null,
        recordedBy: clean(n.addedBy, 60, 'Worker'), createdUtc: ago(0) });
      setTimeout(monitor, 900);
      return ok(v);
    }
    if ((m = p.match(/^\/api\/vehicles\/([\w-]+)\/inspections$/)) && method === 'POST') {
      const v = vehicles.find(x => x.id === m[1]);
      if (!v) return notFound();
      const n = body(), t = today();
      if (!n.inspectedOn || n.inspectedOn > t) return bad('Give the inspection date (today or earlier).');
      if (!n.validUntil || n.validUntil <= n.inspectedOn || n.validUntil < t) return bad('Valid until must be after the inspection date and not in the past.');
      Object.assign(v, { lastInspected: n.inspectedOn, validUntil: n.validUntil, hseNoticeLevel: 0, hseNotifiedUtc: null });
      inspections.push({ id: uuid(), vehicleId: v.id, inspectedOn: n.inspectedOn, validUntil: n.validUntil, inspector: n.inspector ? clean(n.inspector, 60, '') : null,
        notes: n.notes ? clean(n.notes, 300, '') : null, recordedBy: clean(n.recordedBy, 60, 'Worker'), createdUtc: ago(0) });
      setTimeout(monitor, 900);
      return ok(v);
    }
    if ((m = p.match(/^\/api\/vehicles\/([\w-]+)$/)) && method === 'DELETE') {
      const k = vehicles.findIndex(x => x.id === m[1]);
      if (k < 0) return notFound();
      const [v] = vehicles.splice(k, 1);
      for (let i = inspections.length - 1; i >= 0; i--) if (inspections[i].vehicleId === v.id) inspections.splice(i, 1);
      return ok(undefined);
    }
    if (p === '/api/vehicles/email-hse' && method === 'POST') {
      if (!vehicles.length) return bad('There are no vehicles yet.');
      const list = [...vehicles].sort((a, b) => a.validUntil.localeCompare(b.validUntil) || a.name.localeCompare(b.name));
      showEmail(buildEmail(list, true), 'Status email');
      return ok({ sent: false, message: 'Demo: this is the email HSE would get. Nothing was sent.' });
    }

    // cleaning, radio, weekly summary
    if (p === '/api/cleaning' && method === 'POST') {
      const n = body();
      if (!n.description || !n.description.trim()) return bad('Describe the task.');
      const t = { id: uuid(), description: clean(n.description, 200, ''), area: n.area ? clean(n.area, 60, '') : null, beforePhotoPath: null, afterPhotoPath: null,
        done: false, createdUtc: ago(0), completedUtc: null };
      cleaning.push(t);
      return ok(t);
    }
    if (p === '/api/cleaning') return ok([...cleaning].sort((a, b) => (a.done - b.done) || b.createdUtc.localeCompare(a.createdUtc)));
    if ((m = p.match(/^\/api\/cleaning\/([\w-]+)$/)) && method === 'PUT') {
      const t = cleaning.find(x => x.id === m[1]);
      if (!t) return notFound();
      const u = body();
      if (u.beforePhotoPath) t.beforePhotoPath = u.beforePhotoPath;
      if (u.afterPhotoPath) { t.afterPhotoPath = u.afterPhotoPath; t.done = true; t.completedUtc = ago(0); }
      return ok(t);
    }
    if (p === '/api/radio' && method === 'POST') {
      const r = body();
      if (!['Stop', 'Area clear', 'Reversing'].includes(r.text)) return bad('Unknown radio message.');
      const msg = { id: uuid(), text: r.text, sentBy: clean(r.sentBy, 60, 'Worker'), sentUtc: ago(0) };
      radio.unshift(msg);
      setTimeout(() => push('Radio', { text: msg.text, sentBy: msg.sentBy, sentUtc: msg.sentUtc }), 100);
      return ok(msg);
    }
    if (p === '/api/radio') return ok(radio.slice(0, 20));
    if (p === '/api/summary') {
      const since = Date.now() - 7 * 864e5;
      const week = reports.filter(r => new Date(r.createdUtc + 'Z').getTime() >= since);
      const hot = {};
      week.filter(r => r.siteItemId).forEach(r => {
        const h = hot[r.siteItemId] || (hot[r.siteItemId] = { itemId: r.siteItemId, name: (items.find(i => i.id === r.siteItemId) || {}).name || '?', count: 0, serious: 0 });
        h.count++; if (r.severity === 2) h.serious++;
      });
      return ok({
        fromUtc: new Date(since).toISOString(), toUtc: new Date().toISOString(), total: week.length,
        hazards: week.filter(r => r.type === 0).length, nearMisses: week.filter(r => r.type === 1).length, unsafeBehaviour: week.filter(r => r.type === 2).length,
        serious: week.filter(r => r.severity === 2).length, checks, lifts: lifts.length,
        hotspots: Object.values(hot).sort((a, b) => b.count - a.count),
        notCheckedToday: items.filter(i => !i.lastCheckedUtc || new Date(i.lastCheckedUtc + 'Z').getTime() < Date.now() - 864e5).map(i => i.name),
        expiringDocuments: docs.filter(d => new Date(d.expiresUtc + 'Z') - Date.now() <= 14 * 864e5).sort((a, b) => a.expiresUtc.localeCompare(b.expiresUtc))
          .map(d => ({ title: d.title, expiresUtc: d.expiresUtc, expired: new Date(d.expiresUtc + 'Z') < Date.now() })),
        warnDays: WARN,
        vehicleInspections: vehicles.filter(v => daysLeft(v) <= WARN).sort((a, b) => a.validUntil.localeCompare(b.validUntil))
          .map(v => ({ name: v.name, regNumber: v.regNumber, validUntil: v.validUntil, daysLeft: daysLeft(v) }))
      });
    }
    return notFound();
  }

  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, opts = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    if (!url.startsWith('/api/')) return realFetch(input, opts);
    await new Promise(r => setTimeout(r, 120));   // feel like a real server
    let res;
    try { res = route((opts.method || 'GET').toUpperCase(), new URL(url, 'https://siteguard.demo'), opts.body); }
    catch (e) { res = { status: 500, body: 'Demo error: ' + e.message }; }
    return new Response(res.body === undefined ? '' : JSON.stringify(res.body),
      { status: res.status || 200, headers: { 'Content-Type': 'application/json' } });
  };

  // ---------- the map: the claude.ai preview cannot load map pictures, so it draws a site-plan grid ----------
  if (PREVIEW && window.L) {
    const SitePlan = L.GridLayer.extend({
      createTile() {
        const c = document.createElement('canvas');
        c.width = c.height = 256;
        const g = c.getContext('2d');
        g.fillStyle = '#e8edf1'; g.fillRect(0, 0, 256, 256);
        g.strokeStyle = 'rgba(15,42,67,.07)'; g.lineWidth = 1;
        for (let k = 32; k < 256; k += 32) {
          g.beginPath(); g.moveTo(k + 0.5, 0); g.lineTo(k + 0.5, 256); g.moveTo(0, k + 0.5); g.lineTo(256, k + 0.5); g.stroke();
        }
        g.strokeStyle = 'rgba(15,42,67,.16)'; g.strokeRect(0.5, 0.5, 256, 256);
        return c;
      }
    });
    L.tileLayer = (_url, o) => new SitePlan({ maxZoom: (o && o.maxZoom) || 21, attribution: 'Site plan (demo)' });
  }
  const note = PREVIEW
    ? `<p class="demo-note">Demo site: the former Malmi airport in Helsinki. In the installed app this map shows
    satellite and street map pictures; this online preview can only draw the site plan.
    <a href="https://www.openstreetmap.org/?mlat=60.2539&amp;mlon=25.0442#map=16/60.2539/25.0442" target="_blank" rel="noopener">See the place on OpenStreetMap</a></p>`
    : `<p class="demo-note">Demo site: the former Malmi airport in Helsinki, an open field that is being built into a new
    district. Switch between satellite and street map with the layers button.</p>`;
  new MutationObserver(() => {
    const legend = document.querySelector('#view .legend');
    if (legend && !document.querySelector('#view .demo-note')) legend.insertAdjacentHTML('afterend', note);
  }).observe(document.getElementById('view'), { childList: true, subtree: true });

  // ---------- download the whole project (claude.ai page; the website uses a plain link) ----------
  if (PREVIEW) (async () => {
    const btn = document.getElementById('getProject');
    const downloads = window.claude && window.claude.use ? await window.claude.use('downloads') : null;
    if (!btn || !downloads) return;   // saving files is not possible in this view
    btn.hidden = false;
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Preparing...';
      try {
        const b64 = (await (await realFetch('siteguard-project.b64.txt')).text()).trim();
        const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
        await downloads.save({ filename: 'SiteGuard.zip', data: new Blob([bytes]) });
        btn.textContent = 'Project downloaded';
      } catch (e) {
        const code = e && e.code;
        if (code === 'declined' || code === 'rate_limited') btn.textContent = 'Download the project (.zip)';
        else { btn.textContent = 'Download is not available here'; return; }
      }
      btn.disabled = false;
    });
  })();
})();
