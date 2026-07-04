import Anthropic from '@anthropic-ai/sdk';
import { getSetting, setSetting } from './db.js';

/* The app is a static site with no backend, so the Anthropic API key lives
 * only in this device's IndexedDB and requests go straight from the browser
 * to the API. The key is never committed, synced, or sent anywhere else. */

const MODEL = 'claude-opus-4-8';

async function ensureApiKey() {
  let key = await getSetting('anthropicApiKey', '');
  if (!key) {
    key = window.prompt(
      'Paste your Anthropic API key (starts with "sk-ant-").\n' +
        'It is stored only on this device and sent only to api.anthropic.com.',
    );
    if (!key || !key.trim()) return null;
    key = key.trim();
    await setSetting('anthropicApiKey', key);
  }
  return key;
}

async function ensureAboutMe() {
  let about = await getSetting('aboutMe', null);
  if (about === null) {
    about =
      window.prompt(
        'One-time setup: describe yourself in a sentence or two, for personalized host messages.\n' +
          '(e.g. "Creative AI artist traveling Europe for two years in a Toyota Land Cruiser…")',
      ) || '';
    await setSetting('aboutMe', about);
  }
  return about;
}

export async function clearApiKey() {
  await setSetting('anthropicApiKey', '');
}

export async function draftOutreach(stop) {
  const apiKey = await ensureApiKey();
  if (!apiKey) throw new Error('no API key provided');
  const aboutMe = await ensureAboutMe();

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  const details = [
    stop.name && `Place: ${stop.name}`,
    stop.stayType && `Stay type: ${stop.stayType}`,
    stop.arrival && stop.departure && `Dates: ${stop.arrival} to ${stop.departure}`,
    `Location (lat, lng): ${stop.lat.toFixed(3)}, ${stop.lng.toFixed(3)}`,
    stop.parkingNotes && `Vehicle/parking notes: ${stop.parkingNotes}`,
    stop.notes && `My notes about this place/host: ${stop.notes}`,
  ]
    .filter(Boolean)
    .join('\n');

  let response;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 8192,
      thinking: { type: 'adaptive' },
      system:
        'You draft short, warm, personal outreach messages from a traveler to a potential host ' +
        '(house sit, homestay, camping spot, or similar). The traveler reviews and sends the message ' +
        'personally — never imply automation. Write in the first person. Be specific to the details ' +
        'given, never invent facts, and keep it to 90-150 words. If the notes mention host names, ' +
        'pets, or listing details, weave them in naturally. Mention the vehicle only when parking ' +
        'or space is relevant. End with a light, easy-to-answer question. Output only the message ' +
        'text, no subject line, no preamble.',
      messages: [
        {
          role: 'user',
          content: `About me: ${aboutMe || 'A traveler on a long-term overland journey across Europe.'}\n\nDraft an outreach message for this stay:\n${details}`,
        },
      ],
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      await clearApiKey();
      throw new Error('the API key was rejected — it has been cleared, try again with a new one');
    }
    if (err instanceof Anthropic.APIConnectionError) {
      throw new Error('could not reach the Claude API — are you online?');
    }
    throw err;
  }

  if (response.stop_reason === 'refusal') {
    throw new Error('the request was declined — try rephrasing the notes');
  }
  return response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
}
