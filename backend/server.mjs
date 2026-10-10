import './env.mjs';
import fs from 'fs';
import { createHash } from 'node:crypto';
import { aiCacheKey, getAIConfig } from './ai-provider.mjs';
import { explainPhrase } from './explain.mjs';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { alignBatch } from './align.mjs';
import { stt } from './src/elevenlabs.ts';
import { cachedTts } from './src/ttsCache.ts';
import { scoreAttempt } from './src/scoring.ts';
import { createPool } from './database.mjs';
import { createDataRouter, createAttemptHandler } from './data-routes.mjs';

const app = express();
const aiConfig = getAIConfig();
const pool = createPool();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const CACHE_FILE = new URL('./.cache/align.json', import.meta.url);
fs.mkdirSync(new URL('./.cache/', import.meta.url), { recursive: true });
const cache = new Map(fs.existsSync(CACHE_FILE) ? Object.entries(JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'))) : []);
const save = () => fs.writeFileSync(CACHE_FILE, JSON.stringify(Object.fromEntries(cache)));

app.post('/align', async (req, res) => {
  const { videoId, lang = 'es', level = 'medium', startIndex = 0, lines } = req.body ?? {};
  if (typeof videoId !== 'string' || !videoId.trim() || !Array.isArray(lines) || !lines.length || lines.length > 30 ||
      lines.some(l => typeof l?.text !== 'string' || !l.text.trim() || l.text.length > 2000 ||
        !Number.isFinite(l.start) || !Number.isFinite(l.end) || l.start < 0 || l.end <= l.start) ||
      !Number.isInteger(startIndex) || startIndex < 0 || lang !== 'es' || !['easy', 'medium', 'hard'].includes(level)) {
    return res.status(400).json({ error: 'Provide 1–30 timed caption lines, a videoId, lang=es, and a valid level/startIndex.' });
  }

  if (process.env.MOCK === '1') {
    return res.json({ startIndex, lines: lines.map((l) => ({
      start: l.start, end: l.end, source: l.text, target: `[ES] ${l.text}`,
      pairs: [{ src: l.text.split(' ')[0], tgt: '[ES]', srcStart: 0, tgtStart: 0, color: 0 }],
    })) });
  }

  const digest = createHash('sha256').update(JSON.stringify(lines)).digest('hex');
  const key = `${aiCacheKey(aiConfig)}|${videoId}|${lang}|${level}|${startIndex}|${digest}`;
  if (cache.has(key)) return res.json({ startIndex, lines: cache.get(key), cached: true });

  const aligned = await alignBatch(lines, { level });
  if (!aligned.every(l => typeof l.target === 'string' && l.target.trim())) return res.status(502).json({ error: 'Translation provider returned an incomplete batch. Retry the request.' });
  cache.set(key, aligned); save(); // cache only complete batches
  res.json({ startIndex, lines: aligned });
});

app.post('/explain', async (req, res) => {
  const { phrase, source = '', context = '', lang = 'es', word_lookup = false, word_lang = 'es', detail = 'full' } = req.body ?? {};
  if (typeof phrase !== 'string' || !phrase.trim() || phrase.length > 2000 ||
      typeof source !== 'string' || source.length > 2000 || typeof context !== 'string' || context.length > 10000 || lang !== 'es' ||
      typeof word_lookup !== 'boolean' || !['en', 'es'].includes(word_lang) || !['brief', 'full'].includes(detail)) {
    return res.status(400).json({ error: 'A Spanish phrase (up to 2000 characters) is required.' });
  }
  if (process.env.MOCK === '1') return res.json({ gloss: source || 'Mock explanation', grammar_note: 'Mock mode: no Gemini request was made.', why_here: 'Mock mode: no context explanation.', example: phrase, formality: 'Demo', pronunciation: '', ...(word_lookup ? { translation: `[mock] ${phrase}` } : {}) });
  res.json(await explainPhrase({ phrase: phrase.trim(), source, context, word_lookup, word_lang, detail }));
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, llm: aiConfig.provider, elevenlabs: !!process.env.ELEVENLABS_API_KEY, gemini: !!process.env.GEMINI_API_KEY,
    ai: { provider: process.env.MOCK === '1' ? 'mock' : aiConfig.provider, model: aiConfig.model, batch_size: aiConfig.batchSize } });
});

// --- ElevenLabs ---

app.post('/tts', async (req, res) => {
  const { text, speed } = req.body ?? {};
  if (typeof text !== 'string' || !text.trim()) return res.status(400).json({ error: 'text is required' });
  if (text.length > 2000) return res.status(400).json({ error: 'Practice text must be 2,000 characters or fewer' });
  if (speed !== undefined && (typeof speed !== 'number' || !Number.isFinite(speed))) return res.status(400).json({ error: 'speed must be a number' });

  const { audio, cached } = await cachedTts(text.trim(), Number(speed) || 1);
  res.set({ 'Content-Type': 'audio/mpeg', 'X-Cache': cached ? 'HIT' : 'MISS' }).send(audio);
});

app.post('/stt', upload.single('audio'), createAttemptHandler(pool, { stt, scoreAttempt }));

// --- Tiger Data ---
app.use(createDataRouter(pool));

// Provider failures (ElevenLabs, Gemini) come back as JSON instead of an HTML error page.
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(502).json({ error: err.message });
});

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
const server = app.listen(port, host, () => console.log(`backend on ${host}:${port} · AI: ${process.env.MOCK === '1' ? 'mock' : aiConfig.provider} (${aiConfig.model})`));
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => server.close(() => pool.end().then(() => process.exit(0))));
}
