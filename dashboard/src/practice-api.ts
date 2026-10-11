// The same /explain, /tts and /stt calls the extension's word lookup makes (extension/src/practice.ts).
import { BACKEND_URL, getSession, signOut } from './auth.ts';
import type { Language } from '../../shared/languages.ts';

export type Explanation = {
  gloss: string;
  grammar_note?: string;
  why_here?: string;
  example?: string;
  formality?: string;
};

export type Attempt = {
  transcript: string;
  score: number;
  words: { word: string; status: string; heard?: string }[];
  event_saved: boolean;
};

async function post(path: string, body: BodyInit, json: boolean, signal?: AbortSignal): Promise<Response> {
  const session = getSession();
  const response = await fetch(new URL(path, BACKEND_URL), {
    method: 'POST', body, signal,
    headers: { ...(json ? { 'Content-Type': 'application/json' } : {}), ...(session ? { Authorization: `Bearer ${session.token}` } : {}) },
  });
  if (response.status === 401) { signOut(); throw new Error('Please sign in again.'); }
  if (!response.ok) {
    const failure = await response.json().catch(() => ({}));
    throw new Error(failure.error ?? `${path} returned ${response.status}`);
  }
  return response;
}

// Saved words have no caption line, so the backend explains when the word is used in general.
const explanations = new Map<string, Promise<Explanation>>();
export function explain(word: string, translation: string | null, lang: Language): Promise<Explanation> {
  const key = JSON.stringify([lang, word, translation]);
  const cached = explanations.get(key);
  if (cached) return cached;
  const request = post('/explain', JSON.stringify({ phrase: word, source: translation ?? '', context: '', lang }), true)
    .then((r) => r.json() as Promise<Explanation>)
    .catch((error) => { explanations.delete(key); throw error; }); // failures stay retryable
  explanations.set(key, request);
  return request;
}

const speech = new Map<string, Promise<string>>();
/** Returns an object URL for the spoken text; kept for the session so replays are instant. */
export function speechUrl(text: string, speed: number, lang: Language): Promise<string> {
  const key = JSON.stringify([lang, text, speed]);
  const cached = speech.get(key);
  if (cached) return cached;
  const request = post('/tts', JSON.stringify({ text, speed, lang }), true)
    .then((r) => r.blob())
    .then((blob) => URL.createObjectURL(blob))
    .catch((error) => { speech.delete(key); throw error; });
  speech.set(key, request);
  return request;
}

export async function scoreAttempt(audio: Blob, target: string, lang: Language, video: { id: string | null; ts: number | null }): Promise<Attempt> {
  const form = new FormData();
  form.append('audio', audio, 'attempt.webm');
  form.append('target_text', target);
  form.append('lang', lang);
  form.append('attempt_id', crypto.randomUUID());
  if (video.id) form.append('video_id', video.id);
  if (video.ts != null) form.append('video_ts', String(video.ts));
  return (await post('/stt', form, false)).json() as Promise<Attempt>;
}
