// Small SVG charts for the weekly report. One series each, thin marks, hover/focus tooltips.

import { esc } from './util.js';

// Drawn at roughly the size it is shown, so the text stays readable on phones
const chartWidth = () => (window.innerWidth < 640 ? 380 : 640);

// Line chart with an optional target line (dashed: it is a threshold, not data)
export function lineChart({ points, target = null, min = 0, max = 100, unit = '', height = 220, label = '' }) {
  const W = chartWidth(), H = height, L = 40, R = 52, T = 16, B = 30;
  const iw = W - L - R, ih = H - T - B;
  const x = i => L + (points.length === 1 ? iw / 2 : (iw * i) / (points.length - 1));
  const y = v => T + ih - ((v - min) / (max - min)) * ih;
  const ticks = [];
  const step = (max - min) / 4;
  for (let v = min; v <= max + 0.001; v += step) ticks.push(Math.round(v));
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = `${path} L${x(points.length - 1).toFixed(1)},${(T + ih).toFixed(1)} L${x(0).toFixed(1)},${(T + ih).toFixed(1)} Z`;
  const last = points[points.length - 1];
  return `<figure class="chart" role="img" aria-label="${esc(label)}">
    <svg viewBox="0 0 ${W} ${H}">
      ${ticks.map(t => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text class="tick" x="${L - 8}" y="${y(t) + 4}" text-anchor="end">${t}</text>`).join('')}
      ${target != null ? `<line class="target" x1="${L}" x2="${W - R}" y1="${y(target)}" y2="${y(target)}"/>
        <text class="target-label" x="${L + 6}" y="${y(target) - 6}">Target ${target}${unit}</text>` : ''}
      <path class="area" d="${area}"/>
      <path class="line" d="${path}"/>
      ${points.map((p, i) => `<text class="tick" x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(p.label)}</text>`).join('')}
      ${points.map((p, i) => `<circle class="dot" cx="${x(i)}" cy="${y(p.value)}" r="4.5"/>
        <circle class="hit" cx="${x(i)}" cy="${y(p.value)}" r="14" tabindex="0" data-tip="${esc(p.tip || `${p.label}: ${p.value}${unit}`)}"/>`).join('')}
      ${last ? `<text class="end-label" x="${x(points.length - 1) + 9}" y="${y(last.value) - 8}">${last.value}${unit}</text>` : ''}
    </svg></figure>`;
}

// Column chart: one colour, 4px rounded tops, value printed on the last column only
export function columnChart({ bars, height = 200, label = '', highlightLast = true }) {
  const W = chartWidth(), H = height, L = 32, R = 12, T = 18, B = 30;
  const iw = W - L - R, ih = H - T - B;
  const max = Math.max(4, ...bars.map(b => b.value));
  const niceMax = Math.ceil(max / 4) * 4;
  const band = iw / bars.length;
  const bw = Math.min(24, band * 0.5);
  const y = v => T + ih - (v / niceMax) * ih;
  const ticks = [0, niceMax / 4, niceMax / 2, (3 * niceMax) / 4, niceMax];
  const col = (b, i) => {
    const h = (b.value / niceMax) * ih;
    const x0 = L + band * i + (band - bw) / 2, y0 = T + ih - h, r = Math.min(4, h);
    const d = h <= 0 ? '' : `M${x0},${T + ih} V${y0 + r} Q${x0},${y0} ${x0 + r},${y0} H${x0 + bw - r} Q${x0 + bw},${y0} ${x0 + bw},${y0 + r} V${T + ih} Z`;
    const on = highlightLast && i === bars.length - 1;
    return `${d ? `<path class="col ${on ? 'on' : ''}" d="${d}"/>` : ''}
      <rect class="hit" x="${L + band * i}" y="${T}" width="${band}" height="${ih}" tabindex="0" data-tip="${esc(b.tip || `${b.label}: ${b.value}`)}"/>
      <text class="tick" x="${x0 + bw / 2}" y="${H - 8}" text-anchor="middle">${esc(b.label)}</text>
      ${on ? `<text class="end-label" x="${x0 + bw / 2}" y="${y0 - 6}" text-anchor="middle">${b.value}</text>` : ''}`;
  };
  return `<figure class="chart" role="img" aria-label="${esc(label)}">
    <svg viewBox="0 0 ${W} ${H}">
      ${ticks.map(t => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text class="tick" x="${L - 8}" y="${y(t) + 4}" text-anchor="end">${t}</text>`).join('')}
      ${bars.map(col).join('')}
    </svg></figure>`;
}

// Horizontal bars in plain HTML, for "how many of each kind"
export function barList(rows, { unit = '' } = {}) {
  const max = Math.max(1, ...rows.map(r => r.value));
  return `<div class="barlist">${rows.map(r => `
    <div class="barlist-row" tabindex="0" data-tip="${esc(`${r.label}: ${r.value}${unit}`)}">
      <span class="barlist-label">${esc(r.label)}</span>
      <span class="barlist-track"><i style="width:${(100 * r.value) / max}%"></i></span>
      <span class="barlist-value">${r.value}</span>
    </div>`).join('')}</div>`;
}

// One tooltip for every [data-tip] element on the page
export function setupTooltips() {
  const tip = document.getElementById('tip');
  let current = null;
  const show = el => {
    current = el;
    tip.textContent = el.dataset.tip;
    tip.hidden = false;
    const r = el.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    let left = r.left + r.width / 2 - t.width / 2;
    left = Math.max(8, Math.min(window.innerWidth - t.width - 8, left));
    let top = r.top - t.height - 8;
    if (top < 8) top = r.bottom + 8;
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  };
  const hide = () => { current = null; tip.hidden = true; };
  document.addEventListener('pointerover', e => { const el = e.target.closest?.('[data-tip]'); if (el) show(el); else if (current) hide(); });
  document.addEventListener('focusin', e => { const el = e.target.closest?.('[data-tip]'); if (el) show(el); });
  document.addEventListener('focusout', hide);
  window.addEventListener('scroll', hide, { passive: true, capture: true });
}
