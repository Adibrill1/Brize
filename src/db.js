import Dexie from 'dexie';

// Single source of truth for the whole app. Calendar, Sheets and any
// automation are projections of this store, never peers writing into it.
export const db = new Dexie('brize');

db.version(1).stores({
  stops: 'id, status, type, arrival',
  settings: 'key',
});

export function newStop(lngLat) {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name: '',
    type: 'stay',
    stayType: 'housesit',
    status: 'idea',
    lng: lngLat.lng,
    lat: lngLat.lat,
    arrival: '',
    departure: '',
    costPerNight: null,
    currency: 'EUR',
    parkingNotes: '',
    notes: '',
    createdAt: now,
    updatedAt: now,
  };
}

export async function saveStop(stop) {
  stop.updatedAt = Date.now();
  await db.stops.put(stop);
  return stop;
}

export function deleteStop(id) {
  return db.stops.delete(id);
}

export function listStops() {
  return db.stops.toArray();
}

export async function getSetting(key, fallback = null) {
  const row = await db.settings.get(key);
  return row === undefined ? fallback : row.value;
}

export function setSetting(key, value) {
  return db.settings.put({ key, value });
}
