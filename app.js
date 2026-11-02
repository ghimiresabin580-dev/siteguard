'use strict';

// ---------- helpers ----------
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const JSON_HDR = { 'Content-Type': 'application/json' };

const ITEM_TYPES = ['Zone', 'Gate', 'Barrier', 'Walkway', 'Vehicle route', 'Lift area'];
const REPORT_TYPES = ['Hazard', 'Near miss', 'Unsafe behaviour'];
const REPORT_ICONS = ['⚠️', '😮‍💨', '🚫'];
const SEVERITY = ['Low', 'Medium', 'Serious'];
const STATUS = ['Not checked', 'OK', 'Problem'];
const DOC_TYPES = ['Traffic plan', 'Permit', 'Lift plan'];
const SIGNALS = ['Stop', 'Emergency stop', 'Raise', 'Lower', 'Move forward', 'Move back', 'Turn left', 'Turn right'];
const VEHICLE_TYPES = ['Excavator', 'Wheel loader', 'Dump truck', 'Crane', 'Telehandler', 'Forklift', 'Lifting platform', 'Van / car', 'Other'];
const HSE_NOTICE = ['', 'ending soon', 'expired'];

// ---------- server address ----------
// The web version talks to the server it was opened from. The iOS and Android apps
// carry these screens inside the app, so they ask once for the server address.
const NATIVE = !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
let SERVER = '';
try { if (NATIVE) SERVER = localStorage.getItem('sg-server') || ''; } catch { }
// Server paths such as /uploads/photo.jpg need the server address in the apps
const full = p => (typeof p === 'string' && p.startsWith('/') && !p.startsWith('//')) ? SERVER + p : p;

const state = {
  tab: 'map', items: [], selected: null,
  reportType: null, reportPlace: '', reportPhoto: null, reportComment: '', busy: false,
  checkPhotos: {},
  lift: { area: '', plan: false, zone: false, radio: false, weather: false, notes: '' },
  lifts: [], docs: [], radio: [], cleaning: [], reports: [], summary: null,
  vehicles: [], email: null, renewing: null,
  map: null, mapItems: null, mapView: null, mapFitted: false, heatMap: null
};

// ISO times from the server may come without a "Z" - they are always UTC
const utc = s => s ? new Date(/Z$|[+-]\d\d:\d\d$/.test(s) ? s : s + 'Z') : null;
const fmt = s => {
  const d = utc(s);
  return d ? d.toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'never';
};
// Plain dates ("2026-11-15") for inspections, shown in the phone's own date style
const parseDay = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };
const day = s => s ? parseDay(s).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const isoDay = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addMonths = (d, n) => { const x = new Date(d.getTime()); x.setMonth(x.getMonth() + n); return x; };
const daysLeftText = n => n < 0 ? 'Expired' : n === 0 ? 'Ends today' : `${n} day${n === 1 ? '' : 's'} left`;
const who = () => ($('#who').value || '').trim() || 'Worker';

async function api(path, opts) {
  const r = await fetch(SERVER + path, opts);
  const text = await r.text();
  if (!r.ok) throw new Error(text ? text.replace(/^"|"$/g, '') : r.statusText || 'Server error ' + r.status);
  return text ? JSON.parse(text) : null;
}
const post = (path, body) => api(path, { method: 'POST', headers: JSON_HDR, body: JSON.stringify(body) });

let toastTimer;
function toast(msg, isErr) {
  const t = $('#toast');
  t.textContent = msg; t.className = isErr ? 'err' : ''; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, isErr ? 6000 : 3500);
}

function beep() {
  try {
    const a = new (window.AudioContext || window.webkitAudioContext)();
    const o = a.createOscillator();
    o.frequency.value = 880; o.connect(a.destination); o.start();
    setTimeout(() => { o.stop(); a.close(); }, 450);
  } catch { /* sound is optional */ }
}
function showAlert(text, level) {
  const bar = $('#alertBar');
  bar.textContent = text; bar.className = level; bar.hidden = false;
  if (level === 'danger') { beep(); try { navigator.vibrate?.([300, 150, 300]); } catch { } }
  clearTimeout(showAlert.t);
  showAlert.t = setTimeout(() => { bar.hidden = true; }, 20000);
}
$('#alertBar').addEventListener('click', () => { $('#alertBar').hidden = true; });

const getPosition = () => new Promise(res => {
  if (!navigator.geolocation) return res(null);
  navigator.geolocation.getCurrentPosition(
    p => res({ lat: p.coords.latitude, lon: p.coords.longitude }),
    () => res(null),
    { timeout: 4000, maximumAge: 60000 });
});

// Shrink big phone photos before upload
async function shrink(file) {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.8));
    return blob ? new File([blob], 'photo.jpg', { type: 'image/jpeg' }) : file;
  } catch { return file; }
}
async function uploadPhoto(file) {
  const small = await shrink(file);
  const fd = new FormData();
  fd.append('file', small, small.name);
  const res = await api('/api/photos', { method: 'POST', body: fd });
  return res.url;
}

// ---------- real site map (Leaflet) ----------
// Every site item has a shape of real map positions: [[lat, lon], ...].
const STATUS_COLOR = ['#94a3b8', '#16a34a', '#dc2626'];
const SEL_COLOR = '#f59e0b';
const shapeOf = i => { try { const p = JSON.parse(i.shape || '[]'); return Array.isArray(p) ? p : []; } catch { return []; } };
const mapAlive = m => !!m && document.body.contains(m.getContainer());

