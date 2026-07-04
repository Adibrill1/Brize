import { getSetting, setSetting, listStops } from './db.js';

const DAY = 24 * 60 * 60 * 1000;

// Nights of a stay that fall inside the current calendar month.
function nightsThisMonth(stop, monthStart, monthEnd) {
  if (!stop.arrival || !stop.departure) return 0;
  const from = Math.max(Date.parse(stop.arrival), monthStart);
  const to = Math.min(Date.parse(stop.departure), monthEnd);
  if (Number.isNaN(from) || Number.isNaN(to) || to <= from) return 0;
  return Math.round((to - from) / DAY);
}

export async function updateBudgetChip() {
  const chip = document.getElementById('budget-chip');
  const target = await getSetting('monthlyBudget', 0);
  const stops = await listStops();

  const now = new Date();
  const monthStart = Date.UTC(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = Date.UTC(now.getFullYear(), now.getMonth() + 1, 1);

  let total = 0;
  for (const s of stops) {
    if (s.type !== 'stay' || s.status === 'idea' || !s.costPerNight) continue;
    total += nightsThisMonth(s, monthStart, monthEnd) * s.costPerNight;
  }

  chip.classList.remove('ok', 'warn', 'over');
  if (!target) {
    chip.textContent = `Budget: €${Math.round(total)} / set target`;
  } else {
    chip.textContent = `Budget: €${Math.round(total)} / €${target}`;
    chip.classList.add(total <= target * 0.85 ? 'ok' : total <= target ? 'warn' : 'over');
  }
}

export function initBudget() {
  document.getElementById('budget-chip').addEventListener('click', async () => {
    const current = await getSetting('monthlyBudget', 0);
    const raw = prompt('Monthly stay budget target (€):', current || '');
    if (raw === null) return;
    const value = Number(raw);
    if (Number.isNaN(value) || value < 0) return alert('Please enter a number.');
    await setSetting('monthlyBudget', value);
    await updateBudgetChip();
  });
}
