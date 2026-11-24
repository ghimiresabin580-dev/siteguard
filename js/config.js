// SiteGuard settings that belong to this installation.
// Most of these can also be changed by an administrator in Admin > Settings;
// the values here are the defaults a fresh browser starts with.

export const CONFIG = {
  app: 'SiteGuard',
  version: '2.2',

  site: {
    name: 'Malmi Airfield',
    project: 'Block 4 housing, phase 2',
    address: 'Malmi Airfield, 00700 Helsinki',
    lat: 60.2539,
    lon: 25.0442,
    assemblyPoint: 'Car park outside the main gate',
    firstAidPoint: 'Site office, cabin 2 (first aid kit, defibrillator, eye wash)',
    hospital: 'Malmi Hospital, Talvelantie 6, 00700 Helsinki'
  },

  // Emails are delivered by FormSubmit (formsubmit.co), which works from a static site.
  // The first email to a new address sends an "Activate form" link to that inbox.
  // After activating, FormSubmit also emails a random alias you can use here instead
  // of the address, so the address does not appear in the page source.
  mail: {
    to: 'ffe626855b2cd27abe235fd03eca92fb',
    endpoint: 'https://formsubmit.co/ajax/',
    dailyLimit: 40
  },

  weatherUrl: 'https://api.open-meteo.com/v1/forecast',

  // Crane lifts stop when gusts reach this speed (m/s). Check the crane's own manual.
  windLimit: 12,

  // Days before an inspection or card expires when HSE is warned
  warnDays: 14,

  // Sign-in
  sessionHours: 12,
  rememberDays: 14,
  maxFailedSignIns: 5,
  lockMinutes: 5,

  // Every demo account uses this password (shown on the sign-in page)
  demoPassword: 'SiteGuard2026'
};
