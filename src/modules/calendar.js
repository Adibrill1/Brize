import { registerCapability } from '../core/registry.js';
import { entityTypeOf, statusesOf } from '../core/workspaces.js';
import { getWorkspaceSetting, setWorkspaceSetting } from '../core/settings.js';
import { patchEntityMeta } from '../core/entities.js';
import { GOOGLE_CLIENT_ID, CALENDAR_SCOPE } from '../config.js';

/* Calendar capability — Google Calendar is a one-way projection of the local
 * store: the app only touches events it created (tagged with the entity id),
 * and pushes are user-initiated. The local store is never modified from
 * calendar data. Any entity type with a `calendar` binding
 * ({ start, end, statuses, subtitle }) participates. */

const API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

let gisLoading = null;
let tokenClient = null;
let accessToken = null;
let tokenExpiresAt = 0;

let chip = null;
let connected = false;
let context = null;

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

function calendarBinding(ws, entity) {
  return entityTypeOf(ws, entity.type)?.capabilities?.calendar ?? null;
}

function isSyncable(ws, entity) {
  const b = calendarBinding(ws, entity);
  return Boolean(b && (b.statuses ?? []).includes(entity.status) && entity.fields[b.start] && entity.fields[b.end]);
}

function eventBody(ws, entity, t) {
  const b = calendarBinding(ws, entity);
  const type = entityTypeOf(ws, entity.type);
  const start = entity.fields[b.start];
  // All-day events; Calendar treats the end date as exclusive, which matches
  // end-as-checkout. Guard against end <= start.
  let end = entity.fields[b.end];
  if (end <= start) {
    const d = new Date(`${start}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    end = d.toISOString().slice(0, 10);
  }

  const status = statusesOf(ws).find((s) => s.id === entity.status);
  const subtitle = b.subtitle ? entity.fields[b.subtitle] : '';
  const skip = new Set([b.start, b.end, b.subtitle]);
  const mapB = type?.capabilities?.map;
  if (mapB) {
    skip.add(mapB.lat);
    skip.add(mapB.lng);
  }
  const details = Object.entries(entity.fields)
    .filter(([key, value]) => !skip.has(key) && value !== null && value !== '')
    .map(([key, value]) => `${key}: ${value}`);

  return {
    summary: [entity.name || t(type?.label ?? 'unnamed'), subtitle, status ? t(status.label) : '']
      .filter(Boolean)
      .join(' · '),
    ...(mapB && isFinite(entity.fields[mapB.lat])
      ? { location: `${entity.fields[mapB.lat].toFixed(5)}, ${entity.fields[mapB.lng].toFixed(5)}` }
      : {}),
    description: [...details, '— Managed by Brize. Edits made here are overwritten on the next sync.'].join('\n'),
    start: { date: start },
    end: { date: end },
    extendedProperties: { private: { brizeId: entity.id, brizeWorkspaceId: entity.workspaceId } },
  };
}

async function syncToCalendar(ctx, entities) {
  await ensureToken(); // authenticate up front, even when there is nothing to push yet
  const ws = ctx.ws;
  const summary = { created: 0, updated: 0, removed: 0 };

  for (const entity of entities.filter((e) => isSyncable(ws, e))) {
    const body = eventBody(ws, entity, ctx.t);
    const eventId = entity.meta?.googleEventId;
    if (eventId) {
      const res = await gcal('PUT', `/${encodeURIComponent(eventId)}`, body);
      if (res) {
        summary.updated += 1;
        continue;
      }
      // The event was deleted on the calendar side — fall through and recreate.
    }
    const created = await gcal('POST', '', body);
    // Bookkeeping goes through meta on purpose: it must not bump updatedAt,
    // which is reserved for human edits (drives merge conflict resolution).
    await patchEntityMeta(entity.id, { googleEventId: created.id });
    summary.created += 1;
  }

  // Entities that no longer qualify (status changed, dates removed…) take
  // their event with them.
  for (const entity of entities.filter((e) => e.meta?.googleEventId && !isSyncable(ws, e))) {
    await gcal('DELETE', `/${encodeURIComponent(entity.meta.googleEventId)}`);
    await patchEntityMeta(entity.id, { googleEventId: null });
    summary.removed += 1;
  }

  for (const eventId of await getWorkspaceSetting(ws.id, 'pendingEventDeletes', [])) {
    await gcal('DELETE', `/${encodeURIComponent(eventId)}`);
    summary.removed += 1;
  }
  await setWorkspaceSetting(ws.id, 'pendingEventDeletes', []);
  await setWorkspaceSetting(ws.id, 'calendarConnected', true);
  return summary;
}

registerCapability({
  id: 'calendar',

  async mount(ctx) {
    context = ctx;
    chip = document.createElement('button');
    chip.id = 'calendar-chip';
    chip.className = 'chip';
    connected = await getWorkspaceSetting(ctx.ws.id, 'calendarConnected', false);
    refreshChip();
    chip.addEventListener('click', async () => {
      chip.disabled = true;
      chip.textContent = ctx.t('syncing');
      try {
        const { created, updated, removed } = await syncToCalendar(ctx, ctx.state().entities);
        connected = true;
        alert(ctx.t('calendar_synced', { c: created, u: updated, r: removed }));
      } catch (err) {
        alert(ctx.t('sync_failed', { msg: err.message }));
      } finally {
        chip.disabled = false;
        refreshChip();
        ctx.actions.refresh();
      }
    });
    ctx.toolbar(chip);
  },

  render() {
    refreshChip();
  },

  // Remember calendar events of entities deleted while offline / not signed
  // in, so the next sync can clean them up.
  async onEntityDelete(entity) {
    if (!entity.meta?.googleEventId) return;
    const pending = await getWorkspaceSetting(entity.workspaceId, 'pendingEventDeletes', []);
    pending.push(entity.meta.googleEventId);
    await setWorkspaceSetting(entity.workspaceId, 'pendingEventDeletes', pending);
  },
});

function refreshChip() {
  if (chip && context) chip.textContent = context.t(connected ? 'sync_calendar' : 'connect_calendar');
}
