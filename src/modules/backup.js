import { registerCapability } from '../core/registry.js';
import { db, stopToEntity } from '../core/db.js';

/* Backup capability — exports the active workspace as one self-contained
 * JSON file (its universe: workspace + config, entities, settings) and
 * imports either such a file or a legacy v1 travel backup. */

const SCHEMA = 2;

async function exportWorkspace(ws) {
  const data = {
    app: 'brize',
    schema: SCHEMA,
    exportedAt: new Date().toISOString(),
    workspace: ws,
    entities: await db.entities.where('workspaceId').equals(ws.id).toArray(),
    wsettings: await db.wsettings.where('workspaceId').equals(ws.id).toArray(),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const slug = (ws.name || 'workspace').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-');
  a.download = `brize-${slug}-${data.exportedAt.slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// Merge, never wipe: unknown ids are added, known ids only overwritten when
// the backup copy is newer ("latest edit wins"), settings only fill gaps.
async function importBackup(ws, file) {
  const data = JSON.parse(await file.text());
  if (data.app !== 'brize') throw new Error('Not a Brize backup file');

  // Legacy v1 travel backup: fold its stops into the active workspace.
  const entities = Array.isArray(data.stops)
    ? data.stops.filter((s) => s.id).map((s) => stopToEntity(s, ws.id))
    : (data.entities ?? []).map((e) => ({ ...e, workspaceId: ws.id }));
  if (!Array.isArray(data.stops) && !Array.isArray(data.entities)) {
    throw new Error('Not a Brize backup file');
  }

  let added = 0;
  let updated = 0;
  let skipped = 0;

  await db.transaction('rw', db.entities, db.wsettings, async () => {
    for (const entity of entities) {
      if (!entity.id) continue;
      const existing = await db.entities.get(entity.id);
      if (!existing) {
        await db.entities.put(entity);
        added += 1;
      } else if ((entity.updatedAt || 0) > (existing.updatedAt || 0)) {
        await db.entities.put(entity);
        updated += 1;
      } else {
        skipped += 1;
      }
    }
    for (const row of data.wsettings ?? []) {
      const key = [ws.id, row.key];
      if ((await db.wsettings.get(key)) === undefined) {
        await db.wsettings.put({ ...row, workspaceId: ws.id });
      }
    }
  });

  return { added, updated, skipped };
}

let exportBtn = null;
let importSpan = null;
let context = null;

registerCapability({
  id: 'backup',

  mount(ctx) {
    context = ctx;
    exportBtn = document.createElement('button');
    exportBtn.className = 'chip';
    exportBtn.textContent = ctx.t('export');
    exportBtn.addEventListener('click', () => exportWorkspace(ctx.ws));

    const importLabel = document.createElement('label');
    importLabel.className = 'chip';
    importSpan = document.createElement('span');
    importSpan.textContent = ctx.t('import');
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.hidden = true;
    importLabel.append(importSpan, input);

    input.addEventListener('change', async () => {
      const file = input.files[0];
      input.value = '';
      if (!file) return;
      try {
        const { added, updated, skipped } = await importBackup(ctx.ws, file);
        await ctx.actions.refresh();
        alert(ctx.t('import_done', { a: added, u: updated, s: skipped }));
      } catch (err) {
        alert(ctx.t('import_failed', { msg: err.message }));
      }
    });

    ctx.toolbar(exportBtn);
    ctx.toolbar(importLabel);
  },

  render() {
    exportBtn.textContent = context.t('export');
    importSpan.textContent = context.t('import');
  },
});
