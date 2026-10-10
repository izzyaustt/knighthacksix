import './env.mjs';
import fs from 'fs';
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
  if (!videoId || !Array.isArray(lines) || !lines.length) return res.status(400).json({ error: 'videoId and lines required' });

  if (process.env.MOCK === '1') {
    return res.json({ startIndex, lines: lines.map((l) => ({
      start: l.start, end: l.end, source: l.text, target: `[ES] ${l.text}`,
      pairs: [{ src: l.text.split(' ')[0], tgt: '[ES]', srcStart: 0, tgtStart: 0, color: 0 }],
    })) });
  }

  const key = `${videoId}|${lang}|${level}|${startIndex}`;
  if (cache.has(key)) return res.json({ startIndex, lines: cache.get(key), cached: true });

  const aligned = await alignBatch(lines, { level });
  if (aligned.some((l) => l.target)) { cache.set(key, aligned); save(); } // never cache a failed batch
  res.json({ startIndex, lines: aligned });
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, elevenlabs: !!process.env.ELEVENLABS_API_KEY, gemini: !!process.env.GEMINI_API_KEY });
});

// --- ElevenLabs ---

app.post('/tts', async (req, res) => {
  const { text, speed } = req.body ?? {};
  if (typeof text !== 'string' || !text.trim()) return res.status(400).json({ error: 'text is required' });

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
const server = app.listen(port, '127.0.0.1', () => console.log(`backend on http://localhost:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => server.close(() => pool.end().then(() => process.exit(0))));
}
