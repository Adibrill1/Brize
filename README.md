# Brize — Nomad Dashboard

Map-first PWA command center for a long-term European overland journey.
The map is the interface: stops are created, dragged and edited directly on it,
and every automated decision stays manually overridable.

Architecture rationale and roadmap: [`docs/ARCHITECTURE_REVIEW.md`](docs/ARCHITECTURE_REVIEW.md).

## Core principles

- **Local-first** — IndexedDB (via Dexie) is the *single source of truth*.
  Google Calendar, Sheets and any automation are projections of it, never peer writers.
- **Manual override everywhere** — every field of every stop is editable on the map.
- **Offline by default** — installed PWA; app shell and browsed map tiles are cached,
  data lives on-device, with JSON export/import as backup and merge.

## Current features (MVP)

- Full-screen MapLibre map (OSM raster tiles, `pmtiles://` protocol pre-registered
  for offline vector region files later).
- Tap the map to add a stop; drag pins to move; tap to edit.
- Stop model: type (stay / POI / parking), stay type (house sit, Airbnb, camping,
  glamping, friends), status (idea → planned → booked → done), dates, cost per
  night, parking notes for the Land Cruiser, free notes.
- Status filter chips and a monthly **budget guardrail** chip
  (green / amber / red against a target you set — suggestions, never auto-booking).
- JSON backup export, and import that *merges* (newer edit wins, nothing wiped).
- Service worker: offline app shell + tile caching; persistent storage requested.

## Development

```bash
npm install
npm run dev       # local dev server
npm run build     # production build to dist/
npm run preview   # serve the production build
```

No backend, no API keys required.

## Roadmap

1. ~~Map + local DB + manual editing + backup~~ (this MVP)
2. Google Calendar projection (one-way push, then guarded read-back with sync tokens)
3. Wishlist import (Google Takeout CSV → pins), LEZ / P+R overlay layers (GeoJSON)
4. Offline region downloads (PMTiles extracts), outreach draft generation
