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

## What is in it

- **Dashboard**: people on site, activities, permits, open observations, deliveries, days without a lost-time injury, and a "needs attention" list.
- **Morning meeting**: today's risks and hazards, companies on site with their SPA signatures, activities, exclusion zones on the map, deliveries, key messages and attendance. Print it or email it.
- **Site map**: satellite map of the site with zones, gates, fences and routes. Leads draw exclusion zones straight on the map.
- **Look ahead**: two weeks of planned work per company, with hazards, SPA and permits.
- **Deliveries**: gate bookings with clash warnings when two lorries are booked at the same gate.
- **Don't walk by**: hazards, near misses, unsafe acts, housekeeping and good practice, with photos, GPS, assignment and close-out.
- **SPA**: steps, hazards, controls and PPE, signed by each crew member with a finger on the screen.
- **Permits to work**: hot work, excavation, working at height, confined space, lifting and electrical isolation, with checklists, approval and printable permits.
- **Inspections**: daily site walk, lift checks against the live wind (lifts are blocked above the crane's limit), and the weekly TR measurement.
- **Plant and equipment**: inspection dates, with an email when one is about to run out or has expired.
- **Workforce**: check-in, inductions, occupational safety, hot work, first aid and SFS 6002 cards, tax numbers.
- **Weekly report**: observations, TR index trend, hotspots on the map, and anything running out. Print, CSV or email.

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
