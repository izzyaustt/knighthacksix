import 'dotenv/config';
import fs from 'fs';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { alignBatch } from './align.mjs';
import { stt } from './src/elevenlabs.ts';
import { cachedTts } from './src/ttsCache.ts';
import { scoreAttempt } from './src/scoring.ts';
import { events, mockStats, vocab } from './src/mocks.ts';

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const CACHE_FILE = new URL('./cache/align.json', import.meta.url);
fs.mkdirSync(new URL('./cache/', import.meta.url), { recursive: true });
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

app.post('/stt', upload.single('audio'), async (req, res) => {
  const target = req.body?.target_text;
  if (!req.file) return res.status(400).json({ error: 'audio file is required' });
  if (typeof target !== 'string' || !target.trim()) return res.status(400).json({ error: 'target_text is required' });

  const result = await stt(req.file.buffer, req.file.mimetype, req.body.lang || 'es');
  const { score, words } = scoreAttempt(target, result.text);
  res.json({ transcript: result.text, score, words });
});

// --- Tiger Data (in-memory until wired) ---

app.post('/events', (req, res) => {
  const { user_id, event_type } = req.body ?? {};
  if (!user_id || !event_type) return res.status(400).json({ error: 'user_id and event_type are required' });
  events.push({ ...req.body, time: new Date().toISOString() });
  res.json({ ok: true });
});

app.post('/vocab', (req, res) => {
  const { user_id, word } = req.body ?? {};
  if (!user_id || !word) return res.status(400).json({ error: 'user_id and word are required' });
  vocab.set(`${user_id}|${word}`, { ...req.body, status: 'new', saved_at: new Date().toISOString() });
  res.json({ ok: true });
});

app.get('/vocab', (req, res) => {
  res.json({ words: [...vocab.values()].filter((v) => v.user_id === req.query.user_id) });
});

const days = (req) => Number(req.query.days) || 14;

app.get('/stats/score-trend', (req, res) => res.json(mockStats.scoreTrend(days(req))));
app.get('/stats/activity', (req, res) => res.json(mockStats.activity(days(req))));
app.get('/stats/trouble-words', (req, res) => res.json(mockStats.troubleWords(Number(req.query.limit) || 10)));
app.get('/stats/heatmap', (_req, res) => res.json(mockStats.heatmap()));
app.get('/stats/recent', (req, res) => {
  const since = typeof req.query.since === 'string' ? req.query.since : '';
  res.json({ events: events.filter((e) => e.user_id === req.query.user_id && e.time > since) });
});

// Provider failures (ElevenLabs, Gemini) come back as JSON instead of an HTML error page.
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(502).json({ error: err.message });
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`backend on http://localhost:${port}`));