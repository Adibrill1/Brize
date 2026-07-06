import { registerCapability } from '../core/registry.js';
import { entityTypeOf } from '../core/workspaces.js';
import { getWorkspaceSetting } from '../core/settings.js';

/* Budget capability — a projection that sums entities whose type declares a
 * `budget` binding: { amountPerDay, start, end, excludeStatuses }. The target
 * is a workspace setting, the currency a workspace default. */

const DAY = 24 * 60 * 60 * 1000;
let chip = null;
let context = null;

function daysThisMonth(fields, binding, monthStart, monthEnd) {
  const start = fields[binding.start];
  const end = fields[binding.end];
  if (!start || !end) return 0;
  const from = Math.max(Date.parse(start), monthStart);
  const to = Math.min(Date.parse(end), monthEnd);
  if (Number.isNaN(from) || Number.isNaN(to) || to <= from) return 0;
  return Math.round((to - from) / DAY);
}

registerCapability({
  id: 'budget',

  mount(ctx) {
    context = ctx;
    chip = document.createElement('button');
    chip.id = 'budget-chip';
    chip.className = 'chip';
    chip.addEventListener('click', ctx.openSettings);
    ctx.toolbar(chip);
  },

  async render({ entities }) {
    const ctx = context;
    const target = await getWorkspaceSetting(ctx.ws.id, 'monthlyBudget', 0);
    const currency = ctx.ws.config?.defaults?.currency ?? '';

    const now = new Date();
    const monthStart = Date.UTC(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = Date.UTC(now.getFullYear(), now.getMonth() + 1, 1);

    let total = 0;
    for (const entity of entities) {
      const binding = entityTypeOf(ctx.ws, entity.type)?.capabilities?.budget;
      if (!binding) continue;
      if ((binding.excludeStatuses ?? []).includes(entity.status)) continue;
      const amount = entity.fields[binding.amountPerDay];
      if (!amount) continue;
      total += daysThisMonth(entity.fields, binding, monthStart, monthEnd) * amount;
    }

    const sym = currency === 'EUR' ? '€' : currency ? `${currency} ` : '';
    chip.classList.remove('ok', 'warn', 'over');
    chip.textContent = `${ctx.t('budget')}: ${sym}${Math.round(total)} / ${target ? `${sym}${target}` : ctx.t('set_target')}`;
    if (target) {
      chip.classList.add(total <= target * 0.85 ? 'ok' : total <= target ? 'warn' : 'over');
    }
  },
});
