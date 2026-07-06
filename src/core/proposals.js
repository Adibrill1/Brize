import { db } from './db.js';
import { saveEntity, deleteEntity, getEntity, newEntity } from './entities.js';
import { revertEvent } from './events.js';
import { entityTypeOf } from './workspaces.js';

/* AI never owns state. Anything an AI (or automation) wants to change goes
 * through a proposal: a stored, inspectable list of operations that only a
 * human approval applies. Applied operations are regular events with
 * actor 'ai', so every applied proposal is reversible via revert(). */

export async function createProposal(workspaceId, { title, source = 'ai', ops }) {
  const proposal = {
    id: crypto.randomUUID(),
    workspaceId,
    title,
    source,
    // ops: [{ op: 'create', type, name, status, fields } |
    //       { op: 'update', entityId, patch } |
    //       { op: 'delete', entityId }]
    ops,
    status: 'pending', // pending → approved | rejected | reverted
    createdAt: Date.now(),
    resolvedAt: null,
    eventSeqs: [],
  };
  await db.proposals.add(proposal);
  return proposal;
}

export function listProposals(workspaceId, status = 'pending') {
  return db.proposals.where('[workspaceId+status]').equals([workspaceId, status]).toArray();
}

export async function approveProposal(id, ws) {
  const proposal = await db.proposals.get(id);
  if (!proposal || proposal.status !== 'pending') return null;

  const eventSeqs = [];
  for (const op of proposal.ops) {
    if (op.op === 'create') {
      const type = entityTypeOf(ws, op.type);
      if (!type) continue;
      const entity = newEntity(ws.id, type, op.fields ?? {});
      if (op.name) entity.name = op.name;
      if (op.status) entity.status = op.status;
      entity.createdBy = 'ai';
      await saveEntity(entity, { actor: 'ai' });
      eventSeqs.push(await lastEventSeq());
    } else if (op.op === 'update') {
      const entity = await getEntity(op.entityId);
      if (!entity || entity.workspaceId !== ws.id) continue;
      const { name, status, fields } = op.patch ?? {};
      if (name !== undefined) entity.name = name;
      if (status !== undefined) entity.status = status;
      if (fields) entity.fields = { ...entity.fields, ...fields };
      await saveEntity(entity, { actor: 'ai' });
      eventSeqs.push(await lastEventSeq());
    } else if (op.op === 'delete') {
      const entity = await getEntity(op.entityId);
      if (!entity || entity.workspaceId !== ws.id) continue;
      await deleteEntity(op.entityId, { actor: 'ai' });
      eventSeqs.push(await lastEventSeq());
    }
  }

  await db.proposals.update(id, { status: 'approved', resolvedAt: Date.now(), eventSeqs });
  return db.proposals.get(id);
}

export function rejectProposal(id) {
  return db.proposals.update(id, { status: 'rejected', resolvedAt: Date.now() });
}

// Undo an approved proposal: events are reverted newest-first.
export async function revertProposal(id) {
  const proposal = await db.proposals.get(id);
  if (!proposal || proposal.status !== 'approved') return null;
  for (const seq of [...proposal.eventSeqs].reverse()) {
    await revertEvent(seq);
  }
  await db.proposals.update(id, { status: 'reverted', resolvedAt: Date.now() });
  return db.proposals.get(id);
}

async function lastEventSeq() {
  const last = await db.events.orderBy('seq').last();
  return last?.seq ?? null;
}
