import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';

import { newStop, saveStop, deleteStop, listStops, db } from './db.js';
import { createMap, renderStops } from './map.js';
import { initPanel, openEditor, editingId, updateEditingCoords } from './panel.js';
import { updateBudgetChip } from './budget.js';
import { exportBackup, importBackup } from './backup.js';
import { syncToCalendar, queueEventDelete } from './calendar.js';
import { draftOutreach } from './ai.js';
import { initAgenda, renderAgenda, agendaOpen } from './agenda.js';
import { geocode, reverseGeocode, PROVIDERS, detectSource } from './search.js';
import { getSetting, setSetting } from './db.js';
import { t, initI18n, setLang, currentLang } from './i18n.js';

const state = {
  stops: [],
  draft: null, // unsaved new stop, shown as a pin but not yet in the DB
  filter: '', // '' = all statuses
};

function startNewStop(lngLat) {
  if (state.draft) return; // finish the current new stop first
  if (editingId()) return;
  state.draft = { ...newStop(lngLat), isDraft: true };
  render();
  openEditor(state.draft, { isNew: true });
}

const map = createMap('map', {
  onMapClick: startNewStop,
});

// Green + button: drop a new stop at the current map center (one-hand friendly).
document.getElementById('add-fab').addEventListener('click', () => {
  startNewStop(map.getCenter());
});

// Agenda side panel: open a stop from the list into the editor, and pan to it.
initAgenda({
  onOpen(id) {
    if (editingId()) return;
    const stop = state.stops.find((s) => s.id === id);
    if (!stop) return;
    map.flyTo({ center: [stop.lng, stop.lat], zoom: Math.max(map.getZoom(), 9) });
    openEditor({ ...stop });
    render();
  },
});

const markerHandlers = {
  onSelect(id) {
    if (state.draft && id === state.draft.id) return;
    if (editingId()) return;
    const stop = state.stops.find((s) => s.id === id);
    if (stop) {
      openEditor({ ...stop });
      render(); // hides the add button while the editor sheet is open
    }
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
    stop.source = stop.listingUrl ? detectSource(stop.listingUrl) : '';
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
    btn.textContent = t('drafting');
    try {
      const text = await draftOutreach(stop);
      textarea.value = text;
      dialog.showModal();
    } catch (err) {
      alert(t('draft_failed', { msg: err.message }));
    } finally {
      btn.disabled = false;
      btn.textContent = t('draft_btn');
    }
  },
});

document.getElementById('draft-close').addEventListener('click', () => {
  document.getElementById('draft-dialog').close();
});
document.getElementById('draft-copy').addEventListener('click', async (e) => {
  await navigator.clipboard.writeText(document.getElementById('draft-text').value);
  e.target.textContent = t('copied');
  setTimeout(() => (e.target.textContent = t('copy')), 1500);
});

const calendarChip = document.getElementById('calendar-chip');
let calendarConnected = false;

function refreshCalendarChip() {
  calendarChip.textContent = t(calendarConnected ? 'sync_calendar' : 'connect_calendar');
}

getSetting('calendarConnected', false).then((connected) => {
  calendarConnected = connected;
  refreshCalendarChip();
});

calendarChip.addEventListener('click', async () => {
  calendarChip.disabled = true;
  calendarChip.textContent = t('syncing');
  try {
    const { created, updated, removed } = await syncToCalendar();
    calendarConnected = true;
    alert(t('calendar_synced', { c: created, u: updated, r: removed }));
  } catch (err) {
    alert(t('sync_failed', { msg: err.message }));
  } finally {
    calendarChip.disabled = false;
    refreshCalendarChip();
  }
});

// ---------- settings ----------

const settingsDialog = document.getElementById('settings-dialog');
const settingsForm = document.getElementById('settings-form');

async function openSettings() {
  const f = settingsForm.elements;
  f.lang.value = currentLang();
  f.monthlyBudget.value = (await getSetting('monthlyBudget', 0)) || '';
  f.aboutMe.value = await getSetting('aboutMe', '');
  f.anthropicApiKey.value = '';
  const hasKey = Boolean(await getSetting('anthropicApiKey', ''));
  f.anthropicApiKey.placeholder = hasKey ? t('api_key_saved_ph') : 'sk-ant-…';
  settingsDialog.showModal();
}

