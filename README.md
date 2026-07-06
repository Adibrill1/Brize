# Brize

**Live app:** https://adibrill1.github.io/Brize/

Brize is a local-first platform where every user owns independent worlds:
each **workspace** is a self-contained universe with its own entity types,
enabled capability modules, views, AI policy and settings — all configuration,
not code. **Travel is the first application** shipped on the platform, as the
Travel workspace template (map-first trip planning with stays, POIs and
parking).

Platform design: [`docs/PLATFORM_ARCHITECTURE.md`](docs/PLATFORM_ARCHITECTURE.md).
Original local-first rationale: [`docs/ARCHITECTURE_REVIEW.md`](docs/ARCHITECTURE_REVIEW.md).

## Core principles

- **Workspace first** — everything belongs to a workspace; the app always
  operates inside one active workspace, and unlimited independent workspaces
  coexist on one device.
- **Domain agnostic** — the engine knows nothing about travel (or any domain).
  Entity types, statuses, fields and AI prompts come from workspace templates
  and remain user-configurable.
- **Modular capabilities** — map, calendar, budget, AI and backup are
  self-registering modules mounted per workspace configuration, driven by
  field bindings that entity types declare.
- **Local-first** — IndexedDB (via Dexie) is the *single source of truth*.
  Every view and external sync (Google Calendar…) is a projection of it,
  never a peer writer.
- **AI proposes, users approve** — AI never owns state; structured changes go
  through a proposal + approval flow, and every applied change is reversible
  via the append-only event log.
- **Offline by default** — installed PWA; app shell and browsed map tiles are
  cached, data lives on-device, with JSON export/import as backup and merge.

## Travel template features

- Full-screen MapLibre map (OSM raster tiles, `pmtiles://` protocol pre-registered
  for offline vector region files later).
- Tap the map to add an item; drag pins to move; tap to edit — the editor form
  is generated from the workspace's entity type schema.
- Travel entity types: stay / POI / parking, stay type (house sit, Airbnb,
  camping, glamping, friends), status (idea → planned → booked → done), dates,
  cost per night, parking notes, free notes.
- Workspace switcher: create additional independent workspaces from templates
  (Travel, Blank) and jump between them; JSON export/import per workspace.
- Status filter chips and a monthly **budget guardrail** chip
  (green / amber / red against a target you set — suggestions, never auto-booking).
- JSON backup export, and import that *merges* (newer edit wins, nothing wiped).
- Service worker: offline app shell + tile caching; persistent storage requested.
- **AI outreach drafts**: a "Draft outreach message" button on stays generates a
  personalized host message via the Claude API (`claude-opus-4-8`). Semi-automated
  by design — you review, edit, and send it yourself. Requires your own Anthropic
  API key, which is stored **only on this device** (IndexedDB) and sent only to
  `api.anthropic.com` — never committed or synced. Typical cost is around a cent
  per draft.
- **Google Calendar push** (one-way): planned & booked stays with dates become
  all-day events on your primary calendar. Sync is manual (one button), the app
  only ever touches events it created (tagged with the stop id), and events are
  removed when a stay is deleted or demoted back to idea. Calendar events are a
  projection — edits made in Google Calendar are overwritten on the next sync;
  the local database is always the source of truth.

## Install on your phone

Open the live app URL in Chrome (Android) or Safari (iOS), then:

- **Android**: menu ⋮ → *Add to Home screen* → *Install*
- **iOS**: share button → *Add to Home Screen*

Installing (rather than browsing) matters: it gives the app its own icon,
full-screen mode, and much stronger protection against the browser evicting
your local data. All data stays on the device — use *Export* regularly to
keep a JSON backup.

## Development

```bash
npm install
npm run dev       # local dev server
npm run build     # production build to dist/
npm run preview   # serve the production build
```

No backend, no API keys required.

## Roadmap

1. ~~Map + local DB + manual editing + backup~~ ✅
2. ~~Workspace-first platform core: generic entities, capability modules,
   templates, event log, AI proposal flow~~ ✅
3. Google Calendar projection — ~~one-way push~~ ✅, guarded read-back with sync tokens next
4. More built-in views (calendar grid, kanban, timeline) as pure projections
5. Wishlist import (Google Takeout CSV → pins), LEZ / P+R overlay layers (GeoJSON)
6. Offline region downloads (PMTiles extracts); event-log-based device sync
7. Collaboration: turn `workspace.members` into real users with roles
