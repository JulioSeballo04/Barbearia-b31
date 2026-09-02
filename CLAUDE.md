# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Barbearia B31 — a scheduling PWA for a single barbershop with two roles: clients book/manage their own appointments, the barber runs a panel to see the agenda, mark appointments done, edit shop config, and look up clients. Frontend-only: plain HTML/CSS/JS (ES modules, no framework, no bundler, no `package.json`), backed directly by Firebase (Auth + Firestore), hosted on Firebase Hosting.

## Commands

There is no build step and no test suite — this is intentional (single-file-per-module vanilla JS, loaded straight by the browser).

- **Run locally**: serve the repo root over HTTP (ES modules don't work from `file://`), e.g. `npx serve .` or `python3 -m http.server`, then open `index.html`.
- **Check a file compiles**: `node --input-type=module --check < js/whatever.js` (there's no test runner; this is just a syntax check against the ES module code).
- **Deploy**: `firebase deploy` (hosting) — requires the Firebase CLI logged into the project (`barbearia-b31`, see `.firebaserc`). `firebase deploy --only firestore:rules` to push `firestore.rules` changes separately.
- Merging to `main` does **not** auto-deploy — there is no CI/CD workflow in this repo. Someone has to run `firebase deploy` locally.

## Architecture

**No framework, no virtual DOM.** `js/state.js` exports one mutable `state` object that is the entire source of truth (current screen, loaded config, appointments, client/barber session, in-progress form values, etc.). Every event handler mutates `state` directly and then calls `render()` (`js/render.js`), which rebuilds `#app`'s `innerHTML` from scratch based on `state.screen` and re-wires all event handlers. There is no diffing — treat every `render()` as "the whole screen just got rebuilt."

**Screens** (`js/screens/*.js`) each export a `render*(el)` function that writes HTML and wires up its own handlers, dispatched from `render.js` by `state.screen`:
`landing → clientAuth → clientPhone → clientApp` (client booking flow) and `landing → barberAuth → barberApp` (barber panel). Screens that render lists sometimes export a paired `wire*Handlers(el)` (e.g. `barber-app.js`'s calendar/clients sections) so the HTML-building and event-wiring stay separate but are always called together.

**Data layer** (`js/data.js`) holds every Firestore read/write — screens never call Firestore directly. `js/scheduling.js` is the pure logic layer on top: slot availability, date-range math, and `computeBarberStats()` (weekly/monthly/yearly earnings, busiest weekday, per-service breakdown) — no I/O, safe to reason about in isolation.

**Firebase access** goes through `js/firebase.js` only: it imports the SDK from the `gstatic.com` CDN (no npm) and re-exports what the rest of the app needs, so no other file references the CDN URLs or the `firebaseConfig` directly.

**Timezone**: the shop always operates on America/Sao_Paulo regardless of the visitor's device. Any "what time is it / what day is today" logic must go through `nowSP()` (`js/utils.js`), not `new Date()` directly.

### Auth model — two halves of one lock

- **Client**: any Google account (Firebase Auth), profile completed with name/phone on first login (`clientPhone` screen), stored in `clients/{uid}`.
- **Barber**: must sign in with the *one* Google account matching `BARBER_EMAIL` (`js/constants.js`), **and** that exact email string must also match the `isBarberSession()` check in `firestore.rules`. These two are "the two halves of the same lock" — changing one without the other either locks the barber out or breaks the real security boundary. The Firestore rules are the actual security boundary; the PIN below is UX only.
- **PIN**: after the barber's Google identity is confirmed, a numeric PIN (hashed with PBKDF2, salt+hash+algo in `barberSecrets/main`, see `js/pin.js`) is a convenience gate on top, mainly so the panel isn't wide open if the device is left logged into Google. `barber-auth.js` also silently upgrades any PIN still stored with the old legacy SHA-256 hash to PBKDF2 on next successful login.
- **Session persistence**: once the PIN is confirmed, `localStorage[BARBER_SESSION_STORAGE_KEY]` records the timestamp so reloading the page reopens the panel without re-prompting for the PIN, as long as the Google session is still valid and the stamp is younger than `BARBER_SESSION_PERSIST_MS` (`js/constants.js`, 12h). Every click/keydown while the panel is open (`js/main.js`) refreshes that stamp, so a continuous workday never hits the limit; it's cleared on explicit logout (`doBarberLogout` in `js/screens/barber-auth.js`).

### Firestore collections

- `barberConfig/main` — public shop config (services, work days/periods, slot length, WhatsApp number). Readable by anyone (clients need it before logging in), writable only by the barber.
- `barberSecrets/main` — PIN hash/salt/algo only, never the plain PIN. Barber-only read/write.
- `clients/{uid}` — client profile (name, phone, email). Each client can only read/write their own; the barber can read all.
- `appointments/{date_time}` — doc ID is deterministic (`apptDocId` in `js/utils.js`), so `bookAppointmentTx` (`js/data.js`) uses a Firestore transaction that rejects the write if the slot doc already exists — this is the real double-booking guard, not just client-side slot-availability checks. Clients can create their own, delete their own, and update only a narrow allow-list of fields (see `firestore.rules`); the barber can update/delete any.
- `scheduleOverrides/{date}` — per-day exceptions (closed, or custom periods) layered on top of the recurring weekly schedule.

### Client deletion / anonymization

Both self-service deletion (`deleteClientAccount`) and barber-initiated deletion (`deleteClientByBarber`, in `js/data.js`) follow the same rule: a future appointment is cancelled outright, but a *past/completed* appointment is anonymized in place (name/phone/uid stripped) rather than deleted, so the barber keeps financial history (date, service, price) without retaining anything that identifies the client.

### Business rules worth knowing (all in `js/constants.js`)

- `MAX_ACTIVE_APPTS_PER_CLIENT` — client-side UX cap on simultaneous upcoming bookings; not enforced by Firestore rules (documented as a known gap, not a real trust boundary).
- `LOYALTY_VISITS_THRESHOLD` — completed-appointment count at which the barber panel shows a loyalty star next to a client, purely a visual nudge (no automatic discount/logic tied to it).
- `DEFAULT_PIN` — used only when a fresh install has no PIN hash saved yet.

### PWA / deployment notes

- `manifest.json` + `sw.js` register a service worker for "Add to Home Screen" and basic offline resilience; failures there are swallowed silently (`main.js`) so they never block the app itself.
- `firebase.json`'s hosting `ignore` list keeps local-only secrets/scripts (`novachave.json`, `*serviceAccount*.json`, `limpar-dados-demo.js`, `dados-demo-manifest.json`) out of what gets published — those files are also gitignored and won't exist in a fresh checkout.
