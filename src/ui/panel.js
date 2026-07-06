import { entityTypesOf, entityTypeOf } from '../core/workspaces.js';

/* Schema-driven entity editor. The form is generated from the active
 * workspace's entity type configuration — the panel has no idea what domain
 * it is editing. Capabilities contribute action buttons via
 * registerEditorAction (e.g. the AI module's configured actions). */

const panel = () => document.getElementById('editor');
const form = () => document.getElementById('editor-form');

let ws = null;
let t = (k) => k;
let current = null; // the entity object being edited
let callbacks = {};
const editorActions = [];

export function initPanel(workspace, translate, cbs) {
  ws = workspace;
  t = translate;
  callbacks = cbs;
  const f = form();

  f.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!current) return;
    collect();
    const entity = current;
    closePanel();
    callbacks.onSave(entity);
  });

  document.getElementById('editor-close').addEventListener('click', cancel);
  document.getElementById('editor-cancel').addEventListener('click', cancel);
  document.getElementById('editor-delete').addEventListener('click', () => {
    if (!current) return;
    const type = entityTypeOf(ws, current.type);
    if (!current.isNew && !confirm(t('confirm_delete', { name: current.name || t(type?.label ?? 'unnamed') }))) return;
    const entity = current;
    closePanel();
    callbacks.onDelete(entity);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && current) cancel();
  });
}

export function registerEditorAction(action) {
  editorActions.push(action);
}

function cancel() {
  const entity = current;
  closePanel();
  callbacks.onCancel(entity);
}

export function openEditor(entity, { isNew = false } = {}) {
  current = entity;
  current.isNew = isNew;
  document.getElementById('editor-title').textContent = t(isNew ? 'new_entity' : 'edit_entity');
  document.getElementById('editor-delete').hidden = isNew;
  renderForm();
  panel().hidden = false;
  form().elements.name.focus();
}

function renderForm() {
  const f = form();
  const type = entityTypeOf(ws, current.type);
  const container = document.getElementById('editor-fields');
  container.textContent = '';

  container.append(labeled(t('name'), input('name', 'text', current.name, { autocomplete: 'off' })));

  const row = document.createElement('div');
  row.className = 'row';
  const typeSelect = select(
    'type',
    entityTypesOf(ws).map((et) => ({ value: et.id, label: t(et.label) })),
    current.type,
  );
  typeSelect.addEventListener('change', () => {
    collect(); // keep whatever was typed for keys the next type shares
    current.type = typeSelect.value;
    const next = entityTypeOf(ws, current.type);
    if (!next.statuses?.some((s) => s.id === current.status)) {
      current.status = next.statuses?.[0]?.id ?? '';
    }
    renderForm();
  });
  row.append(labeled(t('type'), typeSelect));
  row.append(
    labeled(
      t('status'),
      select(
        'status',
        (type?.statuses ?? []).map((s) => ({ value: s.id, label: t(s.label) })),
        current.status,
      ),
    ),
  );
  container.append(row);

  for (const field of type?.fields ?? []) {
    const value = current.fields[field.key];
    let el;
    if (field.kind === 'select') {
      el = select(
        `f_${field.key}`,
        (field.options ?? []).map((o) => ({ value: o.value, label: t(o.label) })),
        value ?? field.default ?? '',
      );
    } else if (field.kind === 'textarea') {
      el = document.createElement('textarea');
      el.name = `f_${field.key}`;
      el.rows = 3;
      el.value = value ?? '';
      if (field.placeholder) el.placeholder = t(field.placeholder);
    } else {
      el = input(`f_${field.key}`, field.kind === 'number' ? 'number' : field.kind === 'date' ? 'date' : 'text', value ?? '', {
        autocomplete: 'off',
      });
      if (field.kind === 'number') {
        if (field.min !== undefined) el.min = field.min;
        if (field.step !== undefined) el.step = field.step;
      }
      if (field.placeholder) el.placeholder = t(field.placeholder);
    }
    container.append(labeled(t(field.label ?? field.key), el));
  }

  // Coordinates are plain fields; shown read-only when the type is mappable.
  document.getElementById('editor-coords-row').hidden = !refreshCoords();

  const actionsBox = document.getElementById('editor-actions');
  actionsBox.textContent = '';
  for (const registered of editorActions) {
    for (const action of registered.actionsFor(type)) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ai-btn';
      btn.textContent = `✨ ${t(action.label)}`;
      btn.addEventListener('click', () => {
        collect(); // use what's on screen right now, saved or not
        registered.run(action, structuredClone({ ...current }), entityTypeOf(ws, current.type), btn);
      });
      actionsBox.append(btn);
    }
  }
}

function collect() {
  const f = form();
  const type = entityTypeOf(ws, current.type);
  current.name = f.elements.name.value;
  current.status = f.elements.status.value;
  for (const field of type?.fields ?? []) {
    const el = f.elements[`f_${field.key}`];
    if (!el) continue;
    current.fields[field.key] = field.kind === 'number' ? (el.value === '' ? null : Number(el.value)) : el.value;
  }
}

function refreshCoords() {
  const binding = entityTypeOf(ws, current?.type)?.capabilities?.map;
  if (!binding) return false;
  const lat = current.fields[binding.lat];
  const lng = current.fields[binding.lng];
  if (!isFinite(lat) || !isFinite(lng)) return false;
  document.getElementById('editor-coords').textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  return true;
}

export function editingId() {
  return current?.id ?? null;
}

// External updates to the entity being edited (e.g. its map pin was dragged).
export function updateEditingFields(patch) {
  if (!current) return;
  Object.assign(current.fields, patch);
  refreshCoords();
}

function closePanel() {
  current = null;
  panel().hidden = true;
}

function labeled(text, el) {
  const label = document.createElement('label');
  const span = document.createElement('span');
  span.textContent = text;
  label.append(span, el);
  return label;
}

function input(name, type, value, attrs = {}) {
  const el = document.createElement('input');
  el.name = name;
  el.type = type;
  el.value = value ?? '';
  Object.assign(el, attrs);
  return el;
}

function select(name, options, value) {
  const el = document.createElement('select');
  el.name = name;
  for (const opt of options) {
    const o = document.createElement('option');
    o.value = opt.value;
    o.textContent = opt.label;
    el.append(o);
  }
  el.value = value;
  return el;
}
