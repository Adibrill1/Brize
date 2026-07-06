import { db } from './db.js';
import { logEvent } from './events.js';

/* Generic, workspace-scoped entities. The engine knows nothing about what an
 * entity *is* — its type points into the workspace configuration, and all
 * domain data lives in the open `fields` bag. `meta` is reserved for module
 * bookkeeping (external sync ids…) and never counts as a human edit. */

export function newEntity(workspaceId, entityType, fields = {}) {
  const now = Date.now();
  const defaults = {};
  for (const f of entityType.fields ?? []) {
    if ('default' in f) defaults[f.key] = f.default;
  }
  return {
    id: crypto.randomUUID(),
    workspaceId,
    type: entityType.id,
    name: '',
    status: entityType.statuses?.[0]?.id ?? '',
    fields: { ...defaults, ...fields },
    meta: {},
    createdBy: 'local',
    createdAt: now,
    updatedAt: now,
    rev: 0,
  };
}

export async function saveEntity(entity, { actor = 'user' } = {}) {
  const before = await db.entities.get(entity.id);
  entity.updatedAt = Date.now();
  entity.rev = (before?.rev ?? 0) + 1;
  await db.entities.put(entity);
  await logEvent({
    workspaceId: entity.workspaceId,
    actor,
    action: before ? 'update' : 'create',
    entityId: entity.id,
    before: before ?? null,
    after: entity,
  });
  return entity;
}

export async function deleteEntity(id, { actor = 'user' } = {}) {
  const before = await db.entities.get(id);
  if (!before) return;
  await db.entities.delete(id);
  await logEvent({
    workspaceId: before.workspaceId,
    actor,
    action: 'delete',
    entityId: id,
    before,
    after: null,
  });
}

// Module bookkeeping: no rev bump, no event — must never win a sync merge
// or show up as a human edit.
export async function patchEntityMeta(id, patch) {
  const entity = await db.entities.get(id);
  if (!entity) return;
  await db.entities.update(id, { meta: { ...entity.meta, ...patch } });
}

export function listEntities(workspaceId) {
  return db.entities.where('workspaceId').equals(workspaceId).toArray();
}

export function getEntity(id) {
  return db.entities.get(id);
}
