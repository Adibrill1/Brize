import { db } from './db.js';

/* Append-only event log. Every mutation of an entity — human, AI or import —
 * lands here with a before/after snapshot, which gives us:
 *   - reversibility (any event can be undone, the basis of AI approval flows)
 *   - an audit trail per actor (collaboration-ready)
 *   - a change feed to replay for future device sync.
 * Module bookkeeping (e.g. external sync ids) deliberately bypasses the log. */

export function logEvent({ workspaceId, actor = 'user', action, entityId, before = null, after = null }) {
  return db.events.add({
    workspaceId,
    actor,
    action, // 'create' | 'update' | 'delete'
    entityId,
    before,
    after,
    ts: Date.now(),
  });
}

export async function revertEvent(seq) {
  const evt = await db.events.get(seq);
  if (!evt) return false;
  if (evt.before) {
    await db.entities.put(evt.before);
  } else if (evt.after) {
    await db.entities.delete(evt.after.id);
  }
  await logEvent({
    workspaceId: evt.workspaceId,
    actor: 'user',
    action: evt.before ? (evt.action === 'delete' ? 'create' : 'update') : 'delete',
    entityId: evt.entityId,
    before: evt.after,
    after: evt.before,
  });
  return true;
}

export function listEvents(workspaceId, limit = 100) {
  return db.events.where('workspaceId').equals(workspaceId).reverse().limit(limit).toArray();
}
