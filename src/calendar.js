import { db, getSetting, setSetting, listStops } from './db.js';
import { GOOGLE_CLIENT_ID, CALENDAR_SCOPE } from './config.js';

/* Google Calendar is a one-way projection of the local DB: the app only
 * touches events it created (tagged with the stop id), and pushes are
 * user-initiated. The local DB is never modified from calendar data. */

const API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

let gisLoading = null;
let tokenClient = null;
let accessToken = null;
let tokenExpiresAt = 0;

function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (!gisLoading) {
    gisLoading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.onload = resolve;
      script.onerror = () => {
        gisLoading = null;
        reject(new Error('could not reach Google sign-in — are you online?'));
      };
      document.head.appendChild(script);
    });
  }
  return gisLoading;
}

async function ensureToken() {
  if (accessToken && Date.now() < tokenExpiresAt - 60_000) return accessToken;
  await loadGis();
  if (!tokenClient) {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: CALENDAR_SCOPE,
      callback: () => {},
    });
  }
  return new Promise((resolve, reject) => {
    tokenClient.callback = (resp) => {
      if (resp.error) {
        reject(new Error(`Google authorization failed (${resp.error})`));
        return;
      }
      accessToken = resp.access_token;
      tokenExpiresAt = Date.now() + Number(resp.expires_in) * 1000;
      resolve(accessToken);
    };
    tokenClient.error_callback = (err) => {
      reject(new Error(err?.message || 'Google sign-in was closed before finishing'));
    };
    tokenClient.requestAccessToken({ prompt: '' });
  });
}

async function gcal(method, path = '', body) {
  const token = await ensureToken();
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 404 || res.status === 410) return null; // gone on the calendar side
  if (!res.ok) throw new Error(`Google Calendar ${method} failed (HTTP ${res.status})`);
  return res.status === 204 ? {} : res.json();
}

export function isSyncable(stop) {
  return (
    stop.type === 'stay' &&
    (stop.status === 'planned' || stop.status === 'booked') &&
    Boolean(stop.arrival) &&
    Boolean(stop.departure)
  );
}

const STATUS_EMOJI = { planned: '🟡', booked: '🟢' };

function eventBody(stop) {
  // All-day events; Calendar treats the end date as exclusive, which matches
  // departure-as-checkout. Guard against departure <= arrival.
  let end = stop.departure;
  if (end <= stop.arrival) {
    const d = new Date(`${stop.arrival}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    end = d.toISOString().slice(0, 10);
  }
  return {
    summary: `${STATUS_EMOJI[stop.status]} ${stop.name || 'Stay'} · ${stop.stayType}`,
    location: `${stop.lat.toFixed(5)}, ${stop.lng.toFixed(5)}`,
    description: [
      stop.notes,
      stop.parkingNotes ? `Parking: ${stop.parkingNotes}` : '',
      stop.costPerNight ? `Cost: €${stop.costPerNight}/night` : '',
      '— Managed by Brize. Edits made here are overwritten on the next sync.',
    ]
      .filter(Boolean)
      .join('\n'),
    start: { date: stop.arrival },
    end: { date: end },
    extendedProperties: { private: { brizeId: stop.id } },
  };
}

// Remember calendar events of stops deleted while offline / not signed in,
// so the next sync can clean them up.
export async function queueEventDelete(stop) {
  if (!stop.googleEventId) return;
  const pending = await getSetting('pendingEventDeletes', []);
  pending.push(stop.googleEventId);
  await setSetting('pendingEventDeletes', pending);
}

export async function syncToCalendar() {
  await ensureToken(); // authenticate up front, even when there is nothing to push yet
  const stops = await listStops();
  const summary = { created: 0, updated: 0, removed: 0 };

  for (const stop of stops.filter(isSyncable)) {
    const body = eventBody(stop);
    if (stop.googleEventId) {
      const res = await gcal('PUT', `/${encodeURIComponent(stop.googleEventId)}`, body);
      if (res) {
        summary.updated += 1;
        continue;
      }
      // The event was deleted on the calendar side — fall through and recreate.
    }
    const created = await gcal('POST', '', body);
    // Direct update on purpose: sync bookkeeping must not bump updatedAt,
    // which is reserved for human edits (drives merge conflict resolution).
    await db.stops.update(stop.id, { googleEventId: created.id });
    summary.created += 1;
  }

  // Stops that no longer qualify (status back to idea, dates removed…) take
  // their event with them.
  for (const stop of stops.filter((s) => s.googleEventId && !isSyncable(s))) {
    await gcal('DELETE', `/${encodeURIComponent(stop.googleEventId)}`);
    await db.stops.update(stop.id, { googleEventId: null });
    summary.removed += 1;
  }

  for (const eventId of await getSetting('pendingEventDeletes', [])) {
    await gcal('DELETE', `/${encodeURIComponent(eventId)}`);
    summary.removed += 1;
  }
  await setSetting('pendingEventDeletes', []);
  await setSetting('calendarConnected', true);
  return summary;
}
