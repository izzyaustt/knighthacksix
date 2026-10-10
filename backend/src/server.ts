import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { stt } from './elevenlabs.ts';
import { cachedTts } from './ttsCache.ts';
import { scoreAttempt } from './scoring.ts';
import { events, mockStats, vocab } from './mocks.ts';

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

app.use(express.json({ limit: '2mb' }));

// Hackathon CORS: the extension and dashboard run on other origins.
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return void res.sendStatus(204);
  next();
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, elevenlabs: !!process.env.ELEVENLABS_API_KEY });
});

// --- ElevenLabs ---

app.post('/tts', async (req, res) => {
  const { text, speed } = req.body ?? {};
  if (typeof text !== 'string' || !text.trim()) return void res.status(400).json({ error: 'text is required' });

  const { audio, cached } = await cachedTts(text.trim(), Number(speed) || 1);
  res.set({ 'Content-Type': 'audio/mpeg', 'X-Cache': cached ? 'HIT' : 'MISS' }).send(audio);
});

app.post('/stt', upload.single('audio'), async (req, res) => {
  const target = req.body?.target_text;
  if (!req.file) return void res.status(400).json({ error: 'audio file is required' });
  if (typeof target !== 'string' || !target.trim()) {
    return void res.status(400).json({ error: 'target_text is required' });
  }

  const result = await stt(req.file.buffer, req.file.mimetype, req.body.lang || 'es');
  const { score, words } = scoreAttempt(target, result.text);
  res.json({ transcript: result.text, score, words });
});

// --- Tiger Data (in-memory until wired) ---

app.post('/events', (req, res) => {
  const { user_id, event_type } = req.body ?? {};
  if (!user_id || !event_type) return void res.status(400).json({ error: 'user_id and event_type are required' });
  events.push({ ...req.body, time: new Date().toISOString() });
  res.json({ ok: true });
});

app.post('/vocab', (req, res) => {
  const { user_id, word } = req.body ?? {};
  if (!user_id || !word) return void res.status(400).json({ error: 'user_id and word are required' });
  vocab.set(`${user_id}|${word}`, { ...req.body, status: 'new', saved_at: new Date().toISOString() });
  res.json({ ok: true });
});

app.get('/vocab', (req, res) => {
  const userId = req.query.user_id;
  res.json({ words: [...vocab.values()].filter((v) => v.user_id === userId) });
});

const days = (req: Request) => Number(req.query.days) || 14;

app.get('/stats/score-trend', (req, res) => void res.json(mockStats.scoreTrend(days(req))));
app.get('/stats/activity', (req, res) => void res.json(mockStats.activity(days(req))));
app.get('/stats/trouble-words', (req, res) => void res.json(mockStats.troubleWords(Number(req.query.limit) || 10)));
app.get('/stats/heatmap', (_req, res) => void res.json(mockStats.heatmap()));
app.get('/stats/recent', (req, res) => {
  const since = typeof req.query.since === 'string' ? req.query.since : '';
  const userId = req.query.user_id;
  res.json({ events: events.filter((e) => e.user_id === userId && e.time > since) });
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(502).json({ error: err.message });
});

const port = Number(process.env.PORT) || 8787;
app.listen(port, () => console.log(`backend listening on http://localhost:${port}`));
