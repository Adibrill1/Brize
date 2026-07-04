import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';

import { newStop, saveStop, deleteStop, listStops, db } from './db.js';
import { createMap, renderStops } from './map.js';
import { initPanel, openEditor, editingId, updateEditingCoords } from './panel.js';
import { initBudget, updateBudgetChip } from './budget.js';
import { exportBackup, importBackup } from './backup.js';
import { syncToCalendar, queueEventDelete } from './calendar.js';
import { draftOutreach } from './ai.js';
import { getSetting } from './db.js';

const state = {
  stops: [],
  draft: null, // unsaved new stop, shown as a pin but not yet in the DB
  filter: '', // '' = all statuses
};

const map = createMap('map', {
  onMapClick(lngLat) {
    if (state.draft) return; // finish the current new stop first
    if (editingId()) return; // a click while editing just closes nothing — ignore
    state.draft = { ...newStop(lngLat), isDraft: true };
    render();
    openEditor(state.draft, { isNew: true });
  },
});

const markerHandlers = {
  onSelect(id) {
    if (state.draft && id === state.draft.id) return;
    if (editingId()) return;
    const stop = state.stops.find((s) => s.id === id);
    if (stop) openEditor({ ...stop });
  },
  onMove(id, lngLat) {
    if (editingId() === id || (state.draft && state.draft.id === id)) {
      updateEditingCoords(lngLat);
      if (state.draft && state.draft.id === id) {
        state.draft.lat = lngLat.lat;
        state.draft.lng = lngLat.lng;
      }
      return;
    }
    const stop = state.stops.find((s) => s.id === id);
    if (stop) {
      stop.lat = lngLat.lat;
      stop.lng = lngLat.lng;
      saveStop(stop).then(refresh);
    }
  },
};

initPanel({
  async onSave(stop) {
    delete stop.isNew;
    delete stop.isDraft;
    state.draft = null;
    await saveStop(stop);
    await refresh();
  },
  async onDelete(stop) {
    state.draft = null;
    if (!stop.isNew) {
      await queueEventDelete(stop);
      await deleteStop(stop.id);
    }
    await refresh();
  },
  async onCancel() {
    state.draft = null;
    render();
  },
  async onDraft(stop) {
    const dialog = document.getElementById('draft-dialog');
    const textarea = document.getElementById('draft-text');
    const btn = document.getElementById('draft-btn');
    btn.disabled = true;
    btn.textContent = '✨ Drafting…';
    try {
      const text = await draftOutreach(stop);
      textarea.value = text;
      dialog.showModal();
    } catch (err) {
      alert(`Draft failed: ${err.message}`);
    } finally {
      btn.disabled = false;
      btn.textContent = '✨ Draft outreach message';
    }
  },
});

document.getElementById('draft-close').addEventListener('click', () => {
  document.getElementById('draft-dialog').close();
});
document.getElementById('draft-copy').addEventListener('click', async (e) => {
  await navigator.clipboard.writeText(document.getElementById('draft-text').value);
  e.target.textContent = 'Copied!';
  setTimeout(() => (e.target.textContent = 'Copy'), 1500);
});

initBudget();

const calendarChip = document.getElementById('calendar-chip');
getSetting('calendarConnected', false).then((connected) => {
  if (connected) calendarChip.textContent = 'Sync Calendar';
});
calendarChip.addEventListener('click', async () => {
  const label = calendarChip.textContent;
  calendarChip.disabled = true;
  calendarChip.textContent = 'Syncing…';
  try {
    const { created, updated, removed } = await syncToCalendar();
    calendarChip.textContent = 'Sync Calendar';
    alert(`Calendar synced — ${created} created, ${updated} updated, ${removed} removed.`);
  } catch (err) {
    calendarChip.textContent = label;
    alert(`Calendar sync failed: ${err.message}`);
  } finally {
    calendarChip.disabled = false;
  }
});

document.getElementById('export-btn').addEventListener('click', exportBackup);
document.getElementById('import-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const { added, updated, skipped } = await importBackup(file);
    await refresh();
    alert(`Import done — ${added} added, ${updated} updated, ${skipped} unchanged.`);
  } catch (err) {
    alert(`Import failed: ${err.message}`);
  }
});

for (const chip of document.querySelectorAll('.filter-chip')) {
  chip.addEventListener('click', () => {
    state.filter = chip.dataset.status;
    document.querySelectorAll('.filter-chip').forEach((c) => c.classList.toggle('active', c === chip));
    render();
  });
}

function render() {
  const visible = state.filter ? state.stops.filter((s) => s.status === state.filter) : [...state.stops];
  if (state.draft) visible.push(state.draft);
  renderStops(map, visible, markerHandlers);
  document.getElementById('empty-hint').hidden = state.stops.length > 0 || state.draft !== null;
}

async function refresh() {
  state.stops = await listStops();
  render();
  await updateBudgetChip();
}

db.open()
  .then(refresh)
  .catch((err) => alert(`Local database failed to open: ${err.message}`));

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('./sw.js');
}

// Ask the browser not to evict IndexedDB / caches under storage pressure —
// critical for months on the road with an installed PWA.
if (navigator.storage?.persist) {
  navigator.storage.persist();
}
