// Live weather for the site from Open-Meteo (free, no key). Used for the lift wind check
// and to suggest hazards in the morning meeting (ice, wind, low daylight, cold).

import { CONFIG } from './config.js';
import * as store from './store.js';

const CACHE_KEY = 'siteguard.weather';
const MAX_AGE = 20 * 60 * 1000;
let pending = null;

const CODES = [
  [[0], 'Clear', 'sun'], [[1], 'Mostly clear', 'sun'], [[2], 'Partly cloudy', 'cloud-sun'], [[3], 'Overcast', 'cloud'],
  [[45, 48], 'Fog', 'cloud-fog'], [[51, 53, 55], 'Drizzle', 'cloud-drizzle'], [[56, 57], 'Freezing drizzle', 'cloud-drizzle'],
  [[61, 63, 65], 'Rain', 'cloud-rain'], [[66, 67], 'Freezing rain', 'cloud-rain'], [[71, 73, 75, 77], 'Snow', 'cloud-snow'],
  [[80, 81, 82], 'Rain showers', 'cloud-rain'], [[85, 86], 'Snow showers', 'cloud-snow'], [[95, 96, 99], 'Thunderstorm', 'cloud-lightning']
];
export const describeCode = code => {
  const hit = CODES.find(([codes]) => codes.includes(code));
  return hit ? { text: hit[1], icon: hit[2] } : { text: 'Weather', icon: 'cloud' };
};

function readCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY)); } catch { return null; }
}

export function cachedWeather() {
  return readCache();
}

export function getWeather(force = false) {
  const cached = readCache();
  if (!force && cached && Date.now() - cached.fetchedAt < MAX_AGE) return Promise.resolve(cached);
  if (pending) return pending;
  const { lat, lon } = CONFIG.site;
  const q = new URLSearchParams({
    latitude: lat, longitude: lon, timezone: 'Europe/Helsinki', wind_speed_unit: 'ms', forecast_days: '2',
    current: 'temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_gusts_10m',
    hourly: 'temperature_2m,wind_gusts_10m,precipitation_probability,weather_code',
    daily: 'sunrise,sunset,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_gusts_10m_max'
  });
  pending = fetch(`${CONFIG.weatherUrl}?${q}`)
    .then(r => { if (!r.ok) throw new Error('Weather service answered ' + r.status); return r.json(); })
    .then(raw => {
      const w = shape(raw);
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(w)); } catch { }
      return w;
    })
    .catch(() => cached ? { ...cached, stale: true } : null)
    .finally(() => { pending = null; });
  return pending;
}

function shape(raw) {
  const c = raw.current || {};
  const hours = (raw.hourly?.time || []).map((t, i) => ({
    time: t, temp: raw.hourly.temperature_2m[i], gust: raw.hourly.wind_gusts_10m[i],
    rain: raw.hourly.precipitation_probability?.[i] ?? null, code: raw.hourly.weather_code[i]
  }));
  const day = 0;
  return {
    fetchedAt: Date.now(),
    now: {
      temp: c.temperature_2m, feels: c.apparent_temperature, wind: c.wind_speed_10m, gust: c.wind_gusts_10m,
      precip: c.precipitation, code: c.weather_code
    },
    today: {
      date: raw.daily?.time?.[day], sunrise: raw.daily?.sunrise?.[day]?.slice(11, 16), sunset: raw.daily?.sunset?.[day]?.slice(11, 16),
      max: raw.daily?.temperature_2m_max?.[day], min: raw.daily?.temperature_2m_min?.[day],
      precip: raw.daily?.precipitation_sum?.[day], maxGust: raw.daily?.wind_gusts_10m_max?.[day]
    },
    hours
  };
}

// Highest gust during working hours (07-17) today, with the hour it happens
export function workdayGust(w) {
  if (!w?.hours?.length) return null;
  const dayStr = w.today.date;
  const work = w.hours.filter(h => h.time.startsWith(dayStr) && +h.time.slice(11, 13) >= 7 && +h.time.slice(11, 13) <= 17);
  if (!work.length) return null;
  return work.reduce((a, b) => (b.gust > a.gust ? b : a));
}

export function daylightHours(w) {
  if (!w?.today?.sunrise || !w?.today?.sunset) return null;
  const m = s => +s.slice(0, 2) * 60 + +s.slice(3, 5);
  return (m(w.today.sunset) - m(w.today.sunrise)) / 60;
}

// Site advice from the forecast. Each item may suggest a hazard for the morning meeting.
export function advisories(w) {
  if (!w) return [];
  const limit = store.settings().windLimit;
  const out = [];
  const peak = workdayGust(w);
  if (Math.max(w.now.gust || 0, peak?.gust || 0) >= limit) {
    out.push({ level: 'danger', hazard: 'lifting', icon: 'wind',
      text: `Gusts up to ${Math.round(Math.max(w.now.gust || 0, peak?.gust || 0))} m/s${peak ? ` around ${peak.time.slice(11, 16)}` : ''}. Crane lifts stop at ${limit} m/s.` });
  } else if ((peak?.gust || 0) >= limit * 0.8) {
    out.push({ level: 'warn', hazard: 'lifting', icon: 'wind', text: `Gusts near ${Math.round(peak.gust)} m/s around ${peak.time.slice(11, 16)}. Watch the crane anemometer.` });
  }
  const min = Math.min(w.today.min ?? 99, w.now.temp ?? 99);
  if (min <= 1) {
    out.push({ level: 'warn', hazard: 'ice', icon: 'snowflake',
      text: `${min <= -1 ? 'Freezing' : 'Near freezing'} (low ${Math.round(w.today.min)} °C). Grit walkways, stairs and ramps before work starts.` });
  }
  if (min <= -15) out.push({ level: 'warn', hazard: 'wellbeing', icon: 'thermometer-snowflake', text: 'Severe cold. Plan warm-up breaks and check on people working alone.' });
  const light = daylightHours(w);
  if (light !== null && light < 10) {
    out.push({ level: 'info', hazard: 'light', icon: 'flashlight', text: `Daylight ${w.today.sunrise}–${w.today.sunset}. Check site lighting on walkways and work areas.` });
  }
  if ((w.today.precip || 0) >= 5) out.push({ level: 'info', hazard: 'access', icon: 'droplets', text: `${Math.round(w.today.precip)} mm of rain or snow expected. Keep drainage and access routes clear.` });
  return out;
}
