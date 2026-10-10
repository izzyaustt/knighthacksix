import { GoogleGenAI } from '@google/genai';

// LLM_PROVIDER=ollama uses a local Ollama model (free, for local testing only).
// Anything else, including unset, uses Gemini.
export const provider = () => (process.env.LLM_PROVIDER?.trim().toLowerCase() === 'ollama' ? 'ollama' : 'gemini');

let gemini;

// Gemini schemas use upper-case type names; JSON Schema (Ollama) wants lower-case.
function jsonSchema(schema) {
  if (Array.isArray(schema)) return schema.map(jsonSchema);
  if (!schema || typeof schema !== 'object') return schema;
  return Object.fromEntries(Object.entries(schema).map(([k, v]) =>
    [k, k === 'type' && typeof v === 'string' ? v.toLowerCase() : jsonSchema(v)]));
}

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
        model, stream: false, format, options: { temperature },
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
