/* Blank workspace template — a minimal, domain-free starting point that
 * proves the engine has no built-in domain. It ships one generic "item"
 * entity type; users shape the workspace from there via configuration. */

export const blankTemplate = {
  id: 'blank',
  label: 'template_blank',
  modules: ['map', 'backup'],
  views: ['map'],
  defaults: { center: [0, 20], zoom: 2 },
  entityTypes: [
    {
      id: 'item',
      label: 'item',
      icon: '●',
      statuses: [
        { id: 'open', label: 'open', color: '#8b93a7' },
        { id: 'active', label: 'active', color: '#e0a83a' },
        { id: 'closed', label: 'closed', color: '#5a8dee' },
      ],
      fields: [{ key: 'notes', kind: 'textarea', label: 'notes', placeholder: 'notes_ph' }],
      capabilities: {
        map: { lat: 'lat', lng: 'lng' },
      },
    },
  ],
};
