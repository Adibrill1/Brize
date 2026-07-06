import maplibregl from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import { registerCapability } from '../core/registry.js';
import { entityTypeOf } from '../core/workspaces.js';

/* Map capability — a projection. It renders every entity whose type declares
 * a `map` binding ({ lat, lng } field keys) and lets the user create/move
 * them spatially. It owns no data: coordinates are ordinary entity fields. */

// Registered up front so offline region files (.pmtiles) can be added as a
// source later without touching map setup again.
maplibregl.addProtocol('pmtiles', new Protocol().tile);

let map = null;
const markers = new Map();
let context = null;

function mapBinding(type) {
  return type?.capabilities?.map ?? null;
}

function mappableTypes(ws) {
  return (ws.config?.entityTypes ?? []).filter((t) => mapBinding(t));
}

registerCapability({
  id: 'map',

  mount(ctx) {
    context = ctx;
    const defaults = ctx.ws.config?.defaults ?? {};
    map = new maplibregl.Map({
      container: 'map',
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
      center: defaults.center ?? [0, 20],
      zoom: defaults.zoom ?? 2,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
      }),
      'top-left',
    );

    map.on('click', (e) => {
      const type = mappableTypes(ctx.ws)[0];
      if (!type) return;
      const binding = mapBinding(type);
      ctx.actions.beginDraft(type.id, {
        [binding.lat]: e.lngLat.lat,
        [binding.lng]: e.lngLat.lng,
      });
    });
  },

  render({ visible: filtered, draft }) {
    if (!map) return;
    const ctx = context;
    const visible = [...filtered, ...(draft ? [draft] : [])]
      .map((entity) => ({ entity, binding: mapBinding(entityTypeOf(ctx.ws, entity.type)) }))
      .filter(({ entity, binding }) => binding && isFinite(entity.fields[binding.lat]) && isFinite(entity.fields[binding.lng]));

    const ids = new Set(visible.map(({ entity }) => entity.id));
    for (const [id, marker] of markers) {
      if (!ids.has(id)) {
        marker.remove();
        markers.delete(id);
      }
    }

    for (const { entity, binding } of visible) {
      const lngLat = [entity.fields[binding.lng], entity.fields[binding.lat]];
      let marker = markers.get(entity.id);
      if (!marker) {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'stop-marker';
        const id = entity.id;
        marker = new maplibregl.Marker({ element: el, draggable: true, anchor: 'center' })
          .setLngLat(lngLat)
          .addTo(map);
        marker.on('dragend', () => {
          const moved = marker.getLngLat();
          const st = ctx.state();
          const target = st.draft?.id === id ? st.draft : st.entities.find((e) => e.id === id);
          const b = mapBinding(entityTypeOf(ctx.ws, target?.type));
          if (b) ctx.actions.patchFields(id, { [b.lat]: moved.lat, [b.lng]: moved.lng });
        });
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          ctx.actions.select(id);
        });
        markers.set(id, marker);
      } else {
        marker.setLngLat(lngLat);
      }

      const type = entityTypeOf(ctx.ws, entity.type);
      const status = type?.statuses?.find((s) => s.id === entity.status);
      const el = marker.getElement();
      el.textContent = type?.icon || '●';
      el.style.setProperty('--marker-color', status?.color || '#8b93a7');
      el.title = entity.name || ctx.t('unnamed');
      el.classList.toggle('draft', Boolean(entity.isDraft));
    }
  },
});
