import type { Language } from '../../shared/languages.ts';
const API = 'https://api.elevenlabs.io/v1';
const DEFAULT_VOICE = 'JBFqnCBsd6RMkjVDRZzb';

export const voiceId = () => process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE;
export const speechModel = () => process.env.ELEVENLABS_TTS_MODEL || 'eleven_flash_v2_5';
export const speechSettings = (speed = 1) => ({ stability: 0.65, similarity_boost: 0.75, style: 0, speed: clampSpeed(speed) });

function providerError(status: number) {
  if (status === 401 || status === 403) return new Error('ElevenLabs access unavailable. Check the server API key and voice permissions.');
  if (status === 429) return new Error('ElevenLabs is busy or the account has reached its limit. Try again shortly.');
  return new Error(`ElevenLabs could not complete the audio request (${status}). Try again.`);
}
async function audioRequest(url: string, options: RequestInit) {
  try { return await fetch(url, options); }
  catch (error) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new Error('ElevenLabs took too long to respond. Try again.');
    }
    throw new Error('Could not reach ElevenLabs. Check the backend connection and try again.');
  }
}

function apiKey() {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('ELEVENLABS_API_KEY is not set');
  return key;
}

// Keep practice playback in a comfortable learning range.
export const clampSpeed = (speed: number) => Math.min(1.2, Math.max(0.7, speed || 1));

export async function tts(text: string, speed = 1, lang: Language = 'es'): Promise<Buffer> {
  const res = await audioRequest(`${API}/text-to-speech/${voiceId()}?output_format=mp3_44100_128`, {
    method: 'POST',
    signal: AbortSignal.timeout(30000),
    headers: { 'xi-api-key': apiKey(), 'content-type': 'application/json' },
    body: JSON.stringify({
      text,
      model_id: speechModel(),
      language_code: lang,
      voice_settings: speechSettings(speed),
    }),
  });
  if (!res.ok) throw providerError(res.status);
  const audio = Buffer.from(await res.arrayBuffer());
  if (!audio.length) throw new Error('ElevenLabs returned empty audio. Try again.');
  return audio;
}

export interface SttResult {
  text: string;
  language_code: string;
  words: { text: string; type: string; start: number; end: number }[];
}

export async function stt(audio: Buffer, mimeType: string, lang?: string): Promise<SttResult> {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(audio)], { type: mimeType }), 'attempt');
  form.append('model_id', 'scribe_v2');
  form.append('tag_audio_events', 'false');
  form.append('diarize', 'false');
  if (lang) form.append('language_code', lang);

  const res = await audioRequest(`${API}/speech-to-text`, {
    method: 'POST',
    signal: AbortSignal.timeout(60000),
    headers: { 'xi-api-key': apiKey() },
    body: form,
  });
  if (!res.ok) throw providerError(res.status);
  const result = await res.json() as SttResult;
  if (typeof result.text !== 'string' || !result.text.trim()) throw new Error('No speech was detected. Speak closer to your microphone and try again.');
  return result;
}