settingsForm.addEventListener('submit', async () => {
  const f = settingsForm.elements;
  await setSetting('monthlyBudget', Number(f.monthlyBudget.value) || 0);
  await setSetting('aboutMe', f.aboutMe.value.trim());
  const key = f.anthropicApiKey.value.trim();
  if (key) await setSetting('anthropicApiKey', key);
  await setLang(f.lang.value);
  await updateBudgetChip();
});

document.getElementById('settings-chip').addEventListener('click', openSettings);
document.getElementById('budget-chip').addEventListener('click', openSettings);
document.getElementById('settings-cancel').addEventListener('click', () => settingsDialog.close());

document.addEventListener('langchange', () => {
  refreshCalendarChip();
  updateBudgetChip();
  render(); // refresh marker tooltips
  if (agendaOpen()) renderAgenda();
});

// ---------- place search (geocoding) ----------

const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');
let searchTimer = null;

function closeSearchResults() {
  searchResults.hidden = true;
  searchResults.replaceChildren();
}

searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  const q = searchInput.value.trim();
  if (q.length < 3) return closeSearchResults();
  searchTimer = setTimeout(() => runSearch(q), 350);
});

searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    clearTimeout(searchTimer);
    const q = searchInput.value.trim();
    if (q.length >= 2) runSearch(q);
  } else if (e.key === 'Escape') {
    closeSearchResults();
  }
});

async function runSearch(q) {
  searchResults.hidden = false;
  searchResults.replaceChildren(Object.assign(document.createElement('li'), { className: 'muted', textContent: t('searching') }));
  try {
    const results = await geocode(q);
    if (!results.length) {
      searchResults.replaceChildren(Object.assign(document.createElement('li'), { className: 'muted', textContent: t('no_results') }));
      return;
    }
    searchResults.replaceChildren(
      ...results.map((r) => {
        const li = document.createElement('li');
        li.textContent = r.label;
        li.addEventListener('click', () => {
          if (r.bbox) map.fitBounds([[r.bbox[0], r.bbox[1]], [r.bbox[2], r.bbox[3]]], { padding: 40, maxZoom: 13 });
          else map.flyTo({ center: [r.lng, r.lat], zoom: 12 });
          closeSearchResults();
          searchInput.value = '';
        });
        return li;
      }),
    );
  } catch (err) {
    searchResults.replaceChildren(Object.assign(document.createElement('li'), { className: 'muted', textContent: t('search_failed', { msg: err.message }) }));
  }
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.searchbar')) closeSearchResults();
});

// ---------- find stays here (provider deep links) ----------

const staysDialog = document.getElementById('stays-dialog');

document.getElementById('find-stays-btn').addEventListener('click', async () => {
  const center = map.getCenter();
  const placeEl = document.getElementById('stays-place');
  placeEl.textContent = '…';
  document.getElementById('stays-arrival').value = '';
  document.getElementById('stays-departure').value = '';
  staysDialog.showModal();

  let place = '';
  try {
    place = await reverseGeocode(center.lat, center.lng);
  } catch {
    place = '';
  }
  placeEl.textContent = place || `${center.lat.toFixed(3)}, ${center.lng.toFixed(3)}`;
  staysDialog.dataset.place = place;

  renderProviders(center);
});

function renderProviders(center) {
  const wrap = document.getElementById('stays-providers');
  wrap.replaceChildren(
    ...PROVIDERS.map((p) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'provider-btn';
      btn.textContent = p.label;
      btn.addEventListener('click', () => {
        const url = p.build({
          place: staysDialog.dataset.place || `${center.lat},${center.lng}`,
          lat: center.lat,
          lng: center.lng,
          arrival: document.getElementById('stays-arrival').value,
          departure: document.getElementById('stays-departure').value,
        });
        window.open(url, '_blank', 'noopener');
      });
      return btn;
    }),
  );
}

document.getElementById('stays-close').addEventListener('click', () => staysDialog.close());

document.getElementById('export-btn').addEventListener('click', exportBackup);
document.getElementById('import-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const { added, updated, skipped } = await importBackup(file);
    await refresh();
    alert(t('import_done', { a: added, u: updated, s: skipped }));
  } catch (err) {
    alert(t('import_failed', { msg: err.message }));
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
  // Hide the add button while placing/editing a stop so it doesn't overlap the sheet.
  document.getElementById('add-fab').hidden = state.draft !== null || editingId() !== null;
}

async function refresh() {
  state.stops = await listStops();
  render();
  if (agendaOpen()) await renderAgenda();
  await updateBudgetChip();
}

db.open()
  .then(initI18n)
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
