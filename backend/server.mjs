import 'dotenv/config';
import fs from 'fs';
import express from 'express';
import cors from 'cors';
import { alignBatch } from './align.mjs';

const app = express();
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

// Stub for now: ElevenLabs goes here later
app.post('/tts', (req, res) => res.status(501).json({ error: 'not implemented yet' }));

app.listen(3000, () => console.log('backend on http://localhost:3000'));