import { db, listStops } from './db.js';

const SCHEMA = 1;

export async function exportBackup() {
  const data = {
    app: 'brize',
    schema: SCHEMA,
    exportedAt: new Date().toISOString(),
    stops: await listStops(),
    settings: await db.settings.toArray(),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `brize-backup-${data.exportedAt.slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// Merge, never wipe: unknown ids are added, known ids only overwritten when
// the backup copy is newer ("latest edit wins"), settings only fill gaps.
export async function importBackup(file) {
  const data = JSON.parse(await file.text());
  if (data.app !== 'brize' || !Array.isArray(data.stops)) {
    throw new Error('Not a Brize backup file');
  }

  let added = 0;
  let updated = 0;
  let skipped = 0;

  await db.transaction('rw', db.stops, db.settings, async () => {
    for (const stop of data.stops) {
      if (!stop.id) continue;
      const existing = await db.stops.get(stop.id);
      if (!existing) {
        await db.stops.put(stop);
        added += 1;
      } else if ((stop.updatedAt || 0) > (existing.updatedAt || 0)) {
        await db.stops.put(stop);
        updated += 1;
      } else {
        skipped += 1;
      }
    }
    for (const row of data.settings || []) {
      if ((await db.settings.get(row.key)) === undefined) await db.settings.put(row);
    }
  });

  return { added, updated, skipped };
}
