const API = 'https://api.elevenlabs.io/v1';
const DEFAULT_VOICE = 'JBFqnCBsd6RMkjVDRZzb';

export const voiceId = () => process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE;

function apiKey() {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('ELEVENLABS_API_KEY is not set');
  return key;
}

// ElevenLabs accepts speeds between 0.7 and 1.2; below 1 is "say it slowly".
export const clampSpeed = (speed: number) => Math.min(1.2, Math.max(0.7, speed || 1));

export async function tts(text: string, speed = 1): Promise<Buffer> {
  const res = await fetch(`${API}/text-to-speech/${voiceId()}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey(), 'content-type': 'application/json' },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { speed: clampSpeed(speed) },
    }),
  });
  if (!res.ok) throw new Error(`ElevenLabs TTS ${res.status}: ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
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
  if (lang) form.append('language_code', lang);

  const res = await fetch(`${API}/speech-to-text`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey() },
    body: form,
  });
  if (!res.ok) throw new Error(`ElevenLabs STT ${res.status}: ${await res.text()}`);
  return res.json() as Promise<SttResult>;
}
