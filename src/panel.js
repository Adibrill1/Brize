const panel = () => document.getElementById('editor');
const form = () => document.getElementById('editor-form');

const FIELDS = ['name', 'type', 'status', 'stayType', 'costPerNight', 'arrival', 'departure', 'parkingNotes', 'notes'];

let current = null; // the stop object being edited
let callbacks = {};

export function initPanel(cbs) {
  callbacks = cbs;
  const f = form();

  f.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!current) return;
    for (const name of FIELDS) {
      const input = f.elements[name];
      current[name] = input.type === 'number' ? (input.value === '' ? null : Number(input.value)) : input.value;
    }
    const stop = current;
    closePanel();
    callbacks.onSave(stop);
  });

  f.elements.type.addEventListener('change', () => {
    f.querySelectorAll('.stay-only').forEach((el) => (el.hidden = f.elements.type.value !== 'stay'));
  });

  document.getElementById('editor-close').addEventListener('click', cancel);
  document.getElementById('editor-cancel').addEventListener('click', cancel);
  document.getElementById('editor-delete').addEventListener('click', () => {
    if (!current) return;
    if (!current.isNew && !confirm(`Delete "${current.name || 'this stop'}"?`)) return;
    const stop = current;
    closePanel();
    callbacks.onDelete(stop);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && current) cancel();
  });
}

function cancel() {
  const stop = current;
  closePanel();
  callbacks.onCancel(stop);
}

export function openEditor(stop, { isNew = false } = {}) {
  current = stop;
  current.isNew = isNew;
  const f = form();
  document.getElementById('editor-title').textContent = isNew ? 'New stop' : 'Edit stop';
  document.getElementById('editor-delete').hidden = isNew;
  for (const name of FIELDS) {
    f.elements[name].value = stop[name] ?? '';
  }
  f.querySelectorAll('.stay-only').forEach((el) => (el.hidden = stop.type !== 'stay'));
  setCoords(stop);
  panel().hidden = false;
  f.elements.name.focus();
}

export function setCoords({ lat, lng }) {
  document.getElementById('editor-coords').textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

export function editingId() {
  return current?.id ?? null;
}

export function updateEditingCoords(lngLat) {
  if (!current) return;
  current.lat = lngLat.lat;
  current.lng = lngLat.lng;
  setCoords(current);
}

function closePanel() {
  current = null;
  panel().hidden = true;
}
