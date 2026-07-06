/* Capability registry. Features are installable modules, not application
 * code: each module registers itself here and the shell mounts whichever
 * ones the active workspace's configuration enables. The engine has no idea
 * which capabilities exist.
 *
 * A capability implements (all optional except id):
 *   id                       stable identifier used in workspace config
 *   mount(ctx)               called once when a workspace session starts
 *   render(snapshot)         projection hook, called on every state change
 *   onEntityDelete(entity)   called just before an entity is deleted
 *
 * ctx (see main.js) exposes the workspace, its config, i18n, the toolbar,
 * editor action registration and the core entity actions. Capabilities are
 * projections: they never own data, they read the store and contribute UI. */

const capabilities = new Map();

export function registerCapability(cap) {
  capabilities.set(cap.id, cap);
}

export function getCapability(id) {
  return capabilities.get(id) ?? null;
}

export function allCapabilities() {
  return [...capabilities.values()];
}

export function enabledCapabilities(ws) {
  return (ws.config?.modules ?? []).map((id) => capabilities.get(id)).filter(Boolean);
}