function newMap(el) {
  const layers = {
    'Satellite': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 21, maxNativeZoom: 19, attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics' }),
    'Street map': L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      { maxZoom: 21, maxNativeZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' })
  };
  let base = 'Satellite';
  try { base = localStorage.getItem('sg-layer') || base; } catch { }
  const map = L.map(el, { layers: [layers[base] || layers.Satellite], zoomSnap: 0.25 });
  L.control.layers(layers, null, { position: 'topright' }).addTo(map);
  L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);
  map.on('baselayerchange', e => { try { localStorage.setItem('sg-layer', e.name); } catch { } });
  return map;
}

// Zones and lift areas are areas, gates are points, the rest are lines
function drawItem(i, group, heat) {
  const pts = shapeOf(i);
  if (!pts.length) return;
  const sel = !heat && i.id === state.selected;
  const color = heat ? '#e2e8f0' : (STATUS_COLOR[i.status] || STATUS_COLOR[0]);
  const interactive = !heat;
  let layer;
  if (i.type === 0 || i.type === 5) {
    layer = L.polygon(pts, {
      color: sel ? SEL_COLOR : color, weight: sel ? 5 : 2.5, fillColor: color,
      fillOpacity: heat ? 0.18 : 0.35, dashArray: i.type === 5 ? '8 6' : null, interactive
    });
  } else if (i.type === 1) {
    layer = L.circleMarker(pts[0], { radius: sel ? 12 : 9, color: sel ? SEL_COLOR : '#ffffff', weight: 3, fillColor: color, fillOpacity: 1, interactive });
  } else {
    const w = i.type === 4 ? 9 : i.type === 3 ? 6 : 5;
    layer = L.featureGroup([
      L.polyline(pts, { color: sel ? SEL_COLOR : '#0f172a', weight: w + (sel ? 8 : 4), opacity: sel ? 1 : 0.65, lineCap: 'round', lineJoin: 'round', interactive }),
      L.polyline(pts, { color, weight: w, dashArray: i.type === 4 ? '14 10' : i.type === 3 ? '1 10' : null, lineCap: 'round', lineJoin: 'round', interactive })
    ]);
  }
  if (!heat) {
    const area = i.type === 0 || i.type === 5;
    layer.bindTooltip(esc(i.name), area ? { permanent: true, direction: 'center', className: 'maplabel' } : { direction: 'top', sticky: true });
    layer.on('click', () => selectItem(i.id, false));
  }
  layer.addTo(group);
}

function addLocateButton(map) {
  const ctl = L.control({ position: 'topleft' });
  ctl.onAdd = () => {
    const div = L.DomUtil.create('div', 'leaflet-bar locate-bar');
    div.innerHTML = '<a href="#" role="button" class="locate" title="Show my position" aria-label="Show my position">📍</a>';
    L.DomEvent.disableClickPropagation(div);
    L.DomEvent.on(div.firstChild, 'click', e => { L.DomEvent.preventDefault(e); locateMe(map); });
    return div;
  };
  ctl.addTo(map);
}

