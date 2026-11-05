// Leaflet map helpers: satellite and street layers, site items, exclusion zones, drawing.

import { esc } from './util.js';
import { CONFIG } from './config.js';
import * as store from './store.js';

export const STATUS_COLOR = ['#8a97a6', '#1f8a4c', '#c8102e'];
const SELECTED = '#f5b800';

export const mapsAvailable = () => typeof window.L !== 'undefined';
export const shapeBounds = shape => L.latLngBounds(shape);
export const siteBounds = () => L.latLngBounds(store.all('items').flatMap(i => i.shape));

export function createMap(el, { zoomControl = true, interactive = true } = {}) {
  const layers = {
    Satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 21, maxNativeZoom: 19, attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics' }),
    Street: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      { maxZoom: 21, maxNativeZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' })
  };
  let base = 'Satellite';
  try { base = localStorage.getItem('siteguard.layer') || base; } catch { }
  const map = L.map(el, {
    layers: [layers[base] || layers.Satellite], zoomSnap: 0.25, zoomControl,
    dragging: interactive, scrollWheelZoom: interactive, touchZoom: interactive, doubleClickZoom: interactive, boxZoom: interactive, keyboard: interactive
  });
  if (interactive) {
    L.control.layers(layers, null, { position: 'topright' }).addTo(map);
    L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);
  }
  map.on('baselayerchange', e => { try { localStorage.setItem('siteguard.layer', e.name); } catch { } });
  // the map sits in flexible layouts: keep the tiles right when the panel is resized
  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(() => { if (map._loaded && map._mapPane && el.isConnected) map.invalidateSize(); });
    ro.observe(el);
    map.on('unload', () => ro.disconnect());
  }
  return map;
}

export function fitSite(map, pad = 0.08) {
  const b = siteBounds();
  if (b.isValid()) map.fitBounds(b.pad(pad));
  else map.setView([CONFIG.site.lat, CONFIG.site.lon], 16);
}

// Zones and lift areas are areas, gates are points, fences, walkways and routes are lines
export function drawItem(item, group, { selected = false, muted = false, onClick = null, label = true } = {}) {
  const pts = item.shape;
  if (!pts?.length) return null;
  const color = muted ? '#e8edf2' : (STATUS_COLOR[item.status] || STATUS_COLOR[0]);
  let layer;
  if (item.type === 0 || item.type === 5) {
    layer = L.polygon(pts, {
      color: selected ? SELECTED : color, weight: selected ? 4 : 2, fillColor: color,
      fillOpacity: muted ? 0.12 : 0.28, dashArray: item.type === 5 ? '8 6' : null, interactive: !!onClick
    });
  } else if (item.type === 1) {
    layer = L.circleMarker(pts[0], { radius: selected ? 11 : 8, color: selected ? SELECTED : '#ffffff', weight: 3, fillColor: color, fillOpacity: 1, interactive: !!onClick });
  } else {
    const w = item.type === 4 ? 8 : item.type === 3 ? 5 : 4;
    layer = L.featureGroup([
      L.polyline(pts, { color: selected ? SELECTED : '#0b1622', weight: w + (selected ? 7 : 4), opacity: selected ? 1 : 0.55, lineCap: 'round', lineJoin: 'round', interactive: !!onClick }),
      L.polyline(pts, { color, weight: w, dashArray: item.type === 4 ? '14 10' : item.type === 3 ? '1 9' : null, lineCap: 'round', lineJoin: 'round', interactive: !!onClick })
    ]);
  }
  if (label) {
    const isArea = item.type === 0 || item.type === 5;
    layer.bindTooltip(esc(item.name), isArea && !muted ? { permanent: true, direction: 'center', className: 'map-label' } : { direction: 'top', sticky: true });
  }
  if (onClick) layer.on('click', () => onClick(item));
  layer.addTo(group);
  return layer;
}

// Exclusion zones: hatched in black and yellow, with a sign-style label
export function drawZone(zone, group, { onClick = null, label = true } = {}) {
  const poly = L.polygon(zone.shape, {
    color: '#111111', weight: 2.5, fillColor: '#f5b800', fillOpacity: 0.9, className: 'ez-area', interactive: !!onClick
  });
  if (label) poly.bindTooltip(`<span>Exclusion zone</span>${esc(zone.name)}`, { permanent: true, direction: 'center', className: 'ez-label' });
  if (onClick) poly.on('click', () => onClick(zone));
  poly.addTo(group);
  return poly;
}

export const activeZones = (day) => store.all('exclusionZones').filter(z => z.from <= day && z.to >= day && !z.endedAt);

export function addLocateButton(map, onError) {
  const ctl = L.control({ position: 'topleft' });
  ctl.onAdd = () => {
    const div = L.DomUtil.create('div', 'leaflet-bar');
    div.innerHTML = '<a href="#" role="button" class="map-locate" title="Show my position" aria-label="Show my position"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="7"/></svg></a>';
    L.DomEvent.disableClickPropagation(div);
    L.DomEvent.on(div.firstChild, 'click', e => {
      L.DomEvent.preventDefault(e);
      if (!navigator.geolocation) return onError('This device cannot share its position.');
      navigator.geolocation.getCurrentPosition(p => {
        const ll = [p.coords.latitude, p.coords.longitude];
        if (map._me) map._me.remove();
        map._me = L.layerGroup([
          L.circle(ll, { radius: p.coords.accuracy, color: '#1d5fa8', weight: 1, fillOpacity: 0.12, interactive: false }),
          L.circleMarker(ll, { radius: 7, color: '#ffffff', weight: 3, fillColor: '#1d5fa8', fillOpacity: 1 }).bindTooltip('You are here')
        ]).addTo(map);
        map.setView(ll, Math.max(map.getZoom(), 17));
      }, err => onError(err.code === 1 ? 'Allow location access in the browser to show your position.' : 'Could not find your position.'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 10000 });
    });
    return div;
  };
  ctl.addTo(map);
}

// Click points on the map to outline an area. Returns a controller with finish() and cancel().
export function startDrawing(map, onChange) {
  const pts = [];
  const line = L.polyline([], { color: '#111', weight: 2, dashArray: '6 5' }).addTo(map);
  const poly = L.polygon([], { color: '#111', weight: 2, fillColor: '#f5b800', fillOpacity: 0.35 }).addTo(map);
  const dots = L.layerGroup().addTo(map);
  map.getContainer().classList.add('drawing');
  const redraw = () => {
    line.setLatLngs(pts);
    poly.setLatLngs(pts.length >= 3 ? pts : []);
    dots.clearLayers();
    pts.forEach(p => L.circleMarker(p, { radius: 5, color: '#111', weight: 2, fillColor: '#f5b800', fillOpacity: 1 }).addTo(dots));
    onChange(pts.length);
  };
  const click = e => { pts.push([+e.latlng.lat.toFixed(7), +e.latlng.lng.toFixed(7)]); redraw(); };
  map.on('click', click);
  const stop = () => {
    map.off('click', click);
    [line, poly, dots].forEach(l => l.remove());
    map.getContainer().classList.remove('drawing');
  };
  return {
    undo() { pts.pop(); redraw(); },
    finish() { stop(); return pts.slice(); },
    cancel() { stop(); }
  };
}
