# SiteGuard

Daily safety and coordination for a construction site: the morning meeting, permits to work,
safe plans of action (SPA), Don't walk by observations, deliveries, inspections, plant and the
people on site. Built for a Finnish building site, with the TR measurement, safety cards and
tax numbers that Finnish sites use.

**Live site:** https://ghimiresabin580-dev.github.io/siteguard/

## Try it

Pick a demo account on the sign-in page. They all use the password `SiteGuard2026`.

| Account | Sees and does |
| --- | --- |
| Administrator | Everything, plus users, access requests, email settings, backups and the audit log |
| Site manager, HSE coordinator | Run the morning meeting, approve permits, manage observations, plant and people |
| Supervisor | Plan work, write SPAs, sign the crew on, request permits, book deliveries |
| Worker | Raise observations, sign SPAs, check in and out |

## Screens

The app opens with a **Get Started** screen, then sign-in, then the main menu:

- **Dashboard**: total, open and resolved reports, this month's count, and the latest reports.
- **Report Hazard**: title, description, category, risk level, location and photos (GPS optional). High-risk reports alert the HSE coordinator.
- **View Reports**: search, status filters (all, open, in progress, resolved), and risk or category filters. Tap a report to see it; leads can assign and close it.
- **Site Map**: satellite map with a pin for each open hazard and those resolved in the last week.
- **Inspections**: daily site walk, crane lift checks against the live wind, and the weekly TR measurement (not shown to workers).
- **Statistics**: reports by risk level and by status for the last week, this month, three months or all time, plus the top categories.
- **Settings**: profile, text size, the welcome screen, downloading reports as CSV, administration (admins) and sign out.

Hazard reports are the same records as the "Don't walk by" observations, so nothing was lost in the redesign.

### More pages, not in the menu yet

The earlier pages are still in the code and work from links: morning meeting (`#/meeting`), look ahead (`#/lookahead`),
deliveries (`#/deliveries`), SPA (`#/spa`), permits (`#/permits`), plant (`#/plant`),
workforce (`#/workforce`), weekly report (`#/reports`) and contacts (`#/contacts`). To show one in the menu again, add it to
`ITEMS` in `js/views/home.js` and to `MAIN` in `js/app.js` if it should use the narrow phone layout.

## Email notifications

The site is static (GitHub Pages), so emails are sent through [FormSubmit](https://formsubmit.co)
to the address in `js/config.js` (`ghimiresabin580@gmail.com`). It can be changed in Admin > Email.

**First time only:** sign in as the administrator, open Admin > Email and press *Send a test email*.
FormSubmit then emails an "Activate Form" link to that address. Open it and press Activate.
After that every notification is delivered. FormSubmit also sends a random alias that can be
pasted into Admin > Email instead of the address.

Emails go out for high-severity observations, permits waiting for approval or running out,
plant inspections, workers' cards, access requests and password resets, and when someone
presses *Email briefing*, *Email report* or *Email status*. Each one can be switched off,
and there is a daily limit (40 by default) so a public demo cannot flood the inbox.

## Sign-in and data

- Passwords are stored only as salted PBKDF2-SHA256 hashes (120 000 rounds, WebCrypto).
- Five wrong passwords lock an account for five minutes. Sessions end after 12 hours of inactivity,
  or after 14 days with "Keep me signed in".
- New people request access; the administrator approves them and picks their role.
  Forgotten passwords are reset by the administrator with a one-time temporary password.
- On this static site, accounts and records are saved in the browser (localStorage, with photos in
  IndexedDB). Admin > Data has backup and restore. Sharing data between devices needs a server.
- "Keep demo dates current" (Admin > Site settings) moves the sample data forward every day so the
  demo never looks old. Switch it off for real use.

## Files

```
index.html          page shell
css/app.css         all styles
js/config.js        site, email address and limits
js/app.js           sign-in page, navigation, events
js/store.js         saving data in the browser
js/auth.js          accounts, roles and permissions
js/mail.js          email through FormSubmit, outbox and retries
js/weather.js       live weather from Open-Meteo
js/monitor.js       background checks (inspections, permits, cards)
js/hazards.js       hazard titles, categories, risk levels and list rows
js/prefs.js         text size and welcome screen (per device)
js/views/*.js       one file per page
```

No build step: edit the files and push.

## Earlier version

`SiteGuard.zip` holds the first version with its ASP.NET Core server and the iPhone/Android
apps (Capacitor).

## Credits

Map library [Leaflet](https://leafletjs.com) (BSD-2-Clause). Imagery Esri, Maxar, Earthstar
Geographics; street map © OpenStreetMap contributors. Weather data by
[Open-Meteo.com](https://open-meteo.com) (CC BY 4.0). Icons [Lucide](https://lucide.dev) (ISC).
Typeface [Barlow](https://github.com/jpt/barlow) by Jeremy Tribby (SIL Open Font License, see `fonts/OFL.txt`).
The demo site is drawn on the former Malmi airport in Helsinki.
