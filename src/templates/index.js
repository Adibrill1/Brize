import { travelTemplate } from './travel.js';
import { blankTemplate } from './blank.js';

export const templates = [travelTemplate, blankTemplate];

export function getTemplate(id) {
  return templates.find((t) => t.id === id) ?? blankTemplate;
}

/* A workspace is an independent universe: it owns its entities, events,
 * settings and configuration. The config block is plain data the user can
 * change at runtime — behavior is configured, not coded. The owner/members
 * fields are collaboration-ready placeholders; today everything is 'local'. */
export function workspaceFromTemplate(template, name) {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name,
    owner: 'local',
    members: [],
    createdAt: now,
    updatedAt: now,
    config: {
      template: template.id,
      modules: [...template.modules],
      views: [...(template.views ?? [])],
      entityTypes: structuredClone(template.entityTypes),
      defaults: { ...(template.defaults ?? {}) },
      ai: { enabled: true, requireApproval: true },
      rules: [],
      automations: [],
      theme: 'dark',
      offline: { persistStorage: true },
    },
  };
}
