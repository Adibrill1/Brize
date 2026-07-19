import { listStops } from './db.js';
import { t, currentLang } from './i18n.js';

const STATUS_COLORS = {
  idea: '#8b93a7',
  planned: '#e0a83a',
  booked: '#39b374',
  done: '#5a8dee',
};

const DAY = 24 * 60 * 60 * 1000;

let mode = 'timeline'; // 'timeline' | 'list'
let onOpenStop = () => {};

function fmtDate(iso) {
  const d = new Date(`${iso}T00:00:00`);
  return new Intl.DateTimeFormat(currentLang() === 'he' ? 'he-IL' : 'en-GB', {
    day: 'numeric',
    month: 'short',
  }).format(d);
}

function fmtMonth(iso) {
  const d = new Date(`${iso}T00:00:00`);
  return new Intl.DateTimeFormat(currentLang() === 'he' ? 'he-IL' : 'en-GB', {
    month: 'long',
    year: 'numeric',
  }).format(d);
}

function nights(stop) {
  if (!stop.arrival || !stop.departure) return 0;
  const n = Math.round((Date.parse(stop.departure) - Date.parse(stop.arrival)) / DAY);
  return n > 0 ? n : 0;
}

function itemEl(stop) {
  const li = document.createElement('li');
  li.className = 'agenda-item';
  li.tabIndex = 0;

  const dot = document.createElement('span');
  dot.className = 'agenda-dot';
  dot.style.background = STATUS_COLORS[stop.status] || STATUS_COLORS.idea;

  const body = document.createElement('div');
  body.className = 'agenda-body';

  const title = document.createElement('div');
  title.className = 'agenda-title';
  title.textContent = stop.name || t('unnamed');

  const meta = document.createElement('div');
  meta.className = 'agenda-meta';
  const bits = [];
  if (stop.arrival && stop.departure) {
    const n = nights(stop);
    bits.push(`${fmtDate(stop.arrival)}–${fmtDate(stop.departure)}${n ? ` · ${t('nights_n', { n })}` : ''}`);
  } else if (stop.arrival) {
    bits.push(fmtDate(stop.arrival));
  }
  if (stop.type === 'stay' && stop.costPerNight) bits.push(`€${stop.costPerNight}/${t('per_night_short')}`);
  if (stop.source) bits.push(stop.source);
  meta.textContent = bits.join('  ·  ');

  body.append(title, meta);

  const badge = document.createElement('span');
  badge.className = 'agenda-badge';
  badge.textContent = t(stop.status);
  badge.style.color = STATUS_COLORS[stop.status] || STATUS_COLORS.idea;

  li.append(dot, body, badge);
  const open = () => onOpenStop(stop.id);
  li.addEventListener('click', open);
  li.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open();
    }
  });
  return li;
}

export async function renderAgenda() {
  const listEl = document.getElementById('agenda-list');
  const emptyEl = document.getElementById('agenda-empty');
  const stops = await listStops();

  document.getElementById('agenda-timeline-btn').classList.toggle('active', mode === 'timeline');
  document.getElementById('agenda-list-btn').classList.toggle('active', mode === 'list');

  listEl.replaceChildren();

  if (mode === 'timeline') {
    const dated = stops.filter((s) => s.arrival).sort((a, b) => a.arrival.localeCompare(b.arrival));
    if (!dated.length) {
      emptyEl.textContent = t('agenda_empty');
      emptyEl.hidden = false;
      return;
    }
    emptyEl.hidden = true;
    let lastMonth = '';
    for (const stop of dated) {
      const month = fmtMonth(stop.arrival);
      if (month !== lastMonth) {
        const h = document.createElement('li');
        h.className = 'agenda-month';
        h.textContent = month;
        listEl.append(h);
        lastMonth = month;
      }
      listEl.append(itemEl(stop));
    }
  } else {
    if (!stops.length) {
      emptyEl.textContent = t('list_empty');
      emptyEl.hidden = false;
      return;
    }
    emptyEl.hidden = true;
    const sorted = [...stops].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    for (const stop of sorted) listEl.append(itemEl(stop));
  }
}

export function initAgenda({ onOpen }) {
  onOpenStop = onOpen;
  const panel = document.getElementById('agenda-panel');

  document.getElementById('agenda-chip').addEventListener('click', () => {
    panel.hidden = false;
    renderAgenda();
  });
  document.getElementById('agenda-close').addEventListener('click', () => {
    panel.hidden = true;
  });
  document.getElementById('agenda-timeline-btn').addEventListener('click', () => {
    mode = 'timeline';
    renderAgenda();
  });
  document.getElementById('agenda-list-btn').addEventListener('click', () => {
    mode = 'list';
    renderAgenda();
  });
}

export function agendaOpen() {
  return !document.getElementById('agenda-panel').hidden;
}