function locateMe(map) {
  if (!navigator.geolocation) return toast('This device cannot give a position', true);
  toast('Finding your position...');
  navigator.geolocation.getCurrentPosition(p => {
    const ll = [p.coords.latitude, p.coords.longitude];
    if (state.me) state.me.remove();
    state.me = L.layerGroup([
      L.circle(ll, { radius: p.coords.accuracy, color: '#2563eb', weight: 1, fillOpacity: 0.12, interactive: false }),
      L.circleMarker(ll, { radius: 8, color: '#ffffff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }).bindTooltip('You are here')
    ]).addTo(map);
    map.setView(ll, Math.max(map.getZoom(), 17));
    toast(`Position found (±${Math.round(p.coords.accuracy)} m)`);
  }, err => {
    const insecure = location.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(location.hostname);
    toast(insecure ? 'GPS only works over https or in the phone app' : 'Could not get your position: ' + err.message, true);
  }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 10000 });
}

function selectItem(id, fly) {
  state.selected = id;
  renderMap();
  const pts = shapeOf(state.items.find(i => i.id === id) || {});
  if (fly && state.map && pts.length) {
    $('#siteMap').scrollIntoView({ behavior: 'smooth', block: 'center' });
    state.map.flyToBounds(L.latLngBounds(pts), { maxZoom: 19, padding: [50, 50], duration: 0.6 });
  }
}

const statusCounts = items => [0, 1, 2].map(s => items.filter(i => i.status === s).length);
const placeOptions = (selected, allowNone) =>
  (allowNone ? `<option value="">Not on the map / unknown</option>` : '<option value="">Choose...</option>') +
  state.items.map(i => `<option value="${i.id}" ${i.id === selected ? 'selected' : ''}>${esc(i.name)} (${ITEM_TYPES[i.type]})</option>`).join('');

// ---------- data loading ----------
async function loadItems() { state.items = await api('/api/items'); }

const views = {
  map: { load: loadItems, render: renderMap },
  report: { load: async () => { await loadItems(); state.reports = await api('/api/reports?days=2'); }, render: renderReport },
  checks: { load: loadItems, render: renderChecks },
  lift: { load: async () => { await loadItems(); state.lifts = await api('/api/lifts'); }, render: renderLift },
  docs: { load: async () => { state.docs = await api('/api/documents'); }, render: renderDocs },
  vehicles: { load: async () => { [state.vehicles, state.email] = await Promise.all([api('/api/vehicles'), api('/api/email/status')]); }, render: renderVehicles },
  machine: { load: async () => { state.radio = await api('/api/radio'); }, render: renderMachine },
  clean: { load: async () => { state.cleaning = await api('/api/cleaning'); }, render: renderClean },
  summary: { load: async () => { await loadItems(); state.summary = await api('/api/summary'); }, render: renderSummary }
};

async function go(tab) {
  if (tab !== state.tab) state.renewing = null;
  state.tab = tab;
  $('#nav').hidden = false;
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  const active = $('#nav button.active');   // keep the open tab visible in the scrolling bar
  if (active) { const n = $('#nav'); n.scrollLeft = Math.max(0, active.offsetLeft - (n.clientWidth - active.offsetWidth) / 2); }
  try { history.replaceState(null, '', '#' + tab); } catch { }
  try { await views[tab].load(); } catch (e) { toast('Could not load data: ' + e.message, true); }
  views[tab].render();
  window.scrollTo(0, 0);
}

// Reload data and redraw the current screen (keeps scroll position)
async function refresh() {
  const y = window.scrollY;
  try { await views[state.tab].load(); } catch { return; }
  views[state.tab].render();
  window.scrollTo(0, y);
}

// ---------- screens ----------
const view = $('#view');

function renderMap() {
  const [none, ok, bad] = statusCounts(state.items);
  if (!mapAlive(state.map)) {
    if (state.map) state.map.remove();
    state.map = null;
    view.innerHTML = `
      <h2>Site map</h2>
      <div class="stats" id="mapStats"></div>
      <div id="siteMap" class="map"></div>
      <div class="legend">
        <span><i style="background:#16a34a"></i>OK</span>
        <span><i style="background:#94a3b8"></i>Not checked</span>
        <span><i style="background:#dc2626"></i>Problem</span>
        <span><i class="dash"></i>Lift area</span>
      </div>
      <div id="mapDetails"></div>`;
    if (typeof L === 'undefined') {
      $('#siteMap').innerHTML = '<p class="hint" style="padding:16px">The map could not be loaded.</p>';
    } else {
      state.map = newMap($('#siteMap'));
      state.mapItems = L.layerGroup().addTo(state.map);
      addLocateButton(state.map);
      state.map.on('moveend', () => { if (state.map) state.mapView = { center: state.map.getCenter(), zoom: state.map.getZoom() }; });
      state.mapFitted = false;
    }
  }

  $('#mapStats').innerHTML = `
    <div class="stat"><b style="color:var(--ok)">${ok}</b><small>OK</small></div>
    <div class="stat"><b style="color:var(--none)">${none}</b><small>Not checked</small></div>
    <div class="stat"><b style="color:var(--bad)">${bad}</b><small>Problem</small></div>`;

  if (state.map) {
    const all = state.items.flatMap(shapeOf);
    if (!state.mapFitted) {   // first time: show the whole site (or where the user was before)
      if (state.mapView) state.map.setView(state.mapView.center, state.mapView.zoom);
      else if (all.length) state.map.fitBounds(L.latLngBounds(all).pad(0.08));
      else state.map.setView([20, 0], 2);
      state.mapFitted = true;
    }
    state.mapItems.clearLayers();
    if (all.length)   // dashed site boundary around everything
      L.rectangle(L.latLngBounds(all).pad(0.06), { color: '#ffffff', weight: 2, dashArray: '6 6', fill: false, interactive: false }).addTo(state.mapItems);
    state.items.forEach(i => drawItem(i, state.mapItems, false));
  }

  const sel = state.items.find(i => i.id === state.selected);
  $('#mapDetails').innerHTML = `
    ${sel ? `<div class="card">
      <div class="row"><div><b>${esc(sel.name)}</b><small class="hint"> ${ITEM_TYPES[sel.type]}</small></div>
        <span class="chip s${sel.status}">${STATUS[sel.status]}</span></div>
      <p class="hint">Last checked: ${fmt(sel.lastCheckedUtc)}</p>
      <div class="grid c3">
        <button class="ok" data-act="markItem" data-id="${sel.id}" data-result="1">OK</button>
        <button class="bad" data-act="markItem" data-id="${sel.id}" data-result="2">Problem</button>
        <button class="warn" data-act="reportHere" data-id="${sel.id}">Report</button>
      </div></div>` : '<p class="hint">Tap a zone, gate, fence or route on the map. 📍 shows where you are.</p>'}
    <h3>All items</h3>
    <div class="card">${state.items.map(i => `
      <div class="item" data-act="selectItem" data-id="${i.id}">
        <div>${esc(i.name)}<small>${ITEM_TYPES[i.type]}</small></div>
        <span class="chip s${i.status}">${STATUS[i.status]}</span></div>`).join('')}</div>`;
}

function renderHeatMap(el, hotspots) {
  if (state.heatMap) state.heatMap.remove();
  state.heatMap = null;
  if (typeof L === 'undefined') return;
  const all = state.items.flatMap(shapeOf);
  if (!all.length) return;
  const map = state.heatMap = newMap(el);
  map.fitBounds(L.latLngBounds(all).pad(0.08));
  const g = L.layerGroup().addTo(map);
  state.items.forEach(i => drawItem(i, g, true));
  const max = Math.max(1, ...hotspots.map(h => h.count));
  hotspots.forEach(h => {
    const pts = shapeOf(state.items.find(i => i.id === h.itemId) || {});
    if (!pts.length) return;
    L.circleMarker(L.latLngBounds(pts).getCenter(), {
      radius: 10 + 18 * h.count / max, color: '#991b1b', weight: 2, fillColor: '#dc2626', fillOpacity: 0.6
    }).bindTooltip(String(h.count), { permanent: true, direction: 'center', className: 'heatlabel' }).addTo(g);
  });
}

function renderReport() {
  const t = state.reportType;
  view.innerHTML = `
    <h2>Report</h2>
    <label class="field">Where?</label>
    <select data-change="reportPlace">${placeOptions(state.reportPlace, true)}</select>

    <label class="field" style="margin-top:14px">Photo (optional)</label>
    <label class="camera">${state.reportPhoto ? `<img src="${esc(full(state.reportPhoto))}" alt="">Photo added - tap to change` : '📷 Take a photo'}
      <input type="file" accept="image/*" capture="environment" hidden data-change="reportPhoto"></label>

    <label class="field">1. What did you see?</label>
    <div class="grid c3">
      ${REPORT_TYPES.map((n, i) => `<button class="big ${t === i ? 'sel' : ''}" data-act="pickType" data-type="${i}">${REPORT_ICONS[i]}<br><small>${n}</small></button>`).join('')}
    </div>

    <div ${t === null ? 'hidden' : ''}>
      <label class="field" style="margin-top:14px">2. How serious? (tapping sends the report)</label>
      <div class="grid c3">
        <button class="big ok" data-act="sendReport" data-sev="0" ${state.busy ? 'disabled' : ''}>Low</button>
        <button class="big warn" data-act="sendReport" data-sev="1" ${state.busy ? 'disabled' : ''}>Medium</button>
        <button class="big bad" data-act="sendReport" data-sev="2" ${state.busy ? 'disabled' : ''}>Serious</button>
      </div>
    </div>
    <p class="hint">Location and time are added automatically.</p>
    <label class="field">Comment (optional)</label>
    <textarea rows="2" maxlength="500" data-change="reportComment">${esc(state.reportComment)}</textarea>

    <h3>Reports in the last 2 days</h3>
    <div class="card">${state.reports.length ? state.reports.map(r => `
      <div class="item"><div>${REPORT_ICONS[r.type]} ${REPORT_TYPES[r.type]} - ${SEVERITY[r.severity]}
        <small>${esc(r.place || 'Unknown place')} · ${fmt(r.createdUtc)} · ${esc(r.reportedBy)}</small></div>
        ${r.photoPath ? `<img class="photo" src="${esc(full(r.photoPath))}" alt="">` : ''}</div>`).join('') : '<p class="hint">No reports yet.</p>'}</div>`;
}

function renderChecks() {
  const cutoff = Date.now() - 12 * 3600 * 1000;
  const done = state.items.filter(i => i.lastCheckedUtc && utc(i.lastCheckedUtc).getTime() > cutoff).length;
  const pct = state.items.length ? Math.round(100 * done / state.items.length) : 0;
  view.innerHTML = `
    <h2>Shift checklist</h2>
    <p class="hint">Checked in the last 12 hours: <b>${done} of ${state.items.length}</b></p>
    <div class="progress"><div style="width:${pct}%"></div></div>
    <div class="card">${state.items.map(i => `
      <div class="item" style="align-items:flex-start;flex-direction:column">
        <div class="row" style="width:100%"><div>${esc(i.name)}<small>${ITEM_TYPES[i.type]} · last: ${fmt(i.lastCheckedUtc)}</small></div>
          <span class="chip s${i.status}">${STATUS[i.status]}</span></div>
        <div class="row" style="width:100%;flex-wrap:nowrap">
          <label class="btn ghost sm">${state.checkPhotos[i.id] ? '📷 ✓' : '📷 Photo'}
            <input type="file" accept="image/*" capture="environment" hidden data-change="checkPhoto" data-id="${i.id}"></label>
          <button class="ok sm" style="flex:1" data-act="markItem" data-id="${i.id}" data-result="1">OK</button>
          <button class="bad sm" style="flex:1" data-act="markItem" data-id="${i.id}" data-result="2">Problem</button>
        </div></div>`).join('')}</div>`;
}

function renderLift() {
  const L2 = state.lift;
  const areas = state.items.filter(i => i.type === 5);
  const ready = L2.area && L2.plan && L2.zone && L2.radio && L2.weather;
  const tg = (key, text) => `<label class="toggle ${L2[key] ? 'on' : ''}"><input type="checkbox" ${L2[key] ? 'checked' : ''} data-change="liftToggle" data-key="${key}">${text}</label>`;
  view.innerHTML = `
    <h2>Lift mode</h2>
    <label class="field">Lift area</label>
    <select data-change="liftArea">
      <option value="">Choose...</option>
      ${areas.map(a => `<option value="${a.id}" ${a.id === L2.area ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}
    </select>
    <div style="margin-top:12px">
      ${tg('plan', 'Lift plan checked and valid')}
      ${tg('zone', 'Zone clear of people and vehicles')}
      ${tg('radio', 'Radio check done')}
      ${tg('weather', 'Weather OK (wind, visibility)')}
    </div>
    <label class="field">Notes (optional)</label>
    <textarea rows="2" maxlength="300" data-change="liftNotes">${esc(L2.notes)}</textarea>
    <button class="big ok" style="width:100%;margin-top:12px" data-act="startLift" ${ready ? '' : 'disabled'}>Save lift record</button>
    <h3>Recent lifts</h3>
    <div class="card">${state.lifts.length ? state.lifts.map(l => `
      <div class="item"><div>${esc(l.liftAreaName)}<small>${fmt(l.createdUtc)} · ${esc(l.operator)}${l.notes ? ' · ' + esc(l.notes) : ''}</small></div>
        <span class="chip s1">Saved</span></div>`).join('') : '<p class="hint">No lifts saved yet.</p>'}</div>`;
}

function renderDocs() {
  view.innerHTML = `
    <h2>Plans and permits</h2>
    <div class="card">${state.docs.map(d => `
      <div class="item"><div><b>${esc(d.title)}</b>
        <small>${DOC_TYPES[d.type]} · expires ${fmt(d.expiresUtc)}</small></div>
        <div style="text-align:right">
          <span class="chip ${d.state === 'ok' ? 'okc' : d.state}">${d.state === 'expired' ? 'Expired' : d.daysLeft + ' days left'}</span><br>
          <a class="btn sm" style="display:inline-block;margin-top:6px;text-decoration:none" href="${esc(full(d.fileUrl))}" target="_blank" rel="noopener">Open</a>
        </div></div>`).join('') || '<p class="hint">No documents yet.</p>'}</div>
    <details class="card"><summary><b>Add a plan or permit</b></summary>
      <label class="field">Title</label><input id="docTitle" maxlength="100">
      <label class="field">Type</label>
      <select id="docType">${DOC_TYPES.map((n, i) => `<option value="${i}">${n}</option>`).join('')}</select>
      <label class="field">Link (for example /docs/permit.pdf or https://...)</label><input id="docUrl" placeholder="https://">
      <label class="field">Expires on</label><input id="docExpiry" type="date">
      <button style="width:100%;margin-top:12px" data-act="addDoc">Save</button></details>
    <p class="hint">Documents that expire within 7 days send an alert to everyone with the app open.</p>`;
}

// ---------- vehicle inspections ----------
function renderVehicles() {
  const vs = state.vehicles || [];
  const e = state.email;
  const count = s => vs.filter(v => v.state === s).length;
  let note = '';
  if (e && !e.ready)
    note = `<div class="card warnbox">📧 Email is not set up yet, so HSE emails are saved on the server in the <code>mail-outbox</code> folder.
      Fill in the <code>Email</code> settings in <code>appsettings.json</code> (see README).</div>`;
  else if (e && !e.hseTo)
    note = `<div class="card warnbox">📧 Email is set up, but there is no HSE address. Set <code>Email:HseTo</code> in <code>appsettings.json</code>.</div>`;
  else if (e)
    note = `<div class="card note">📧 HSE (<b>${esc(e.hseTo)}</b>) gets an email ${e.warnDaysBefore} days before an inspection ends, and again when it has ended.</div>`;

  view.innerHTML = `
    <h2>Vehicle inspections</h2>
    <div class="stats">
      <div class="stat"><b style="color:var(--ok)">${count('ok')}</b><small>Valid</small></div>
      <div class="stat"><b style="color:var(--warn)">${count('soon')}</b><small>Ending soon</small></div>
      <div class="stat"><b style="color:var(--bad)">${count('expired')}</b><small>Expired</small></div>
    </div>
    ${note}
    ${vs.map(vehicleCard).join('') || '<p class="hint">No vehicles yet. Add the first one below.</p>'}
    <details class="card" id="addVehicle"><summary><b>Add a vehicle</b></summary>
      <label class="field">Name</label><input id="vName" maxlength="80" placeholder="For example Excavator CAT 320">
      <label class="field">Registration or fleet number</label><input id="vReg" maxlength="30">
      <label class="field">Type</label>
      <select id="vType">${VEHICLE_TYPES.map((n, i) => `<option value="${i}">${n}</option>`).join('')}</select>
      <label class="field">Last inspection (optional)</label><input id="vLast" type="date" max="${isoDay(new Date())}" data-change="vLast">
      <label class="field">Inspection valid until</label><input id="vUntil" type="date">
      <label class="field">Notes (optional)</label><input id="vNotes" maxlength="300">
      <button style="width:100%;margin-top:12px" data-act="addVehicle">Save vehicle</button></details>
    <button class="ghost" style="width:100%" data-act="emailHse" ${vs.length ? '' : 'disabled'}>📧 Email HSE the inspection status now</button>`;
}

function vehicleCard(v) {
  const chip = v.state === 'expired' ? 'expired' : v.state === 'soon' ? 'soon' : 'okc';
  const history = v.history || [];
  return `<div class="card vehicle ${v.state}">
    <div class="row"><div><b>${esc(v.name)}</b><small class="hint"> ${esc(v.regNumber)}${v.regNumber ? ' · ' : ''}${VEHICLE_TYPES[v.type] || ''}</small></div>
      <span class="chip ${chip}">${daysLeftText(v.daysLeft)}</span></div>
    <p class="hint tight">Inspection valid until <b>${day(v.validUntil)}</b>${v.lastInspected ? ` · last inspected ${day(v.lastInspected)}` : ''}</p>
    ${v.state === 'expired' ? '<p class="danger">⛔ Inspection expired: do not use until it has been inspected.</p>' : ''}
    ${v.hseNotifiedUtc && v.hseNoticeLevel > 0 ? `<p class="hint tight">📧 HSE notified (${HSE_NOTICE[v.hseNoticeLevel]}): ${fmt(v.hseNotifiedUtc)}</p>` : ''}
    ${state.renewing === v.id ? renewForm(v) : `<button class="ok sm" style="margin-top:8px" data-act="renewOpen" data-id="${v.id}">✔ Record new inspection</button>`}
    <details class="more"><summary>History (${history.length})</summary>
      ${history.map(h => `<div class="item"><div>${day(h.inspectedOn)} → valid until ${day(h.validUntil)}
        <small>${esc([h.inspector, h.notes, h.recordedBy ? 'saved by ' + h.recordedBy : ''].filter(Boolean).join(' · '))}</small></div></div>`).join('') || '<p class="hint">No inspections saved yet.</p>'}
      ${v.notes ? `<p class="hint">Notes: ${esc(v.notes)}</p>` : ''}
      <button class="ghost sm" data-act="removeVehicle" data-id="${v.id}">Remove vehicle</button>
    </details>
  </div>`;
}

function renewForm(v) {
  const today = new Date();
  return `<div class="renew">
    <label class="field">Inspected on</label><input type="date" id="rnOn" value="${isoDay(today)}" max="${isoDay(today)}">
    <label class="field">New inspection valid until</label><input type="date" id="rnUntil" value="${isoDay(addMonths(today, 12))}">
    <label class="field">Inspected by (optional)</label><input id="rnBy" maxlength="60" placeholder="Inspection company or person">
    <label class="field">Notes (optional)</label><input id="rnNotes" maxlength="300">
    <div class="grid c2" style="margin-top:10px">
      <button class="ghost" data-act="renewCancel">Cancel</button>
      <button class="ok" data-act="renewSave" data-id="${v.id}">Save inspection</button>
    </div></div>`;
}

function renderMachine() {
  const radioBtn = (text, cls) => `<button class="big ${cls}" data-act="radio" data-text="${text}">${text}</button>`;
  view.innerHTML = `
    <h2>Machine guidance</h2>
    <h3>Radio messages (one tap)</h3>
    <div class="grid">${radioBtn('Stop', 'bad')}${radioBtn('Area clear', 'ok')}${radioBtn('Reversing', 'warn')}</div>
    <h3>Hand signals</h3>
    <div class="grid c2">${SIGNALS.map(s => `<div class="signal">
      <img src="${esc(full('/signals/' + s.toLowerCase().replace(/ /g, '-') + '.png'))}" alt="" onerror="this.outerHTML='<div class=&quot;ph&quot;>✋</div>'">${s}</div>`).join('')}</div>
    <p class="hint">Put your company's approved signal pictures in <code>wwwroot/signals</code> (for example <code>stop.png</code>, <code>emergency-stop.png</code>). They appear here automatically.</p>
    <h3>Recent messages</h3>
    <div class="card">${state.radio.length ? state.radio.map(r => `
      <div class="item"><div><b>${esc(r.text)}</b><small>${esc(r.sentBy)} · ${fmt(r.sentUtc)}</small></div></div>`).join('') : '<p class="hint">No messages yet.</p>'}</div>`;
}

function renderClean() {
  const slot = (t, kind) => {
    const p = kind === 'before' ? t.beforePhotoPath : t.afterPhotoPath;
    return `<label class="slot">${p ? `<img src="${esc(full(p))}" alt="">` : '📷'}<small>${kind === 'before' ? 'Before' : 'After'}</small>
      <input type="file" accept="image/*" capture="environment" hidden data-change="cleanPhoto" data-id="${t.id}" data-kind="${kind}"></label>`;
  };
  view.innerHTML = `
    <h2>Cleaning tasks</h2>
    ${state.cleaning.map(t => `<div class="card">
      <div class="row"><div><b>${esc(t.description)}</b><small class="hint"> ${esc(t.area || '')}</small></div>
        <span class="chip ${t.done ? 's1' : 's0'}">${t.done ? 'Done' : 'To do'}</span></div>
      <div class="slots">${slot(t, 'before')}${slot(t, 'after')}</div>
      <p class="hint">Adding the "after" photo completes the task.</p></div>`).join('') || '<p class="hint">No tasks.</p>'}
    <details class="card"><summary><b>Add a task</b></summary>
      <label class="field">What needs cleaning?</label><input id="cleanDesc" maxlength="200">
      <label class="field">Area (optional)</label><input id="cleanArea" maxlength="60">
      <button style="width:100%;margin-top:12px" data-act="addClean">Add task</button></details>`;
}

function renderSummary() {
  const s = state.summary;
  if (!s) { view.innerHTML = '<p>No data.</p>'; return; }
  const vehicles = s.vehicleInspections || [];
  view.innerHTML = `
    <div class="row"><h2>Weekly summary</h2><button class="ghost sm noprint" data-act="print">Print</button></div>
    <p class="hint">${fmt(s.fromUtc)} - ${fmt(s.toUtc)}</p>
    <div class="stats">
      <div class="stat"><b>${s.total}</b><small>Reports</small></div>
      <div class="stat"><b style="color:var(--bad)">${s.serious}</b><small>Serious</small></div>
      <div class="stat"><b>${s.checks}</b><small>Checks</small></div>
      <div class="stat"><b>${s.lifts}</b><small>Lifts</small></div>
    </div>
    <div class="card">⚠️ Hazards: <b>${s.hazards}</b> &nbsp; 😮‍💨 Near misses: <b>${s.nearMisses}</b> &nbsp; 🚫 Unsafe behaviour: <b>${s.unsafeBehaviour}</b></div>
    <h3>Heat map of risky spots</h3>
    ${s.hotspots.length ? '<div id="heatMap" class="map heat"></div>' : '<p class="hint">No reports linked to a place this week.</p>'}
    <div class="card">${s.hotspots.map(h => `<div class="item"><div>${esc(h.name)}</div><div><b>${h.count}</b> reports${h.serious ? ` · <span style="color:var(--bad)">${h.serious} serious</span>` : ''}</div></div>`).join('')}</div>
    <h3>Not checked in the last 24 hours</h3>
    <div class="card">${s.notCheckedToday.length ? s.notCheckedToday.map(n => `<div class="item">${esc(n)}</div>`).join('') : '<p class="hint">Everything was checked.</p>'}</div>
    <h3>Permits and plans expiring within 14 days</h3>
    <div class="card">${s.expiringDocuments.length ? s.expiringDocuments.map(d => `<div class="item"><div>${esc(d.title)}<small>${fmt(d.expiresUtc)}</small></div><span class="chip ${d.expired ? 'expired' : 'soon'}">${d.expired ? 'Expired' : 'Expiring'}</span></div>`).join('') : '<p class="hint">None.</p>'}</div>
    <h3>Vehicle inspections ending within ${s.warnDays ?? 14} days</h3>
    <div class="card">${vehicles.length ? vehicles.map(v => `<div class="item"><div>${esc(v.name)}<small>${esc(v.regNumber)} · valid until ${day(v.validUntil)}</small></div><span class="chip ${v.daysLeft < 0 ? 'expired' : 'soon'}">${daysLeftText(v.daysLeft)}</span></div>`).join('') : '<p class="hint">None.</p>'}</div>`;
  if (s.hotspots.length) renderHeatMap($('#heatMap'), s.hotspots);
}

// ---------- connect screen (iOS / Android app only) ----------
function renderConnect(message) {
  $('#nav').hidden = true;
  view.innerHTML = `
    <h2>Connect to SiteGuard</h2>
    <div class="card">
      <label class="field" for="serverUrl">Server address</label>
      <input id="serverUrl" type="url" inputmode="url" autocapitalize="off" autocorrect="off" spellcheck="false"
        placeholder="https://siteguard.yourcompany.com" value="${esc(SERVER)}">
      <p class="hint">Ask your site manager for the address. To test with the server on your PC, use the PC's address
        on the same Wi-Fi, for example <code>http://192.168.1.20:5000</code>.</p>
      ${message ? `<p class="danger">${esc(message)}</p>` : ''}
      <button class="big" style="width:100%;margin-top:6px" data-act="connect">Connect</button>
      ${SERVER ? '<button class="ghost" style="width:100%;margin-top:8px" data-act="cancelConnect">Cancel</button>' : ''}
    </div>`;
}

// ---------- actions (clicks) ----------
async function postCheck(id, result) {
  await post('/api/checks', { siteItemId: id, result, photoPath: state.checkPhotos[id] || null, checkedBy: who() });
  delete state.checkPhotos[id];
  toast(result === 1 ? 'Marked OK' : 'Problem recorded');
  await refresh();
}

const actions = {
  tab: el => go(el.dataset.tab),
  selectItem: el => selectItem(el.dataset.id, true),
  markItem: el => postCheck(el.dataset.id, +el.dataset.result),
  reportHere: el => { state.reportPlace = el.dataset.id; return go('report'); },
  pickType: el => { state.reportType = +el.dataset.type; renderReport(); },
  async sendReport(el) {
    if (state.busy || state.reportType === null) return;
    const comment = $('textarea[data-change="reportComment"]')?.value || state.reportComment;
    state.busy = true; renderReport();
    try {
      const pos = await getPosition();
      await post('/api/reports', {
        type: state.reportType, severity: +el.dataset.sev, siteItemId: state.reportPlace || null,
        latitude: pos?.lat ?? null, longitude: pos?.lon ?? null,
        photoPath: state.reportPhoto, comment: comment || null, reportedBy: who()
      });
      state.reportType = null; state.reportPhoto = null; state.reportComment = '';
      toast('Report sent. Thank you!');
    } catch (err) {
      state.busy = false; renderReport();   // let the person try again
      throw err;
    }
    state.busy = false;
    await go('report');
  },
  async startLift() {
    const L2 = state.lift;
    await post('/api/lifts', { liftAreaId: L2.area, planConfirmed: L2.plan, zoneClear: L2.zone, radioCheckDone: L2.radio, weatherOk: L2.weather, notes: L2.notes, operator: who() });
    state.lift = { area: L2.area, plan: false, zone: false, radio: false, weather: false, notes: '' };
    toast('Lift record saved');
    await go('lift');
  },
  async addDoc() {
    const title = $('#docTitle').value.trim(), url = $('#docUrl').value.trim(), date = $('#docExpiry').value;
    if (!title || !url || !date) return toast('Fill in title, link and expiry date', true);
    await post('/api/documents', { title, type: +$('#docType').value, fileUrl: url, expiresUtc: date + 'T23:59:00Z' });
    toast('Saved');
    await go('docs');
  },
  async addVehicle(el) {
    const name = $('#vName').value.trim(), validUntil = $('#vUntil').value;
    if (!name || !validUntil) return toast('Fill in the name and the date the inspection is valid until', true);
    el.disabled = true;
    try {
      await post('/api/vehicles', {
        name, regNumber: $('#vReg').value.trim(), type: +$('#vType').value,
        lastInspected: $('#vLast').value || null, validUntil, notes: $('#vNotes').value.trim() || null, addedBy: who()
      });
    } finally { el.disabled = false; }
    toast('Vehicle saved');
    await go('vehicles');
    // The server checks the new vehicle at once; show "HSE told" when it has emailed
    setTimeout(() => { if (state.tab === 'vehicles' && !state.renewing && !$('#addVehicle')?.open) refresh(); }, 2500);
  },
  renewOpen: el => { state.renewing = el.dataset.id; renderVehicles(); },
  renewCancel: () => { state.renewing = null; renderVehicles(); },
  async renewSave(el) {
    const inspectedOn = $('#rnOn').value, validUntil = $('#rnUntil').value;
    if (!inspectedOn || !validUntil) return toast('Fill in both dates', true);
    await post(`/api/vehicles/${el.dataset.id}/inspections`, {
      inspectedOn, validUntil, inspector: $('#rnBy').value.trim() || null, notes: $('#rnNotes').value.trim() || null, recordedBy: who()
    });
    state.renewing = null;
    toast('Inspection saved. HSE reminders start again from the new date.');
    await go('vehicles');
  },
  async removeVehicle(el) {
    if (el.dataset.armed !== '1') {   // first tap asks, second tap removes
      el.dataset.armed = '1';
      el.textContent = 'Tap again to remove it and its history';
      el.classList.replace('ghost', 'bad');
      setTimeout(() => {
        if (!el.isConnected) return;
        el.dataset.armed = '';
        el.textContent = 'Remove vehicle';
        el.classList.replace('bad', 'ghost');
      }, 4000);
      return;
    }
    await api('/api/vehicles/' + el.dataset.id, { method: 'DELETE' });
    toast('Vehicle removed');
    await go('vehicles');
  },
  async emailHse(el) {
    el.disabled = true;
    try {
      const r = await post('/api/vehicles/email-hse', {});
      toast(r.message || (r.sent ? `Email sent to ${r.to}` : 'Email is not set up yet: the email was saved in the mail-outbox folder on the server'));
    } finally { el.disabled = false; }
  },
  async radio(el) {
    await post('/api/radio', { text: el.dataset.text, sentBy: who() });
    toast('Sent: ' + el.dataset.text);
    state.radio = await api('/api/radio'); renderMachine();
  },
  async addClean() {
    const description = $('#cleanDesc').value.trim();
    if (!description) return toast('Describe the task', true);
    await post('/api/cleaning', { description, area: $('#cleanArea').value.trim() || null });
    await go('clean');
  },
  print: () => window.print(),
  changeServer: () => renderConnect(),
  cancelConnect: () => go(state.tab),
  async connect(el) {
    let url = ($('#serverUrl').value || '').trim().replace(/\/+$/, '');
    if (!url) return toast('Type the server address', true);
    if (!/^https?:\/\//i.test(url)) url = 'http://' + url;
    el.disabled = true; el.textContent = 'Connecting...';
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const r = await fetch(url + '/api/items', { signal: ctrl.signal, cache: 'no-store' });
      if (!r.ok) throw new Error('the server answered ' + r.status);
      await r.json();
    } catch (e) {
      return renderConnect(`Could not reach ${url} (${e.name === 'AbortError' ? 'no answer' : e.message}). Check the address and that the phone can reach the server.`);
    } finally { clearTimeout(timer); }
    try { localStorage.setItem('sg-server', url); } catch { }
    location.reload();
  }
};

// ---------- changes (inputs, file pickers) ----------
const changes = {
  reportPlace: el => { state.reportPlace = el.value; },
  reportComment: el => { state.reportComment = el.value; },
  async reportPhoto(el) {
    if (!el.files[0]) return;
    toast('Uploading photo...');
    state.reportPhoto = await uploadPhoto(el.files[0]);
    renderReport();
  },
  async checkPhoto(el) {
    if (!el.files[0]) return;
    toast('Uploading photo...');
    state.checkPhotos[el.dataset.id] = await uploadPhoto(el.files[0]);
    toast('Photo added. Now tap OK or Problem.');
    renderChecks();
  },
  liftArea: el => { state.lift.area = el.value; renderLift(); },
  liftToggle: el => { state.lift[el.dataset.key] = el.checked; renderLift(); },
  liftNotes: el => { state.lift.notes = el.value; },
  // Picking the last inspection fills in "valid until" one year later
  vLast: el => {
    const until = $('#vUntil');
    if (el.value && !until.value) until.value = isoDay(addMonths(parseDay(el.value), 12));
  },
  async cleanPhoto(el) {
    if (!el.files[0]) return;
    toast('Uploading photo...');
    const url = await uploadPhoto(el.files[0]);
    const body = el.dataset.kind === 'before' ? { beforePhotoPath: url } : { afterPhotoPath: url };
    await api('/api/cleaning/' + el.dataset.id, { method: 'PUT', headers: JSON_HDR, body: JSON.stringify(body) });
    toast(el.dataset.kind === 'after' ? 'Task completed' : 'Photo saved');
    await go('clean');
  }
};

document.addEventListener('click', async e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  try { await actions[el.dataset.act]?.(el); }
  catch (err) { toast(err.message || 'Something went wrong', true); }
});
document.addEventListener('change', async e => {
  const el = e.target.closest('[data-change]');
  if (!el) return;
  try { await changes[el.dataset.change]?.(el); }
  catch (err) { toast(err.message || 'Something went wrong', true); }
});

// ---------- live alerts ----------
function connectHub() {
  if (typeof signalR === 'undefined') return;   // offline: app still works, alerts do not
  const c = new signalR.HubConnectionBuilder()
    .withUrl(SERVER + '/alerts', { withCredentials: false })
    .withAutomaticReconnect().build();
  c.on('SeriousReport', r => {
    showAlert(`SERIOUS ${REPORT_TYPES[r.type].toLowerCase()}${r.place ? ' at ' + r.place : ''} - reported by ${r.reportedBy}`, 'danger');
    if (['map', 'checks', 'report'].includes(state.tab)) refresh();
  });
  c.on('DocumentExpiring', (title, when) => showAlert(`Expiring soon: ${title} (${fmt(when)})`, 'warn'));
  c.on('VehicleInspection', m => {
    showAlert(m.text, m.expired ? 'danger' : 'warn');
    if (state.tab === 'vehicles' && !state.renewing && !$('#addVehicle')?.open) refresh();
  });
  c.on('Radio', m => {
    if (m.sentBy !== who()) showAlert(`Radio: ${m.text} (${m.sentBy})`, m.text === 'Stop' ? 'danger' : 'info');
    if (state.tab === 'machine') refresh();
  });
  c.start().catch(() => { });
}

// ---------- start ----------
try { $('#who').value = localStorage.getItem('sg-name') || ''; } catch { }
$('#who').addEventListener('change', () => { try { localStorage.setItem('sg-name', $('#who').value); } catch { } });
if (NATIVE) $('#serverBtn').hidden = false;

if (NATIVE && !SERVER) {
  renderConnect();
} else {
  connectHub();
  const first = location.hash.slice(1);
  go(views[first] ? first : 'map');   // e.g. the link in the HSE email opens #vehicles
  setInterval(() => { if (['map', 'checks'].includes(state.tab) && !document.hidden) refresh(); }, 30000);
  window.addEventListener('hashchange', () => {
    const t = location.hash.slice(1);
    if (views[t] && t !== state.tab) go(t);
  });
}
