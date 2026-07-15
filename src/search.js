/* Geocoding search + deep links to accommodation sites.
 *
 * We deliberately do NOT scrape Airbnb / TrustedHousesitters / Booking:
 * they have no public API and their terms forbid automated access. Instead
 * we open the official site pre-filtered to the current map area and dates,
 * in a new tab — the user browses there and copies candidates back. This is
 * the same "manual, semi-automated" principle as the outreach drafts. */

// OpenStreetMap Nominatim — free, no API key. Usage policy: one request at a
// time, identify via the Referer the browser already sends.
export async function geocode(query) {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '5');
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`geocoding failed (HTTP ${res.status})`);
  const rows = await res.json();
  return rows.map((r) => ({
    label: r.display_name,
    lat: Number(r.lat),
    lng: Number(r.lon),
    // [minLng, minLat, maxLng, maxLat] when present
    bbox: r.boundingbox
      ? [Number(r.boundingbox[2]), Number(r.boundingbox[0]), Number(r.boundingbox[3]), Number(r.boundingbox[1])]
      : null,
  }));
}

// Reverse geocode a coordinate to a short place name for provider searches.
export async function reverseGeocode(lat, lng) {
  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.searchParams.set('lat', lat);
  url.searchParams.set('lon', lng);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('zoom', '10'); // city / town level
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`reverse geocoding failed (HTTP ${res.status})`);
  const r = await res.json();
  const a = r.address || {};
  return a.city || a.town || a.village || a.county || a.state || r.name || r.display_name || '';
}

// Each provider builds a search URL for a place name + optional dates.
// Kept as simple public search URLs — no login, no scraping.
export const PROVIDERS = [
  {
    id: 'airbnb',
    label: 'Airbnb',
    build: ({ place, arrival, departure }) => {
      const u = new URL(`https://www.airbnb.com/s/${encodeURIComponent(place)}/homes`);
      if (arrival) u.searchParams.set('checkin', arrival);
      if (departure) u.searchParams.set('checkout', departure);
      return u.toString();
    },
  },
  {
    id: 'trustedhousesitters',
    label: 'TrustedHousesitters',
    build: ({ place }) =>
      `https://www.trustedhousesitters.com/house-and-pet-sitting-assignments/?location=${encodeURIComponent(place)}`,
  },
  {
    id: 'booking',
    label: 'Booking.com',
    build: ({ place, arrival, departure }) => {
      const u = new URL('https://www.booking.com/searchresults.html');
      u.searchParams.set('ss', place);
      if (arrival) u.searchParams.set('checkin', arrival);
      if (departure) u.searchParams.set('checkout', departure);
      return u.toString();
    },
  },
  {
    id: 'park4night',
    label: 'Park4night',
    build: ({ lat, lng }) => `https://park4night.com/en/search?lat=${lat}&lng=${lng}`,
  },
];

// Infer which site a pasted listing URL came from, for the candidate's badge.
export function detectSource(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const match = PROVIDERS.find((p) => host.includes(p.id) || (p.id === 'trustedhousesitters' && host.includes('trusted')));
    if (match) return match.label;
    return host;
  } catch {
    return '';
  }
}
