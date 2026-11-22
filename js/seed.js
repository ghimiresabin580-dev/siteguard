// Sample site used by the online demo: Malmi Airfield in Helsinki.
// Every date is relative to the day the data is created, so the demo always looks current.

import { CONFIG } from './config.js';
import { today, addDays, at, minutesAgo, seededRandom, weekStart } from './util.js';
import { TR_AREAS, PERMIT_TYPES } from './domain.js';

// Password for every demo account is CONFIG.demoPassword (PBKDF2-SHA256, 120 000 rounds)
const PW = {
  sabin: ['7733b129e88b84f56c49859af276971b', 'f424bc9349a3d29d56c4efc0e6229cc95ced6ce4a2d3fc57e01bbbb6aecd7119'],
  laura: ['b7c7f89b2eeb69bf19dec35f1ed838f0', 'c85932523b498dcdf620438396db9ee50176176d9277f2f7bfffe59a233732e6'],
  aino: ['446c324b61e12df3f0ed2a1eb8870210', 'f3bfd2d4a2da451dd8c0591216359ee90c21138429d74c89daf438d6089e3477'],
  mikko: ['b1e9f324f4c1cd71ff530a99e1ecf5e3', '86e0560464697793ccec32a416993c1c8dab0c4ad94b801e69e1cb006d3b3c2c'],
  juha: ['eb174a60ab9e597c09e5ca416ade05a6', '28cfadcfa06a2ce6e39311992b63d7b3dfb7addfa104d71a20fc163364c0b3aa'],
  piotr: ['30bd4a148211e3f6d28fe168f7d843be', 'a444b14c0fee315bcb3cc149cebbd2f8bca636170d19bea1b1053f726eb0ee2e'],
  andres: ['a0afa70c55c3d67baf5d58a1cb139546', 'ab1b87f7588c49f45076767f2a6fa2aa6ec47ffba541fa6ac80c6418b9fc8bf5']
};

// Site grid: 1 unit = 2.6 m, origin at the north-west corner of the site
const { lat: LAT, lon: LON } = CONFIG.site;
const P = (x, y) => {
  const n = (32 - y) * 2.6, e = (x - 50) * 2.6;
  return [+(LAT + n / 111320).toFixed(7), +(LON + e / (111320 * Math.cos(LAT * Math.PI / 180))).toFixed(7)];
};
const area = (x, y, w, h) => [P(x, y), P(x + w, y), P(x + w, y + h), P(x, y + h)];

