import Anthropic from '@anthropic-ai/sdk';
import { registerCapability } from '../core/registry.js';
import { getSetting, setSetting, getWorkspaceSetting } from '../core/settings.js';

/* AI capability. Two hard rules, enforced by design:
 *   1. AI never owns state — structured changes go through core/proposals.js
 *      (propose → human approves → reversible events with actor 'ai').
 *   2. AI actions are configuration, not code: entity types declare them in
 *      their `ai` capability binding (system prompt included), so the engine
 *      ships zero domain prompts. Text actions like the travel template's
 *      outreach draft only ever produce a draft the user copies personally.
 *
 * The app is a static site with no backend, so the Anthropic API key lives
 * only in this device's IndexedDB and requests go straight from the browser
 * to the API. The key is never committed, synced, or sent anywhere else. */

const MODEL = 'claude-opus-4-8';

async function ensureApiKey(t) {
  let key = await getSetting('anthropicApiKey', '');
  if (!key) {
    key = window.prompt(t('key_prompt'));
    if (!key || !key.trim()) return null;
    key = key.trim();
    await setSetting('anthropicApiKey', key);
  }
  return key;
}

export async function clearApiKey() {
  await setSetting('anthropicApiKey', '');
}

function entityDetails(ctx, entity, type) {
  const status = type?.statuses?.find((s) => s.id === entity.status);
  return [
    entity.name && `Name: ${entity.name}`,
    status && `Status: ${ctx.t(status.label)}`,
    ...Object.entries(entity.fields ?? {})
      .filter(([, value]) => value !== null && value !== '')
      .map(([key, value]) => `${key}: ${typeof value === 'number' && !Number.isInteger(value) ? value.toFixed(3) : value}`),
  ]
    .filter(Boolean)
    .join('\n');
}

async function runTextAction(ctx, action, entity, type) {
  const apiKey = await ensureApiKey(ctx.t);
  if (!apiKey) throw new Error('no API key provided');
  const about = await getWorkspaceSetting(ctx.ws.id, 'aboutMe', '');

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  let response;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 8192,
      thinking: { type: 'adaptive' },
      system: action.system,
      messages: [
        {
          role: 'user',
          content: `${about ? `About me: ${about}\n\n` : ''}${action.instruction}\n${entityDetails(ctx, entity, type)}`,
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

registerCapability({
  id: 'ai',

  mount(ctx) {
    if (ctx.ws.config?.ai?.enabled === false) return;

    const dialog = document.getElementById('draft-dialog');
    const textarea = document.getElementById('draft-text');
    document.getElementById('draft-close').addEventListener('click', () => dialog.close());
    document.getElementById('draft-copy').addEventListener('click', async (e) => {
      await navigator.clipboard.writeText(textarea.value);
      e.target.textContent = ctx.t('copied');
      setTimeout(() => (e.target.textContent = ctx.t('copy')), 1500);
    });

    ctx.registerEditorAction({
      id: 'ai',
      actionsFor: (type) => type?.capabilities?.ai?.actions ?? [],
      async run(action, entity, type, button) {
        button.disabled = true;
        button.textContent = ctx.t(action.busyLabel ?? action.label);
        try {
          const text = await runTextAction(ctx, action, entity, type);
          document.getElementById('draft-title').textContent = ctx.t(action.dialogTitle ?? 'draft_title');
          textarea.value = text;
          dialog.showModal();
        } catch (err) {
          alert(ctx.t('draft_failed', { msg: err.message }));
        } finally {
          button.disabled = false;
          button.textContent = `✨ ${ctx.t(action.label)}`;
        }
      },
    });
  },
});
