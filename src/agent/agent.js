// The abbreviation agent. It reads a piece of a page and says which
// abbreviations are in it and what each one stands for there. Nothing in the
// extension lists abbreviations; this is where every meaning comes from,
// apart from the ones a page defines itself.
//
// Two models can do the reading:
// - "device": Chrome's built-in model (the Prompt API, Gemini Nano). Free,
//   and the text stays on this computer. The default.
// - "claude": Claude Haiku 5.5 through the Anthropic API, with an API key
//   the user brings. Better answers, and it works on any computer, but the
//   text goes to Anthropic.
// Without either, read() returns null and the page gets no bubbles.
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

export const CLAUDE_MODEL = 'claude-haiku-5-5';

const Found = z.object({
  abbreviations: z.array(
    z.object({
      term: z.string().describe('The abbreviation exactly as it is written in the text'),
      stands_for: z.string().describe('The words its letters stand for in this text'),
      gloss: z.string().describe('A short plain-English meaning when stands_for alone does not explain it, else empty'),
    }),
  ),
});

export const SYSTEM = [
  'You find abbreviations in a piece of a web page so a reader can see what they stand for.',
  'Include every acronym, initialism and shortened form, even well-known ones: capital forms such as API or SaaS,',
  'forms with dots or semicolons such as e.g., a.k.a. or TL;DR, and lowercase chat forms such as imo, tbh or lgtm.',
  'For each one, give the term exactly as written, the words its letters stand for as used in this text,',
  'and a short gloss only when those words do not explain it (for Latin forms, or a name that is only letters).',
  'Choose the meaning that fits this text: CI is Continuous Integration in a build log and Confidence Interval in a statistics paper.',
  'Leave out ordinary words, words written in capitals for emphasis, and names that are not abbreviations.',
  'Leave out any abbreviation you are not sure of. An empty list is a good answer.',
].join(' ');

const question = ({ text, title }) => [title && `Page title: ${title}`, 'Text:', text].filter(Boolean).join('\n');

// What the extension keeps from an answer: terms that are really in the text,
// and whose words spell their letters (checked again in the content script).
function clean(list, text) {
  const out = [];
  for (const a of list || []) {
    const term = String(a.term || '').trim();
    const standsFor = String(a.stands_for || '').trim();
    if (!term || !standsFor || term.length > 16 || !text.includes(term)) continue;
    out.push({ term, standsFor, gloss: String(a.gloss || '').trim() });
  }
  return out;
}

// ── Chrome's on-device model ──

const LM = { expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] };
const SCHEMA = z.toJSONSchema(Found);

export async function deviceStatus() {
  if (typeof LanguageModel === 'undefined') return 'unavailable';
  try {
    return await LanguageModel.availability(LM);
  } catch {
    return 'unavailable';
  }
}

// A session with the system prompt, cloned for each question. Only a cache:
// a worker that stops loses it, and the next question makes a new one.
let base = null;
function session() {
  base =
    base ||
    (async () => {
      try {
        return await LanguageModel.create({ ...LM, initialPrompts: [{ role: 'system', content: SYSTEM }] });
      } catch (err) {
        base = null;
        throw err;
      }
    })();
  return base;
}

async function readOnDevice(input) {
  if ((await deviceStatus()) !== 'available') return null;
  const s = await (await session()).clone();
  try {
    const out = JSON.parse(await s.prompt(question(input), { responseConstraint: SCHEMA }));
    return clean(out.abbreviations, input.text);
  } finally {
    s.destroy();
  }
}

// ── Claude Haiku, with the user's key ──

// baseURL is for the test suite's stand-in server; users never set it.
async function readWithClaude(input, { apiKey, baseURL }) {
  if (!apiKey) return null;
  const client = new Anthropic({ apiKey, baseURL: baseURL || undefined, dangerouslyAllowBrowser: true, maxRetries: 1 });
  const response = await client.messages.parse({
    model: CLAUDE_MODEL,
    max_tokens: 8000,
    system: SYSTEM,
    messages: [{ role: 'user', content: question(input) }],
    output_config: { effort: 'low', format: zodOutputFormat(Found) },
  });
  if (response.stop_reason === 'refusal' || !response.parsed_output) return [];
  return clean(response.parsed_output.abbreviations, input.text);
}

// The abbreviations in input.text, as [{ term, standsFor, gloss }], or null
// when no model is available. Errors from Claude carry a short reason the
// popup shows: 'key' for a rejected key, 'limit' for rate limits.
export async function read(input, { agent, apiKey, baseURL }) {
  if (agent !== 'claude') return readOnDevice(input);
  try {
    return await readWithClaude(input, { apiKey, baseURL });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) throw Object.assign(new Error('key'), { reason: 'key' });
    if (err instanceof Anthropic.RateLimitError) throw Object.assign(new Error('limit'), { reason: 'limit' });
    throw err;
  }
}
