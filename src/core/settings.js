import { db } from './db.js';

/* Two scopes on purpose: global settings are about the app on this device
 * (language, API key, active workspace); everything that describes behavior
 * or state of a world lives with its workspace. */

export async function getSetting(key, fallback = null) {
  const row = await db.settings.get(key);
  return row === undefined ? fallback : row.value;
}

export function setSetting(key, value) {
  return db.settings.put({ key, value });
}

export async function getWorkspaceSetting(workspaceId, key, fallback = null) {
  const row = await db.wsettings.get([workspaceId, key]);
  return row === undefined ? fallback : row.value;
}

export function setWorkspaceSetting(workspaceId, key, value) {
  return db.wsettings.put({ workspaceId, key, value });
}
