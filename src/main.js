import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';

/* The shell. It boots the platform core, loads the active workspace and
 * mounts whatever capabilities that workspace's configuration enables. It
 * knows nothing about travel — or any other domain. */

// Capabilities register themselves on import; the workspace config decides
// which of them actually mount.
import './modules/map.js';
import './modules/calendar.js';
import './modules/budget.js';
import './modules/backup.js';
import './modules/ai.js';

import { db } from './core/db.js';
import { getActiveWorkspace, statusesOf, entityTypeOf } from './core/workspaces.js';
import { newEntity, saveEntity, deleteEntity, listEntities } from './core/entities.js';
import { enabledCapabilities } from './core/registry.js';
import { getSetting, setSetting, getWorkspaceSetting, setWorkspaceSetting } from './core/settings.js';
import { initPanel, openEditor, editingId, updateEditingFields, registerEditorAction } from './ui/panel.js';
import { initWorkspaceUI } from './ui/workspaces.js';
import { t, initI18n, setLang, currentLang } from './i18n.js';

const state = {
  entities: [],
  draft: null, // unsaved new entity, shown as a pin but not yet in the DB
  filter: '', // '' = all statuses
};

let ws = null;
let caps = [];

// ---------- shell actions exposed to capabilities ----------

function beginDraft(typeId, fields) {
  if (state.draft) return; // finish the current new entity first
  if (editingId()) return; // a click while editing just closes nothing — ignore
  const type = entityTypeOf(ws, typeId);
  if (!type) return;
  state.draft = { ...newEntity(ws.id, type, fields), isDraft: true };
  render();
  openEditor(state.draft, { isNew: true });
}

function select(id) {
  if (state.draft && id === state.draft.id) return;
  if (editingId()) return;
  const entity = state.entities.find((e) => e.id === id);
  if (entity) openEditor(structuredClone(entity));
}

function patchFields(id, patch) {
  if (editingId() === id) {
    updateEditingFields(patch); // panel edits the same object the draft points at
    return;
  }
  const entity = state.entities.find((e) => e.id === id);
  if (entity) {
    Object.assign(entity.fields, patch);
    saveEntity(entity).then(refresh);
  }
}

// ---------- editor callbacks ----------

async function onSave(entity) {
  delete entity.isNew;
  delete entity.isDraft;
  state.draft = null;
  await saveEntity(entity);
  await refresh();
}

async function onDelete(entity) {
  state.draft = null;
  if (!entity.isNew) {
    for (const cap of caps) await cap.onEntityDelete?.(entity);
    await deleteEntity(entity.id);
  }
  await refresh();
}

function onCancel() {
  state.draft = null;
  render();
}

// ---------- settings ----------

const settingsDialog = document.getElementById('settings-dialog');
const settingsForm = document.getElementById('settings-form');

async function openSettings() {
  const f = settingsForm.elements;
  f.lang.value = currentLang();
  f.monthlyBudget.value = (await getWorkspaceSetting(ws.id, 'monthlyBudget', 0)) || '';
  f.aboutMe.value = await getWorkspaceSetting(ws.id, 'aboutMe', '');
  f.anthropicApiKey.value = '';
  const hasKey = Boolean(await getSetting('anthropicApiKey', ''));
  f.anthropicApiKey.placeholder = hasKey ? t('api_key_saved_ph') : 'sk-ant-…';
  settingsDialog.showModal();
}

settingsForm.addEventListener('submit', async () => {
  const f = settingsForm.elements;
  await setWorkspaceSetting(ws.id, 'monthlyBudget', Number(f.monthlyBudget.value) || 0);
  await setWorkspaceSetting(ws.id, 'aboutMe', f.aboutMe.value.trim());
  const key = f.anthropicApiKey.value.trim();
  if (key) await setSetting('anthropicApiKey', key);
  await setLang(f.lang.value);
  render();
});

document.getElementById('settings-chip').addEventListener('click', openSettings);
document.getElementById('settings-cancel').addEventListener('click', () => settingsDialog.close());

// ---------- status filters (from workspace config, not hardcoded) ----------

function buildFilters() {
  const box = document.getElementById('filters');
  box.textContent = '';
  const make = (status, label) => {
    const chip = document.createElement('button');
    chip.className = 'chip filter-chip' + (state.filter === status ? ' active' : '');
    chip.dataset.status = status;
    chip.textContent = label;
    chip.addEventListener('click', () => {
      state.filter = status;
      box.querySelectorAll('.filter-chip').forEach((c) => c.classList.toggle('active', c === chip));
      render();
    });
    box.append(chip);
  };
  make('', t('all'));
  for (const status of statusesOf(ws)) make(status.id, t(status.label));
}

// ---------- render loop: every capability is a projection ----------

function render() {
  const visible = state.filter ? state.entities.filter((e) => e.status === state.filter) : [...state.entities];
  const snapshot = { entities: state.entities, visible, draft: state.draft, filter: state.filter };
  for (const cap of caps) cap.render?.(snapshot);
  document.getElementById('empty-hint').hidden = state.entities.length > 0 || state.draft !== null;
}

async function refresh() {
  state.entities = await listEntities(ws.id);
  render();
}

// ---------- boot ----------

async function boot() {
  await db.open();
  await initI18n();
  ws = await getActiveWorkspace();

  const toolbarEl = document.querySelector('.toolbar');
  const settingsChip = document.getElementById('settings-chip');
  const toolbar = (el) => toolbarEl.insertBefore(el, settingsChip);

  const ctx = {
    ws,
    config: ws.config,
    t,
    toolbar,
    state: () => state,
    registerEditorAction,
    openSettings,
    actions: { beginDraft, select, patchFields, refresh },
  };

  initPanel(ws, t, { onSave, onDelete, onCancel });
  initWorkspaceUI(ws, t, toolbar);
  buildFilters();

  caps = enabledCapabilities(ws);
  for (const cap of caps) await cap.mount?.(ctx);

  document.addEventListener('langchange', () => {
    buildFilters();
    render();
  });

  await refresh();

  // Ask the browser not to evict IndexedDB / caches under storage pressure —
  // critical for offline-first workspaces on an installed PWA.
  if (ws.config?.offline?.persistStorage !== false && navigator.storage?.persist) {
    navigator.storage.persist();
  }
}

boot().catch((err) => alert(`Brize failed to start: ${err.message}`));

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('./sw.js');
}
