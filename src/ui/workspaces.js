import { listWorkspaces, createWorkspace, deleteWorkspace, setActiveWorkspaceId } from '../core/workspaces.js';
import { templates } from '../templates/index.js';

/* Workspace switcher. Each workspace is an independent universe, so
 * switching simply re-boots the shell into the other one — the cheapest
 * correct way to guarantee no state leaks between worlds. */

export function initWorkspaceUI(ws, t, toolbar) {
  const chip = document.createElement('button');
  chip.id = 'workspace-chip';
  chip.className = 'chip';
  chip.textContent = `🌐 ${ws.name}`;
  toolbar(chip);

  const dialog = document.getElementById('workspace-dialog');
  const list = document.getElementById('workspace-list');
  const form = document.getElementById('workspace-form');

  const templateSelect = form.elements.template;
  templateSelect.textContent = '';
  for (const template of templates) {
    const o = document.createElement('option');
    o.value = template.id;
    o.textContent = t(template.label);
    templateSelect.append(o);
  }

  async function renderList() {
    const all = await listWorkspaces();
    list.textContent = '';
    for (const w of all) {
      const row = document.createElement('div');
      row.className = 'workspace-row';

      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'workspace-open' + (w.id === ws.id ? ' active' : '');
      open.textContent = w.name;
      open.addEventListener('click', async () => {
        if (w.id !== ws.id) {
          await setActiveWorkspaceId(w.id);
          location.reload();
        } else {
          dialog.close();
        }
      });
      row.append(open);

      if (all.length > 1) {
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'icon-btn danger';
        del.setAttribute('aria-label', t('delete'));
        del.textContent = '🗑';
        del.addEventListener('click', async () => {
          if (!confirm(t('confirm_delete_workspace', { name: w.name }))) return;
          await deleteWorkspace(w.id);
          if (w.id === ws.id) {
            location.reload();
          } else {
            renderList();
          }
        });
        row.append(del);
      }
      list.append(row);
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = form.elements.wsname.value.trim();
    if (!name) return;
    const created = await createWorkspace(name, templateSelect.value);
    await setActiveWorkspaceId(created.id);
    location.reload();
  });

  document.getElementById('workspace-close').addEventListener('click', () => dialog.close());

  chip.addEventListener('click', async () => {
    form.elements.wsname.value = '';
    await renderList();
    dialog.showModal();
  });
}
