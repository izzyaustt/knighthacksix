import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { clampSpeed, tts, voiceId } from './elevenlabs.ts';

const CACHE_DIR = join(import.meta.dirname, '..', '.cache', 'tts');

// Cache by hash of text + voice + speed, per the spec. Saves credits and makes repeat plays instant.
export async function cachedTts(text: string, speed = 1): Promise<{ audio: Buffer; cached: boolean }> {
  const s = clampSpeed(speed);
  const key = createHash('sha256').update(`${voiceId()}|${s}|${text}`).digest('hex');
  const file = join(CACHE_DIR, `${key}.mp3`);

  try {
    return { audio: await readFile(file), cached: true };
  } catch {
    const audio = await tts(text, s);
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(file, audio);
    return { audio, cached: false };
  }
}
