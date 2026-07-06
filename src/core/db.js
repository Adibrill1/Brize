import Dexie from 'dexie';
import { travelTemplate } from '../templates/travel.js';
import { workspaceFromTemplate } from '../templates/index.js';

/* Single source of truth for the whole platform. Every view (map, calendar,
 * budget…) is a projection of this store, never a peer writing into it.
 * Every row except global settings belongs to exactly one workspace. */
export const db = new Dexie('brize');

// v1 — the original travel-only schema, kept so existing installs upgrade.
db.version(1).stores({
  stops: 'id, status, type, arrival',
  settings: 'key',
});

// v2 — workspace-first platform schema.
db.version(2)
  .stores({
    workspaces: 'id, name',
    entities: 'id, workspaceId, [workspaceId+type], [workspaceId+status]',
    events: '++seq, workspaceId, [workspaceId+entityId]',
    proposals: 'id, workspaceId, [workspaceId+status]',
    wsettings: '[workspaceId+key], workspaceId',
    settings: 'key',
  })
  .upgrade(async (tx) => {
    const stops = await tx.table('stops').toArray();
    const settings = await tx.table('settings').toArray();
    const legacy = Object.fromEntries(settings.map((r) => [r.key, r.value]));

    // Existing v1 data becomes the first workspace: a travel one.
    const ws = workspaceFromTemplate(travelTemplate, 'My Trip');
    await tx.table('workspaces').add(ws);
    await tx.table('settings').put({ key: 'activeWorkspaceId', value: ws.id });

    for (const stop of stops) {
      await tx.table('entities').add(stopToEntity(stop, ws.id));
    }
    await tx.table('stops').clear();

    // Trip-scoped settings move into the workspace; app-level ones stay global.
    for (const key of ['monthlyBudget', 'aboutMe', 'calendarConnected', 'pendingEventDeletes']) {
      if (key in legacy) {
        await tx.table('wsettings').put({ workspaceId: ws.id, key, value: legacy[key] });
        await tx.table('settings').delete(key);
      }
    }
  });

// v3 — the legacy table is gone; only workspace-scoped data remains.
db.version(3).stores({ stops: null });

export function stopToEntity(stop, workspaceId) {
  const { id, name, type, status, lat, lng, googleEventId, createdAt, updatedAt, ...rest } = stop;
  delete rest.isDraft;
  delete rest.isNew;
  return {
    id: id || crypto.randomUUID(),
    workspaceId,
    type: type || 'stay',
    name: name || '',
    status: status || 'idea',
    fields: { lat, lng, ...rest },
    meta: googleEventId ? { googleEventId } : {},
    createdBy: 'local',
    createdAt: createdAt ?? Date.now(),
    updatedAt: updatedAt ?? Date.now(),
    rev: 1,
  };
}
