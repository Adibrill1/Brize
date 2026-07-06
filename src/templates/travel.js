/* Travel workspace template — the first application built on the platform.
 * Everything travel-specific lives here as data: the engine never mentions
 * trips, stays or parking. A template defines entity types, their fields and
 * statuses, and *capability bindings* that tell generic modules (map,
 * calendar, budget, ai…) which fields to read. */

const TRAVEL_STATUSES = [
  { id: 'idea', label: 'idea', color: '#8b93a7' },
  { id: 'planned', label: 'planned', color: '#e0a83a' },
  { id: 'booked', label: 'booked', color: '#39b374' },
  { id: 'done', label: 'done', color: '#5a8dee' },
];

const NOTES_FIELD = { key: 'notes', kind: 'textarea', label: 'notes', placeholder: 'notes_ph' };

export const travelTemplate = {
  id: 'travel',
  label: 'template_travel',
  modules: ['map', 'calendar', 'budget', 'ai', 'backup'],
  views: ['map'],
  defaults: { currency: 'EUR', center: [9.0, 48.5], zoom: 5 },
  entityTypes: [
    {
      id: 'stay',
      label: 'stay',
      icon: '⌂',
      statuses: TRAVEL_STATUSES,
      fields: [
        {
          key: 'stayType',
          kind: 'select',
          label: 'stay_type',
          default: 'housesit',
          options: [
            { value: 'housesit', label: 'housesit' },
            { value: 'airbnb', label: 'airbnb' },
            { value: 'camping', label: 'camping' },
            { value: 'glamping', label: 'glamping' },
            { value: 'friends', label: 'friends' },
            { value: 'other', label: 'other' },
          ],
        },
        { key: 'costPerNight', kind: 'number', label: 'cost_night', min: 0, step: 0.01 },
        { key: 'arrival', kind: 'date', label: 'arrival' },
        { key: 'departure', kind: 'date', label: 'departure' },
        { key: 'parkingNotes', kind: 'text', label: 'parking_notes', placeholder: 'parking_ph' },
        NOTES_FIELD,
      ],
      capabilities: {
        map: { lat: 'lat', lng: 'lng' },
        calendar: {
          start: 'arrival',
          end: 'departure',
          statuses: ['planned', 'booked'],
          subtitle: 'stayType',
        },
        budget: {
          amountPerDay: 'costPerNight',
          start: 'arrival',
          end: 'departure',
          excludeStatuses: ['idea'],
        },
        ai: {
          actions: [
            {
              id: 'outreach',
              label: 'draft_btn',
              busyLabel: 'drafting',
              dialogTitle: 'draft_title',
              system:
                'You draft short, warm, personal outreach messages from a traveler to a potential host ' +
                '(house sit, homestay, camping spot, or similar). The traveler reviews and sends the message ' +
                'personally — never imply automation. Write in the first person. Be specific to the details ' +
                'given, never invent facts, and keep it to 90-150 words. If the notes mention host names, ' +
                'pets, or listing details, weave them in naturally. Mention the vehicle only when parking ' +
                'or space is relevant. End with a light, easy-to-answer question. Output only the message ' +
                'text, no subject line, no preamble.',
              instruction: 'Draft an outreach message for this stay:',
            },
          ],
        },
      },
    },
    {
      id: 'poi',
      label: 'poi',
      icon: '★',
      statuses: TRAVEL_STATUSES,
      fields: [NOTES_FIELD],
      capabilities: {
        map: { lat: 'lat', lng: 'lng' },
      },
    },
    {
      id: 'parking',
      label: 'parking',
      icon: 'P',
      statuses: TRAVEL_STATUSES,
      fields: [
        { key: 'parkingNotes', kind: 'text', label: 'parking_notes', placeholder: 'parking_ph' },
        NOTES_FIELD,
      ],
      capabilities: {
        map: { lat: 'lat', lng: 'lng' },
      },
    },
  ],
};
