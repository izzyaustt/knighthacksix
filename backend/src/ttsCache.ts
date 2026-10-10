import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { clampSpeed, tts, voiceId, speechModel, speechSettings } from './elevenlabs.ts';

const CACHE_DIR = join(import.meta.dirname, '..', '.cache', 'tts');
const pending = new Map<string, Promise<{ audio: Buffer; cached: boolean }>>();

// Cache by hash of text + voice + speed, per the spec. Saves credits and makes repeat plays instant.
export async function cachedTts(text: string, speed = 1): Promise<{ audio: Buffer; cached: boolean }> {
  const s = clampSpeed(speed);
  const key = createHash('sha256').update(JSON.stringify([voiceId(), speechModel(), 'es', speechSettings(s), text])).digest('hex');
  const file = join(CACHE_DIR, `${key}.mp3`);
  if (pending.has(key)) return pending.get(key)!;
  const request = (async () => {
    try { return { audio: await readFile(file), cached: true }; } catch { /* Generate on cache miss. */ }
    const audio = await tts(text, s);
    try {
      await mkdir(CACHE_DIR, { recursive: true });
      await writeFile(file, audio);
    } catch { console.warn('TTS cache unavailable; returning generated audio.'); }
    return { audio, cached: false };
  })();
  pending.set(key, request);
  try { return await request; } finally { pending.delete(key); }
}
