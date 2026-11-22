// Report Hazard: a short form anyone on site can fill in on a phone.

import * as store from '../store.js';
import * as H from '../hazards.js';
import { fmtStamp } from '../util.js';
import { can } from '../auth.js';
import { icon } from '../icons.js';
import { toast, options } from '../ui.js';
import { savePhoto, hydratePhotos } from '../photos.js';
import { sendEmail, describe } from '../mail.js';
import { notify } from '../monitor.js';

let photos = [];
let pos = null;

const places = () => store.all('items').filter(i => i.type === 0 || i.type === 5 || i.type === 1)
  .map(i => [i.id, i.name]).sort((a, b) => a[1].localeCompare(b[1]));

function photoTiles() {
  return photos.map(id => `<span class="ph-tile"><img data-photo="${id}" alt="Attached photo">
      <button type="button" class="ph-x" data-act="rpRemovePhoto" data-id="${id}" aria-label="Remove photo">${icon('x')}</button></span>`).join('')
    + (photos.length < 4 ? `<label class="ph-tile ph-add">${icon('camera')}<span>Add Photo</span>
      <input type="file" accept="image/*" capture="environment" multiple hidden data-change="rpPhoto"></label>` : '');
}

export default {
  meta: { key: 'report', label: 'Report Hazard', icon: 'triangle-exclamation-point' },
  allowed: user => can('obs.create', user),
  deniedText: 'Your account cannot report hazards.',

  render: () => {
    photos = [];
    pos = null;
    return `<form id="rpForm" class="m-form" data-submit="rpSave" novalidate>
      <label class="m-field"><span>Hazard Title <i>*</i></span>
        <input name="title" required maxlength="80" placeholder="For example: Loose cable on walkway"></label>
      <label class="m-field"><span>Description <i>*</i></span>
        <textarea name="description" rows="3" required maxlength="600" placeholder="What is wrong, and what could happen?"></textarea></label>
      <div class="m-two">
        <label class="m-field"><span>Category <i>*</i></span>
          <span class="sel-ic" id="rpCatIc">${icon(H.CATEGORIES[0].icon)}</span>
          <select name="category" required class="with-ic" data-change="rpCat">${options(H.CATEGORIES.map(c => [c.key, c.label]), '', { blank: 'Choose' })}</select></label>
        <label class="m-field"><span>Risk Level <i>*</i></span>
          <select name="severity" required data-change="rpRisk" id="rpRisk">${options([['high', 'High'], ['medium', 'Medium'], ['low', 'Low']], '', { blank: 'Choose' })}</select></label>
      </div>
      <label class="m-field"><span>Location</span>
        <span class="sel-ic">${icon('map-pin')}</span>
        <select name="zoneId" class="with-ic">${options(places(), '', { blank: 'Somewhere else on site' })}</select></label>
      <button type="button" class="link-btn m-gps" data-act="rpLocate">${icon('locate-fixed')}Add my GPS position (optional)</button>
      <div class="m-field"><span>Attach Photo</span>
        <div class="ph-row" id="rpPhotos">${photoTiles()}</div></div>
      <button type="submit" class="m-btn">${icon('send')}Submit Report</button>
    </form>`;
  },
  mount: (ctx, root) => hydratePhotos(root),

  actions: {
    rpRemovePhoto(el) {
      photos = photos.filter(p => p !== el.dataset.id);
      const box = document.getElementById('rpPhotos');
      box.innerHTML = photoTiles();
      hydratePhotos(box);
    },
    rpLocate(el) {
      if (!navigator.geolocation) return toast('This device cannot share its position.', 'err');
      el.disabled = true;
      el.innerHTML = '<span class="spinner"></span>Finding you…';
      navigator.geolocation.getCurrentPosition(p => {
        pos = { lat: +p.coords.latitude.toFixed(6), lon: +p.coords.longitude.toFixed(6) };
        el.innerHTML = `${icon('map-pin')}GPS position added (±${Math.round(p.coords.accuracy)} m)`;
      }, () => {
        el.disabled = false;
        el.innerHTML = `${icon('locate-fixed')}Add my GPS position (optional)`;
        toast('Allow location access in the browser to add your position.', 'err');
      }, { enableHighAccuracy: true, timeout: 10000 });
    }
  },

  changes: {
    async rpPhoto(el) {
      for (const f of [...el.files].slice(0, 4 - photos.length)) {
        try { photos.push(await savePhoto(f)); } catch (e) { toast(e.message, 'err'); }
      }
      const box = document.getElementById('rpPhotos');
      box.innerHTML = photoTiles();
      hydratePhotos(box);
    },
    rpCat(el) {
      const c = H.CATEGORIES.find(x => x.key === el.value) || H.CATEGORIES[0];
      document.getElementById('rpCatIc').innerHTML = icon(c.icon);
    },
    rpRisk(el) { el.className = el.value ? H.RISK[el.value].cls : ''; }
  },

  submits: {
    async rpSave(form, v, btn, ctx) {
      const user = ctx.user;
      btn.disabled = true;
      const rec = store.insert('observations', {
        ref: store.nextRef('DWB'), type: 'hazard', title: v.title.trim(), category: v.category, severity: v.severity,
        zoneId: v.zoneId || null, description: v.description, action: '', reportedBy: user.name, reportedById: user.id,
        status: 'open', contractorId: null, due: null, assignedAt: null, assignedBy: null,
        closedAt: null, closedBy: null, closeNote: '', photos: photos.slice(), closePhoto: null,
        lat: pos?.lat ?? null, lon: pos?.lon ?? null
      }, { front: true });
      photos = [];
      store.audit(user, 'Reported hazard', `${rec.ref} ${rec.title}`);
      if (rec.zoneId && rec.severity !== 'low') store.update('items', rec.zoneId, { status: 2 });

      const high = rec.severity === 'high';
      if (high) notify('observation', `High risk hazard ${rec.ref}`, `${H.where(rec)}: ${rec.title}`, `#/hazards/${rec.id}`);
      let mailNote = '';
      if (high || store.settings().events.allObservations) {
        const res = await sendEmail({
          event: high ? 'highObservation' : 'allObservations',
          subject: `${high ? 'HIGH RISK ' : ''}Hazard at ${H.where(rec)}: ${rec.title} (${rec.ref})`,
          fields: {
            Hazard: `${rec.ref} ${rec.title}`, Category: H.category(rec).label, 'Risk level': H.RISK[rec.severity].short,
            Where: H.where(rec), Description: rec.description, 'Reported by': `${user.name}, ${fmtStamp(rec.createdAt)}`,
            ...(rec.lat ? { 'GPS position': `${rec.lat}, ${rec.lon}` } : {}),
            Photos: rec.photos.length ? `${rec.photos.length} in SiteGuard` : 'None'
          },
          link: `#/hazards/${rec.id}`
        });
        mailNote = describe(res);
      }
      toast(`${rec.ref} sent. Thank you for reporting it.${mailNote ? ' ' + mailNote : ''}`, 'ok', 6000);
      ctx.go('#/hazards/open');
    }
  }
};

