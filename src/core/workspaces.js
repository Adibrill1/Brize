import { db } from './db.js';
import { getSetting, setSetting } from './settings.js';
import { getTemplate, workspaceFromTemplate } from '../templates/index.js';

export function listWorkspaces() {
  return db.workspaces.toArray();
}

export function getWorkspace(id) {
  return db.workspaces.get(id);
}

export async function createWorkspace(name, templateId) {
  const ws = workspaceFromTemplate(getTemplate(templateId), name);
  await db.workspaces.add(ws);
  return ws;
}

export async function saveWorkspace(ws) {
  ws.updatedAt = Date.now();
  await db.workspaces.put(ws);
  return ws;
}

// Deleting a workspace removes its entire universe, atomically.
export function deleteWorkspace(id) {
  return db.transaction('rw', db.workspaces, db.entities, db.events, db.proposals, db.wsettings, async () => {
    await db.entities.where('workspaceId').equals(id).delete();
    await db.events.where('workspaceId').equals(id).delete();
    await db.proposals.where('workspaceId').equals(id).delete();
    await db.wsettings.where('workspaceId').equals(id).delete();
    await db.workspaces.delete(id);
  });
}

/* The app always operates inside exactly one active workspace. If none
 * exists yet (fresh install), a travel workspace is created — travel is the
 * first application shipped on the platform, not a special case. */
export async function getActiveWorkspace() {
  const id = await getSetting('activeWorkspaceId');
  let ws = id ? await db.workspaces.get(id) : null;
  if (!ws) ws = (await db.workspaces.toArray())[0];
  if (!ws) ws = await createWorkspace('My Trip', 'travel');
  if (ws.id !== id) await setSetting('activeWorkspaceId', ws.id);
  return ws;
}

export function setActiveWorkspaceId(id) {
  return setSetting('activeWorkspaceId', id);
}

// Config helpers — behavior is data on the workspace, not code.
export function entityTypesOf(ws) {
  return ws.config?.entityTypes ?? [];
}

export function entityTypeOf(ws, typeId) {
  return entityTypesOf(ws).find((t) => t.id === typeId) ?? null;
}

export function statusesOf(ws) {
  const seen = new Map();
  for (const type of entityTypesOf(ws)) {
    for (const s of type.statuses ?? []) {
      if (!seen.has(s.id)) seen.set(s.id, s);
    }
  }
  return [...seen.values()];
}

export function isModuleEnabled(ws, moduleId) {
  return (ws.config?.modules ?? []).includes(moduleId);
}
