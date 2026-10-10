// Compatibility entry point for Simone's integration. One shared provider implementation
// keeps cache identity, defaults and local-only behavior consistent across the backend.
import { generateJSON, getAIConfig } from './ai-provider.mjs';
export const provider = () => getAIConfig().provider;
function jsonSchema(value) {
  if (Array.isArray(value)) return value.map(jsonSchema);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([k, v]) =>
    [k, k === 'type' && typeof v === 'string' ? v.toLowerCase() : jsonSchema(v)]));
}
<<<<<<< HEAD

async function ollama({ system, contents, schema, temperature }) {
  const base = (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/+$/, '');
  const model = process.env.OLLAMA_MODEL || 'gemma3:4b';
  // Wrap the schema in an object so array-rooted schemas are constrained reliably.
  const format = { type: 'object', properties: { result: jsonSchema(schema) }, required: ['result'] };
  let res;
  try {
    res = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model, stream: false, format, options: { temperature, num_ctx: 8192 },
        messages: [{ role: 'system', content: system }, { role: 'user', content: contents }],
      }),
      signal: AbortSignal.timeout(110000),
    });
  } catch (e) {
    throw new Error(e.name === 'TimeoutError' ? `Ollama (${model}) timed out.`
      : `Cannot reach Ollama at ${base}. Start it with "ollama serve".`);
  }
  if (!res.ok) {
    const failure = await res.json().catch(() => ({}));
    throw new Error(`Ollama ${res.status}: ${failure.error ?? 'request failed'}${res.status === 404 ? ` (run "ollama pull ${model}")` : ''}`);
  }
  return JSON.parse((await res.json()).message.content).result;
}

// Returns the parsed JSON value the model produced for `schema` (a Gemini-style response schema).
export async function generateJson({ system, contents, schema, temperature = 0.2 }) {
  if (provider() === 'ollama') return ollama({ system, contents, schema, temperature });
  gemini ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const res = await gemini.models.generateContent({
    model: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
    contents,
    config: { systemInstruction: system, temperature, responseMimeType: 'application/json', responseSchema: schema },
  });
  return JSON.parse(res.text);
}
=======
export const generateJson = ({ system, contents, schema }) => generateJSON({ system, contents, schema: jsonSchema(schema) });
>>>>>>> 3440fc2aa22654691a42c0d7c5fb16ee68108306
