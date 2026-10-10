import { GoogleGenAI } from '@google/genai';

export function getAIConfig(env = process.env) {
  const provider = (env.AI_PROVIDER || env.LLM_PROVIDER || 'gemini').trim().toLowerCase();
  if (!['gemini', 'ollama'].includes(provider)) throw new Error('AI_PROVIDER must be gemini or ollama.');
  const model = provider === 'gemini' ? (env.GEMINI_MODEL || 'gemini-3.8-flash') : (env.OLLAMA_MODEL || 'qwen2.5:3b');
  let baseUrl;
  if (provider === 'ollama') {
    const url = new URL(env.OLLAMA_BASE_URL || env.OLLAMA_URL || 'http://127.0.0.1:11434');
    if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
      throw new Error('OLLAMA_BASE_URL must be a local HTTP origin, such as http://127.0.0.1:11434.');
    }
    if (model.endsWith(':cloud')) throw new Error('Choose a local OLLAMA_MODEL, not a :cloud model.');
    baseUrl = url.origin;
  }
  return { provider, model, baseUrl, batchSize: provider === 'ollama' ? 3 : 30 };
}

export function aiCacheKey(config = getAIConfig()) {
  return JSON.stringify(['v2', config.provider, config.model, config.baseUrl ?? '']);
}

// Both providers return the same JSON contract. Never fall back to a paid provider.
export async function generateJSON({ system, contents, schema, maxOutputTokens }, {
  config = getAIConfig(), fetchImpl = fetch,
  geminiFactory = options => new GoogleGenAI(options),
} = {}) {
  let text;
  if (config.provider === 'ollama') {
    let response;
    try {
      response = await fetchImpl(`${config.baseUrl}/api/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(45000),
        body: JSON.stringify({ model: config.model, stream: false, think: false,
          messages: [{ role: 'system', content: system }, { role: 'user', content: contents }],
          format: schema, options: { temperature: 0.2, num_ctx: 8192, num_predict: maxOutputTokens ?? 2048 },
        }),
      });
    } catch (error) {
      if (error.name === 'TimeoutError') throw new Error('Ollama took too long. Try a smaller model or fewer captions.');
      throw new Error('Cannot reach Ollama. Open the Ollama app or run ollama serve, then retry.');
    }
    if (!response.ok) {
      if (response.status === 404) throw new Error(`Ollama model not found. Run: ollama pull ${config.model}`);
      throw new Error(`Ollama returned HTTP ${response.status}. Check its logs and local model.`);
    }
    text = (await response.json()).message?.content;
  } else {
    if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is required when AI_PROVIDER=gemini.');
    const client = geminiFactory({ apiKey: process.env.GEMINI_API_KEY, httpOptions: { timeout: 45000 } });
    const response = await client.models.generateContent({ model: config.model, contents,
      config: { systemInstruction: system, temperature: 0.2, responseMimeType: 'application/json', responseJsonSchema: schema,
        ...(maxOutputTokens ? { maxOutputTokens } : {}) },
    });
    text = response.text;
  }
  if (typeof text !== 'string' || !text.trim()) throw new Error(`${config.provider} returned an empty response.`);
  try { return JSON.parse(text); }
  catch { throw new Error(`${config.provider} returned invalid JSON. Retry the request.`); }
}
