// Small per-device preferences: text size and the welcome screen.

const KEY = 'siteguard.prefs';
const DEFAULTS = { textSize: 'normal', welcome: true };

export function prefs() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return { ...DEFAULTS }; }
}

export function setPrefs(patch) {
  const next = { ...prefs(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { }
  applyPrefs(next);
  return next;
}

export function applyPrefs(p = prefs()) {
  document.documentElement.classList.toggle('large-text', p.textSize === 'large');
}