export function buildSeed() {
  const T = today();
  const d = n => addDays(T, n);
  const rnd = seededRandom(4521);

  const user = (key, id, name, email, role, title, companyId, phone, extra = {}) => ({
    id, name, email, role, title, companyId, phone,
    salt: PW[key][0], pwHash: PW[key][1], iterations: 120000,
    status: 'active', createdAt: minutesAgo(60 * 24 * 40), lastLoginAt: null,
    failed: 0, lockedUntil: null, mustChangePassword: false, sessionVersion: 1, ...extra
  });

  const users = [
    user('sabin', 'u-sabin', 'Sabin Ghimire', 'sabin.ghimire@siteguard.demo', 'admin', 'Site administrator', 'c-main', '+358 40 712 4401'),
    user('laura', 'u-laura', 'Laura Korhonen', 'laura.korhonen@siteguard.demo', 'manager', 'Site manager', 'c-main', '+358 40 712 4402'),
    user('aino', 'u-aino', 'Aino Virtanen', 'aino.virtanen@siteguard.demo', 'hse', 'HSE coordinator', 'c-main', '+358 40 712 4403'),
    user('juha', 'u-juha', 'Juha Mäkinen', 'juha.makinen@siteguard.demo', 'manager', 'Site engineer', 'c-main', '+358 40 712 4404'),
    user('mikko', 'u-mikko', 'Mikko Laine', 'mikko.laine@siteguard.demo', 'supervisor', 'Groundworks supervisor', 'c-routa', '+358 50 318 2290'),
    user('piotr', 'u-piotr', 'Piotr Nowak', 'piotr.nowak@siteguard.demo', 'worker', 'Steel erector', 'c-halla', '+358 45 207 8813'),
    user('andres', 'u-andres', 'Andres Tamm', 'andres.tamm@siteguard.demo', 'worker', 'Electrician', 'c-kide', '+358 44 950 6127',
      { status: 'pending', createdAt: minutesAgo(95), note: 'Starting on the temporary power works this week.' })
  ];

  const contractors = [
    { id: 'c-main', name: 'Kivi Rakennus Oy', short: 'KR', trade: 'Main contractor', color: '#1d3b5a', contact: 'Laura Korhonen', phone: '+358 40 712 4402', email: 'laura.korhonen@siteguard.demo' },
    { id: 'c-routa', name: 'Routa Groundworks Oy', short: 'RG', trade: 'Groundworks and drainage', color: '#8a5a2b', contact: 'Mikko Laine', phone: '+358 50 318 2290', email: 'mikko.laine@siteguard.demo' },
    { id: 'c-halla', name: 'Halla Steel Frames Oy', short: 'HS', trade: 'Steel erection', color: '#4f6d8f', contact: 'Rasmus Ek', phone: '+358 40 661 0934', email: 'rasmus.ek@siteguard.demo' },
    { id: 'c-nosto', name: 'Nosto Cranes Oy', short: 'NC', trade: 'Cranes and lifting', color: '#b23a2e', contact: 'Pekka Nieminen', phone: '+358 50 447 1180', email: 'pekka.nieminen@siteguard.demo' },
    { id: 'c-kide', name: 'Kide Electrical Oy', short: 'KE', trade: 'Electrical', color: '#a77d00', contact: 'Elina Järvinen', phone: '+358 44 950 6120', email: 'elina.jarvinen@siteguard.demo' },
    { id: 'c-virta', name: 'Virta HVAC Oy', short: 'VH', trade: 'Plumbing and ventilation', color: '#1f7a80', contact: 'Oskari Mäkelä', phone: '+358 40 288 5172', email: 'oskari.makela@siteguard.demo' },
    { id: 'c-puhdas', name: 'Puhdas Site Services Oy', short: 'PS', trade: 'Cleaning and waste', color: '#457a3b', contact: 'Sanna Lindqvist', phone: '+358 45 130 7745', email: 'sanna.lindqvist@siteguard.demo' }
  ];

  // Workforce register. Cards: Työturvallisuuskortti (5 y), tulityökortti (5 y), first aid EA1 (3 y)
  const person = (id, name, contractorId, trade, o = {}) => ({
    id, name, contractorId, trade, phone: o.phone || '',
    taxNo: o.taxNo || String(100000000000 + Math.floor(rnd() * 899999999999)),
    inductedOn: o.inducted === null ? null : d(o.inducted ?? -Math.floor(10 + rnd() * 60)),
    safetyCard: d(o.safety ?? Math.floor(200 + rnd() * 1300)),
    hotWorkCard: o.hot === undefined ? null : d(o.hot),
    firstAid: o.aid === undefined ? null : d(o.aid),
    electrical: o.sfs === undefined ? null : d(o.sfs),
    userId: o.userId || null, notes: o.notes || '', cardNotice: {}
  });
  const people = [
    person('p-laura', 'Laura Korhonen', 'c-main', 'Site manager', { aid: 540, userId: 'u-laura', phone: '+358 40 712 4402' }),
    person('p-aino', 'Aino Virtanen', 'c-main', 'HSE coordinator', { aid: 300, hot: 900, userId: 'u-aino', phone: '+358 40 712 4403' }),
    person('p-juha', 'Juha Mäkinen', 'c-main', 'Site engineer', { userId: 'u-juha', phone: '+358 40 712 4404' }),
    person('p-sabin', 'Sabin Ghimire', 'c-main', 'Site administrator', { userId: 'u-sabin', aid: 980, phone: '+358 40 712 4401' }),
    person('p-tero', 'Tero Salonen', 'c-main', 'Carpenter foreman', { aid: 22, phone: '+358 40 712 4410' }),
    person('p-mikko', 'Mikko Laine', 'c-routa', 'Supervisor', { aid: 410, userId: 'u-mikko', phone: '+358 50 318 2290' }),
    person('p-janne', 'Janne Heikkinen', 'c-routa', 'Excavator operator'),
    person('p-ville', 'Ville Rantanen', 'c-routa', 'Groundworker'),
    person('p-marek', 'Marek Kowalski', 'c-routa', 'Groundworker', { safety: 11 }),
    person('p-rasmus', 'Rasmus Ek', 'c-halla', 'Supervisor', { aid: 630, phone: '+358 40 661 0934' }),
    person('p-piotr', 'Piotr Nowak', 'c-halla', 'Steel erector', { userId: 'u-piotr', phone: '+358 45 207 8813' }),
    person('p-tomasz', 'Tomasz Wiśniewski', 'c-halla', 'Steel erector'),
    person('p-kalle', 'Kalle Lehtonen', 'c-halla', 'Welder', { hot: 9 }),
    person('p-pekka', 'Pekka Nieminen', 'c-nosto', 'Tower crane operator', { phone: '+358 50 447 1180' }),
    person('p-sami', 'Sami Koskinen', 'c-nosto', 'Slinger signaller'),
    person('p-elina', 'Elina Järvinen', 'c-kide', 'Electrician', { sfs: 700, phone: '+358 44 950 6120' }),
    person('p-andres', 'Andres Tamm', 'c-kide', 'Electrician', { sfs: 1200, inducted: null, userId: 'u-andres' }),
    person('p-oskari', 'Oskari Mäkelä', 'c-virta', 'Plumber', { phone: '+358 40 288 5172' }),
    person('p-jari', 'Jari Hämäläinen', 'c-virta', 'Ventilation fitter', { safety: -6 }),
    person('p-sanna', 'Sanna Lindqvist', 'c-puhdas', 'Site cleaner', { phone: '+358 45 130 7745' }),
    person('p-bishnu', 'Bishnu Thapa', 'c-puhdas', 'Site cleaner', { inducted: -1 })
  ];

  // the sample cards that are already ending were reported before, so no email goes out on first load
  const level = date => { const left = Math.round((Date.parse(date) - Date.parse(T)) / 864e5); return left < 0 ? 2 : left <= CONFIG.warnDays ? 1 : 0; };
  people.forEach(p => ['safetyCard', 'hotWorkCard', 'firstAid', 'electrical'].forEach(k => { if (p[k]) p.cardNotice[k] = level(p[k]); }));

  const onSiteToday = ['p-laura', 'p-aino', 'p-juha', 'p-tero', 'p-mikko', 'p-janne', 'p-ville', 'p-marek', 'p-rasmus', 'p-piotr',
    'p-tomasz', 'p-kalle', 'p-pekka', 'p-sami', 'p-elina', 'p-sanna', 'p-bishnu'];
  const attendance = onSiteToday.map((pid, k) => ({
    id: 'a-' + pid, personId: pid, day: T,
    inAt: at(T, `06:${String(28 + (k * 7) % 31).padStart(2, '0')}`), outAt: null
  }));

  // ---------- map ----------
  const item = (id, name, type, shape, status = 0, checkedMinsAgo = null) =>
    ({ id, name, type, shape, status, lastCheckedAt: checkedMinsAgo == null ? null : minutesAgo(checkedMinsAgo), lastCheckedBy: checkedMinsAgo == null ? null : 'Aino Virtanen' });
  const items = [
    item('z-blockA', 'Block A', 0, area(6, 7, 30, 17), 1, 95),
    item('z-blockB', 'Block B', 0, area(40, 7, 26, 17), 1, 80),
    item('z-blockC', 'Block C excavation', 0, area(70, 7, 24, 17), 2, 70),
    item('z-laydown', 'Laydown yard', 0, area(12, 34, 24, 12)),
    item('z-cabins', 'Site cabins', 0, area(70, 49, 22, 8), 1, 140),
    item('f-north', 'North fence', 2, [P(3, 3.5), P(97, 3.5)], 1, 120),
    item('f-crane', 'Crane barrier', 2, [P(38, 32), P(63.5, 32), P(63.5, 48)], 1, 65),
    item('r-route', 'Vehicle route', 4, [P(8, 28), P(66.5, 28), P(66.5, 60.5)], 1, 60),
    item('w-west', 'Walkway west', 3, [P(3.5, 8), P(3.5, 55)]),
    item('w-south', 'Walkway south', 3, [P(3.5, 55), P(62, 55)], 2, 50),
    item('l-crane', 'Crane lift area', 5, area(40, 34, 22, 13), 1, 45),
    item('l-storage', 'Storage lift area', 5, area(70, 34, 22, 12)),
    item('g-main', 'Main gate', 1, [P(66.5, 61.5)], 1, 30),
    item('g-side', 'Side gate', 1, [P(97, 16)])
  ];

  const exclusionZones = [
    { id: 'ez-1', name: 'Excavation edge, Block C', reason: 'Open excavation 3.2 m deep on the east side. Entry only with the groundworks supervisor.',
      shape: area(85, 5.5, 11, 20), from: d(-3), to: d(4), createdBy: 'Aino Virtanen', createdAt: minutesAgo(60 * 24 * 3) },
    { id: 'ez-2', name: 'Steel erection drop zone', reason: 'Steel erection at level 2. Steel crew only while lifts are running.',
      shape: area(39, 5.5, 28, 9), from: d(-1), to: d(6), createdBy: 'Laura Korhonen', createdAt: minutesAgo(60 * 24) }
  ];

  // ---------- look-ahead ----------
  const act = (ref, title, contractorId, zoneId, start, end, hazards, status, crew) =>
    ({ id: 'act-' + ref, ref, title, contractorId, zoneId, start: d(start), end: d(end), hazards, status, crew, notes: '' });
  const activities = [
    act('ACT-2040', 'Traffic barrier at the side gate', 'c-routa', 'g-side', -7, -3, ['traffic', 'plant'], 'done', 2),
    act('ACT-2041', 'Excavation and shoring, Block C', 'c-routa', 'z-blockC', -3, 4, ['excavation', 'plant', 'services'], 'active', 4),
    act('ACT-2042', 'Steel frame erection, level 2', 'c-halla', 'z-blockB', -1, 6, ['height', 'lifting'], 'active', 5),
    act('ACT-2043', 'Tower crane lifts for steel and formwork', 'c-nosto', 'l-crane', -1, 6, ['lifting'], 'active', 2),
    act('ACT-2044', 'Temporary power to cabins and Block A', 'c-kide', 'z-cabins', 0, 1, ['electrical'], 'active', 2),
    act('ACT-2045', 'Site water monitoring', 'c-routa', 'z-blockC', -12, 20, ['environment'], 'active', 1),
    act('ACT-2046', 'Waste sorting and gritting walkways', 'c-puhdas', 'z-laydown', -12, 20, ['housekeeping', 'ice'], 'active', 2),
    act('ACT-2047', 'Underfloor drainage, Block A', 'c-virta', 'z-blockA', 1, 5, ['excavation', 'manual'], 'planned', 3),
    act('ACT-2048', 'Welding of steel connections, gridline 4', 'c-halla', 'z-blockB', 2, 5, ['hotwork', 'height'], 'planned', 2),
    act('ACT-2049', 'Concrete pour, Block A ground slab', 'c-main', 'z-blockA', 6, 6, ['plant', 'manual', 'traffic'], 'planned', 8),
    act('ACT-2050', 'Cable trench to the main gate', 'c-kide', 'r-route', 7, 9, ['excavation', 'services', 'traffic'], 'planned', 3),
    act('ACT-2051', 'Ventilation ducts, Block A level 1', 'c-virta', 'z-blockA', 8, 12, ['height', 'manual'], 'planned', 3),
    act('ACT-2052', 'Scaffold erection, Block A east side', 'c-main', 'z-blockA', 9, 11, ['height'], 'planned', 4)
  ];

  // ---------- SPA: safe plan of action ----------
  const sig = (pid, mins) => ({ id: 'sg-' + pid + mins, personId: pid, name: people.find(p => p.id === pid).name, at: minutesAgo(mins), image: null });
  const spa = (ref, activityRef, steps, ppe, permits, signatures, preparedBy) => {
    const a = activities.find(x => x.ref === activityRef);
    return {
      id: 'spa-' + ref, ref, activityId: a.id, title: a.title, contractorId: a.contractorId, zoneId: a.zoneId,
      start: a.start, end: a.end, steps: steps.map(([step, hazards, controls]) => ({ step, hazards, controls })), ppe, permits,
      emergency: `Call 112, then the site manager. Assembly point: ${CONFIG.site.assemblyPoint.toLowerCase()}. First aid: ${CONFIG.site.firstAidPoint}.`,
      preparedBy, preparedAt: minutesAgo(60 * 24 * 2), status: 'active', signatures
    };
  };
  const spas = [
    spa('SPA-1207', 'ACT-2041', [
      ['Check the cable survey and mark services', 'Striking buried cables or pipes', 'Cable locator sweep before digging. Hand dig within 0.5 m of marked services.'],
      ['Excavate in 1.5 m lifts and place trench boxes', 'Collapse of the excavation sides', 'Trench boxes in place before anyone enters. Spoil kept 1 m back from the edge.'],
      ['Load dump trucks from the excavator', 'Struck by plant, reversing trucks', 'Signaller on the route. Nobody inside the slew radius. Horn before slewing.'],
      ['Inspect the excavation at the start of the shift', 'Water ingress, edge failure after frost', 'Supervisor checks and records it every morning. Pump on standby.']
    ], ['helmet', 'hivis', 'boots', 'gloves'], ['excavation'],
      [sig('p-mikko', 200), sig('p-janne', 196), sig('p-ville', 195), sig('p-marek', 192)], 'Mikko Laine'),
    spa('SPA-1208', 'ACT-2042', [
      ['Sling and lift columns and beams', 'Falling or swinging loads', 'Drop zone barriered. Tag lines on every lift. Signaller in radio contact with the crane.'],
      ['Bolt up connections from the boom lift', 'Fall from height', 'Harness clipped to the basket anchor. Boom lift checked before use.'],
      ['Move the boom lift between gridlines', 'Overturning on soft ground', 'Travel only on the prepared route. Check the ground after thaw or rain.']
    ], ['helmet', 'hivis', 'boots', 'gloves', 'harness'], ['lifting', 'height'],
      [sig('p-rasmus', 185), sig('p-piotr', 183), sig('p-tomasz', 182)], 'Rasmus Ek'),
    spa('SPA-1209', 'ACT-2043', [
      ['Daily crane check and wind reading', 'Wind above the crane limit', `Read gusts from the anemometer. Stop lifting at ${CONFIG.windLimit} m/s.`],
      ['Lift steel bundles from the laydown yard', 'Load falling, swinging loads', 'Lifting accessories inspected. Tag lines used. Nobody under a suspended load.']
    ], ['helmet', 'hivis', 'boots', 'gloves'], ['lifting'], [sig('p-pekka', 210), sig('p-sami', 208)], 'Pekka Nieminen'),
    spa('SPA-1210', 'ACT-2044', [
      ['Isolate the supply at distribution board MDB-1', 'Electric shock', 'Lock and tag the isolator. Prove dead before touching anything.'],
      ['Run cables to the cabins on cable hangers', 'Trip hazard, cables damaged by vehicles', 'Cables on hangers. Protective ramps at every crossing.']
    ], ['helmet', 'hivis', 'boots', 'gloves', 'eyes'], ['electrical'], [], 'Elina Järvinen'),
    spa('SPA-1211', 'ACT-2045', [
      ['Take water samples at the settlement pond', 'Slipping into cold water', 'Work from the sampling platform. Life ring at the pond. Two people after dark.']
    ], ['helmet', 'hivis', 'boots', 'gloves'], [], [sig('p-ville', 175)], 'Mikko Laine'),
    spa('SPA-1212', 'ACT-2046', [
      ['Sort waste into the right skips', 'Sharp edges, heavy items', 'Cut-resistant gloves. Two-person lift over 25 kg.'],
      ['Grit walkways and stairs', 'Slips on ice', 'Grit before 07:00 and again after lunch when it is below 0 °C.']
    ], ['helmet', 'hivis', 'boots', 'gloves'], [], [sig('p-sanna', 230), sig('p-bishnu', 229)], 'Sanna Lindqvist')
  ];
  // earlier signatures, so the history is not empty
  spas[0].signatures.push(...['p-mikko', 'p-janne', 'p-ville'].map(pid => ({ ...sig(pid, 60 * 24 + 190), id: 'sg-y-' + pid })));

  // ---------- permits to work ----------
  const allChecked = type => Object.fromEntries(PERMIT_TYPES[type].checklist.map((_, i) => [i, true]));
  const permit = (ref, type, title, contractorId, zoneId, activityRef, from, to, status, o = {}) => ({
    id: 'ptw-' + ref, ref, type, title, contractorId, zoneId,
    activityId: activityRef ? 'act-' + activityRef : null, validFrom: from, validTo: to, status,
    requestedBy: o.requestedBy || 'Mikko Laine', requestedAt: o.requestedAt || minutesAgo(60 * 24 * 3),
    approvedBy: status === 'requested' ? null : (o.approvedBy || 'Aino Virtanen'),
    approvedAt: status === 'requested' ? null : (o.approvedAt || minutesAgo(60 * 24 * 2)),
    checklist: o.checklist || allChecked(type), conditions: o.conditions || '',
    closedAt: o.closedAt || null, closedBy: o.closedBy || null, closeNote: o.closeNote || '',
    expiryNotified: false
  });
  const permits = [
    permit('PTW-0314', 'hotwork', 'Cutting temporary steel brackets', 'c-halla', 'z-blockB', null, at(d(-6), '07:00'), at(d(-6), '16:00'), 'closed',
      { requestedBy: 'Rasmus Ek', closedAt: at(d(-6), '17:05'), closedBy: 'Rasmus Ek', closeNote: 'Fire watch kept until 17:00. Area left clean.' }),
    permit('PTW-0315', 'confined', 'Inspection of storm water well SW3', 'c-virta', 'z-blockA', null, at(d(-4), '08:00'), at(d(-4), '12:00'), 'closed',
      { requestedBy: 'Oskari Mäkelä', closedAt: at(d(-4), '11:20'), closedBy: 'Oskari Mäkelä', closeNote: 'Gas readings normal throughout. Well cover back on.' }),
    permit('PTW-0316', 'lifting', 'Tower crane lifts, steel and formwork', 'c-nosto', 'l-crane', 'ACT-2043', at(d(-1), '07:00'), at(d(6), '17:00'), 'active',
      { requestedBy: 'Pekka Nieminen', conditions: 'Stop lifting when gusts reach the crane limit. Signaller on every lift.' }),
    permit('PTW-0317', 'excavation', 'Excavation and shoring, Block C', 'c-routa', 'z-blockC', 'ACT-2041', at(d(-3), '07:00'), at(d(4), '17:00'), 'active',
      { conditions: 'Daily inspection recorded by the supervisor before entry.' }),
    permit('PTW-0318', 'hotwork', 'Welding of steel connections, gridline 4', 'c-halla', 'z-blockB', 'ACT-2048', at(d(2), '07:00'), at(d(2), '16:00'), 'requested',
      { requestedBy: 'Rasmus Ek', requestedAt: minutesAgo(140), checklist: { 0: true, 1: true, 2: true, 3: true } }),
    permit('PTW-0319', 'height', 'Boom lift work at level 2', 'c-halla', 'z-blockB', 'ACT-2042', at(d(-1), '07:00'), at(d(6), '17:00'), 'active',
      { requestedBy: 'Rasmus Ek' }),
    permit('PTW-0320', 'electrical', 'Isolation at distribution board MDB-1', 'c-kide', 'z-cabins', 'ACT-2044', at(T, '07:30'), at(T, '15:30'), 'active',
      { requestedBy: 'Elina Järvinen', requestedAt: minutesAgo(60 * 20), approvedBy: 'Aino Virtanen', approvedAt: minutesAgo(190) })
  ];
  permits.forEach(p => { p.expiryNotified = true; });

  // ---------- deliveries ----------
  const del = (ref, day, from, to, load, supplier, contractorId, gate, vehicle, needs, status, o = {}) =>
    ({ id: 'del-' + ref, ref, day: d(day), from, to, load, supplier, contractorId, gate, vehicle, needs, status,
      bookedBy: o.bookedBy || 'Juha Mäkinen', arrivedAt: o.arrivedAt || null, notes: o.notes || '' });
  const deliveries = [
    del('DEL-0408', -1, '07:00', '07:45', 'Steel columns, 16 t', 'Pohjola Steel', 'c-halla', 'Main gate', 'Articulated lorry', ['crane'], 'unloaded', { arrivedAt: at(d(-1), '07:10') }),
    del('DEL-0409', -1, '12:30', '13:00', 'Trench boxes (2)', 'Kaivin Rental', 'c-routa', 'Side gate', 'Lorry with crane arm', [], 'unloaded', { arrivedAt: at(d(-1), '12:40') }),
    del('DEL-0410', 0, '07:00', '07:45', 'Steel beams, 22 t', 'Pohjola Steel', 'c-halla', 'Main gate', 'Articulated lorry', ['crane'], 'unloaded', { arrivedAt: at(T, '07:06') }),
    del('DEL-0411', 0, '09:30', '10:00', 'Formwork panels', 'Muottikeskus', 'c-main', 'Side gate', 'Flatbed lorry', ['forklift'], 'booked'),
    del('DEL-0412', 0, '11:00', '11:30', 'Cable drums (3)', 'Sähkötukku Valo', 'c-kide', 'Main gate', 'Van', [], 'booked'),
    del('DEL-0413', 0, '11:15', '11:45', 'Grit and de-icing salt, 40 bags', 'Rautakauppa Kallio', 'c-puhdas', 'Main gate', 'Lorry with crane arm', [], 'booked'),
    del('DEL-0414', 0, '13:00', '14:00', 'Drainage pipes and fittings', 'Putkitukku Nord', 'c-virta', 'Main gate', 'Lorry with crane arm', ['forklift'], 'booked'),
    del('DEL-0415', 1, '07:30', '08:15', 'Steel beams, 18 t', 'Pohjola Steel', 'c-halla', 'Main gate', 'Articulated lorry', ['crane'], 'booked'),
    del('DEL-0416', 1, '10:00', '10:30', 'Toilet cabin swap', 'Cabin Rent Oy', 'c-main', 'Side gate', 'Truck with crane arm', [], 'booked'),
    del('DEL-0417', 2, '08:00', '08:45', 'Reinforcement mesh, Block A slab', 'Raudoite Oy', 'c-main', 'Main gate', 'Flatbed lorry', ['crane'], 'booked'),
    del('DEL-0418', 6, '06:30', '12:00', 'Ready-mix concrete, 9 trucks', 'Betoni-Kivi', 'c-main', 'Main gate', 'Concrete trucks and pump', ['pump'], 'booked',
      { notes: 'Pump sets up on the vehicle route by Block A. Route closed to other traffic 06:30-12:00.' })
  ];

  // ---------- don't walk by ----------
  const obs = (ref, type, severity, zoneId, description, mins, reportedBy, status, o = {}) => ({
    id: 'obs-' + ref, ref, type, severity, zoneId, description, action: o.action || '',
    createdAt: minutesAgo(mins), reportedBy, status, contractorId: o.contractorId || null, due: o.due ? d(o.due) : null,
    closedAt: status === 'closed' ? minutesAgo(Math.max(5, mins - (o.closedAfter || 90))) : null,
    closedBy: status === 'closed' ? (o.closedBy || 'Aino Virtanen') : null, closeNote: o.closeNote || '',
    photos: [], closePhoto: null, lat: null, lon: null
  });
  const observations = [
    obs('DWB-0151', 'hazard', 'medium', 'z-blockC', 'Edge protection missing on the east side of the excavation, about 6 m.', 70, 'Aino Virtanen', 'open',
      { contractorId: 'c-routa', due: 0, action: 'Taped off the edge and told Mikko.' }),
    obs('DWB-0152', 'unsafe-act', 'low', 'w-west', 'Worker on the west walkway without a hard hat, coming from the cabins.', 300, 'Juha Mäkinen', 'closed',
      { closeNote: 'Talked to the worker. PPE reminder at the morning meeting.', closedBy: 'Laura Korhonen' }),
    obs('DWB-0153', 'near-miss', 'high', 'l-crane', 'Beam swung close to a worker during a lift. No tag line was used.', 60 * 26, 'Pekka Nieminen', 'progress',
      { contractorId: 'c-nosto', due: 1, action: 'Lifting stopped for 20 min. Crew briefed on tag lines.' }),
    obs('DWB-0154', 'hazard', 'medium', 'w-south', 'Ice on the south walkway by the main gate. No grit down.', 48, 'Mikko Laine', 'open',
      { contractorId: 'c-puhdas', due: 0 }),
    obs('DWB-0155', 'good', 'low', 'z-blockB', 'Steel crew set up the drop zone barriers before starting, without being asked.', 60 * 22, 'Aino Virtanen', 'closed',
      { closeNote: 'Shared at the morning meeting.', closedAfter: 30 }),
    obs('DWB-0156', 'housekeeping', 'low', 'z-laydown', 'Packaging and banding straps left around the steel stack.', 160, 'Laura Korhonen', 'open',
      { contractorId: 'c-halla', due: 1 }),
    obs('DWB-0157', 'hazard', 'medium', 'g-main', 'Delivery lorry waited on the street and blocked the cycle path.', 60 * 28, 'Juha Mäkinen', 'closed',
      { closeNote: 'Suppliers reminded to wait in the holding bay. Booking times tightened.', closedBy: 'Juha Mäkinen' })
  ];
  // older observations for the weekly report trends
  const zones = items.map(i => i.id);
  const types = ['hazard', 'hazard', 'unsafe-act', 'housekeeping', 'near-miss', 'good', 'hazard', 'housekeeping'];
  const texts = {
    'hazard': ['Missing toe board on the scaffold platform.', 'Extension lead lying across the walkway.', 'Rebar ends without caps by the stairs.', 'Pallets stacked too high in the laydown yard.'],
    'unsafe-act': ['Worker standing under a suspended load.', 'Grinder used without eye protection.', 'Ladder used as a working platform.'],
    'housekeeping': ['Offcuts left on the stairs.', 'Skip overfull, waste on the ground.', 'Mud on the vehicle route by the gate.'],
    'near-miss': ['Reversing truck came close to a groundworker.', 'Tool dropped from level 1, nobody below.'],
    'good': ['Tidy work area at the end of the day.', 'Crew stopped work when the wind picked up.']
  };
  let n = 140;
  for (let w = 8; w >= 1; w--) {
    const count = 4 + Math.floor(rnd() * 5);
    for (let k = 0; k < count; k++) {
      const type = types[Math.floor(rnd() * types.length)];
      const sev = type === 'good' ? 'low' : rnd() < 0.15 ? 'high' : rnd() < 0.55 ? 'medium' : 'low';
      const mins = (w * 7 - Math.floor(rnd() * 6)) * 1440 - Math.floor(rnd() * 500);
      const list = texts[type];
      observations.push(obs('DWB-0' + (n++), type, sev, zones[Math.floor(rnd() * zones.length)], list[Math.floor(rnd() * list.length)], mins,
        ['Aino Virtanen', 'Juha Mäkinen', 'Laura Korhonen', 'Mikko Laine'][Math.floor(rnd() * 4)], 'closed',
        { closeNote: 'Sorted on the day.', closedAfter: 120 }));
    }
  }
  observations.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  // ---------- inspections ----------
  const trHistory = [];
  const trTargets = [82.4, 84.1, 83.0, 86.7, 85.2, 88.9, 87.5, 90.3];
  trTargets.forEach((target, k) => {
    const weeksAgo = 8 - k;
    const day = addDays(weekStart(T), -7 * weeksAgo + 4); // Fridays
    const scores = {};
    let total = 0;
    TR_AREAS.forEach(a => { const all = 14 + Math.floor(rnd() * 12); scores[a.key] = { ok: all, bad: 0 }; total += all; });
    let bad = Math.round(total * (100 - target) / 100);
    const keys = TR_AREAS.map(a => a.key);
    while (bad > 0) { const key = keys[Math.floor(rnd() * keys.length)]; if (scores[key].ok > 2) { scores[key].ok--; scores[key].bad++; bad--; } }
    trHistory.push({ id: 'tr-' + k, day, by: k % 2 ? 'Aino Virtanen' : 'Laura Korhonen', scores, notes: '' });
  });

  const lifts = [
    { id: 'lift-1', areaId: 'l-crane', load: 'Steel beams, bundle of 6', weight: 4.2, at: at(T, '07:40'), by: 'Pekka Nieminen', wind: 6.1, checks: { plan: true, zone: true, radio: true, gear: true, wind: true }, notes: 'From the laydown yard to Block B level 2' },
    { id: 'lift-2', areaId: 'l-crane', load: 'Formwork panels', weight: 1.8, at: at(d(-1), '13:15'), by: 'Pekka Nieminen', wind: 8.4, checks: { plan: true, zone: true, radio: true, gear: true, wind: true }, notes: '' },
    { id: 'lift-3', areaId: 'l-storage', load: 'Drainage pipe bundle', weight: 0.9, at: at(d(-1), '09:05'), by: 'Sami Koskinen', wind: 5.2, checks: { plan: true, zone: true, radio: true, gear: true, wind: true }, notes: '' }
  ];
  const checks = items.filter(i => i.lastCheckedAt).map(i => ({ id: 'chk-' + i.id, itemId: i.id, result: i.status, at: i.lastCheckedAt, by: i.lastCheckedBy, note: '', photo: null }));

  // ---------- plant & equipment ----------
  const plant = (id, name, reg, type, contractorId, left, level, notifiedDaysAgo) => {
    const validUntil = d(left);
    return { id, name, reg, type, contractorId, validUntil, lastInspected: addDays(validUntil, -365), notes: '',
      noticeLevel: level, noticeAt: level ? minutesAgo(notifiedDaysAgo * 1440) : null,
      history: [{ id: id + '-h1', inspectedOn: addDays(validUntil, -365), validUntil, inspector: 'Third-party inspector', notes: '', recordedBy: 'Juha Mäkinen', at: minutesAgo(1440 * 30) }] };
  };
  const equipment = [
    plant('eq-1', 'Excavator CAT 320', 'EXC-01', 'Excavator', 'c-routa', 9, 1, 5),
    plant('eq-2', 'Wheel loader Volvo L90', 'WL-02', 'Wheel loader', 'c-routa', -3, 2, 2),
    plant('eq-3', 'Tower crane Potain MDT 219', 'TC-01', 'Tower crane', 'c-nosto', 120, 0),
    plant('eq-4', 'Mobile crane Liebherr LTM 1050', 'CR-03', 'Mobile crane', 'c-nosto', 45, 0),
    plant('eq-5', 'Boom lift JLG 600AJ', 'MEWP-08', 'MEWP', 'c-halla', 12, 1, 2),
    plant('eq-6', 'Scissor lift Genie GS-3246', 'MEWP-07', 'MEWP', 'c-halla', 30, 0),
    plant('eq-7', 'Dump truck Scania P410', 'ABC-123', 'Dump truck', 'c-routa', 160, 0),
    plant('eq-8', 'Telehandler JCB 540-180', 'TH-05', 'Telehandler', 'c-main', 220, 0)
  ];

  const briefings = [
    { id: 'br-' + d(-1), day: d(-1), hazards: ['excavation', 'lifting', 'height', 'ice', 'light'], notes: 'Grit the walkways before 07:00. Tag lines on every steel lift.',
      attendees: ['p-laura', 'p-aino', 'p-mikko', 'p-rasmus', 'p-pekka', 'p-elina', 'p-sanna'], heldBy: 'Laura Korhonen', heldAt: at(d(-1), '07:05'), emailedAt: null }
  ];

  const notifications = [
    { id: 'n-1', at: minutesAgo(95), kind: 'access', title: 'Access request from Andres Tamm', body: 'Kide Electrical Oy, electrician', link: '#/admin', readBy: [] },
    { id: 'n-2', at: minutesAgo(140), kind: 'permit', title: 'PTW-0318 is waiting for approval', body: 'Hot work: welding of steel connections, gridline 4', link: '#/permits/ptw-PTW-0318', readBy: [] },
    { id: 'n-3', at: minutesAgo(60 * 26), kind: 'observation', title: 'High near miss DWB-0153', body: 'Crane lift area: beam swung close to a worker', link: '#/observations/obs-DWB-0153', readBy: [] },
    { id: 'n-4', at: minutesAgo(60 * 24 * 2), kind: 'plant', title: 'WL-02 inspection has expired', body: 'Wheel loader Volvo L90 must not be used', link: '#/plant', readBy: [] }
  ];

  return {
    version: 2,
    createdOn: T,
    rolledOn: T,
    counters: { ACT: 2052, DEL: 418, DWB: n, SPA: 1212, PTW: 320 },
    settings: {
      siteName: CONFIG.site.name, project: CONFIG.site.project,
      mailTo: CONFIG.mail.to, mailEnabled: true, dailyLimit: CONFIG.mail.dailyLimit,
      events: { highObservation: true, allObservations: false, permitRequest: true, permitExpiring: true, inspectionDue: true, cardExpiring: true, accessRequest: true },
      windLimit: CONFIG.windLimit, warnDays: CONFIG.warnDays, keepDemoCurrent: true, lastInjuryDate: d(-214)
    },
    users, contractors, people, attendance, items, exclusionZones, activities, spas, permits, deliveries,
    observations, tr: trHistory, lifts, checks, equipment, briefings, notifications,
    outbox: [], audit: []
  };
}

