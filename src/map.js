import maplibregl from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import { t } from './i18n.js';

const STATUS_COLORS = {
  idea: '#8b93a7',
  planned: '#e0a83a',
  booked: '#39b374',
  done: '#5a8dee',
};

const TYPE_ICONS = { stay: '⌂', poi: '★', parking: 'P' };

// Registered up front so offline region files (.pmtiles) can be added as a
// source later without touching map setup again.
maplibregl.addProtocol('pmtiles', new Protocol().tile);

export function createMap(container, { onMapClick }) {
  const map = new maplibregl.Map({
    container,
    style: {
      version: 8,
      sources: {
        osm: {
          type: 'raster',
          tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          maxzoom: 19,
          attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        },
      },
      layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
    },
    center: [9.0, 48.5], // central Europe
    zoom: 5,
  });

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
  map.addControl(
    new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
    }),
    'top-left',
  );

  map.on('click', (e) => onMapClick(e.lngLat));
  return map;
}

const markers = new Map();

export function renderStops(map, stops, { onSelect, onMove }) {
  const ids = new Set(stops.map((s) => s.id));
  for (const [id, marker] of markers) {
    if (!ids.has(id)) {
      marker.remove();
      markers.delete(id);
    }
  }

  for (const stop of stops) {
    let marker = markers.get(stop.id);
    if (!marker) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'stop-marker';
      const id = stop.id;
      marker = new maplibregl.Marker({ element: el, draggable: true, anchor: 'center' })
        .setLngLat([stop.lng, stop.lat])
        .addTo(map);
      marker.on('dragend', () => onMove(id, marker.getLngLat()));
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        onSelect(id);
      });
      markers.set(id, marker);
    } else {
      marker.setLngLat([stop.lng, stop.lat]);
    }

    const el = marker.getElement();
    const isCandidate = Boolean(stop.listingUrl) && stop.status === 'idea' && !stop.isDraft;
    el.textContent = isCandidate ? '?' : TYPE_ICONS[stop.type] || '★';
    el.style.setProperty('--marker-color', STATUS_COLORS[stop.status] || STATUS_COLORS.idea);
    el.title = stop.name || t('unnamed');
    el.classList.toggle('draft', Boolean(stop.isDraft));
    el.classList.toggle('candidate', isCandidate);
  }
}
