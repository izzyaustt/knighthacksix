import test from 'node:test';
import assert from 'node:assert/strict';
import { tts, stt } from '../src/elevenlabs.ts';
import { cachedTts } from '../src/ttsCache.ts';
import { scoreAttempt } from '../src/scoring.ts';

test('Spanish audio settings, safe provider failures, and speech-only transcription', async () => {
  const oldFetch = globalThis.fetch, oldKey = process.env.ELEVENLABS_API_KEY;
  process.env.ELEVENLABS_API_KEY = 'test-only';
  try {
    globalThis.fetch = async (_url, request) => {
      assert.ok(request.signal);
      const body = JSON.parse(request.body);
      assert.equal(body.language_code, 'es');
      assert.equal(body.voice_settings.speed, 0.7);
      assert.equal(body.voice_settings.stability, 0.65);
      return new Response('audio');
    };
    assert.equal((await tts('Hola', 0.1)).toString(), 'audio');
    globalThis.fetch = async () => new Response('private provider details', { status: 401 });
    await assert.rejects(tts('Hola'), /Check the server API key/);
    globalThis.fetch = async (_url, request) => {
      assert.equal(request.body.get('tag_audio_events'), 'false');
      assert.equal(request.body.get('language_code'), 'es');
      return Response.json({ text: '   ' });
    };
    await assert.rejects(stt(Buffer.from('clip'), 'audio/webm', 'es'), /No speech was detected/);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.ELEVENLABS_API_KEY; else process.env.ELEVENLABS_API_KEY = oldKey;
  }
});

test('concurrent speech requests share one generation; model changes invalidate cache', async () => {
  const oldFetch = globalThis.fetch, oldKey = process.env.ELEVENLABS_API_KEY, oldModel = process.env.ELEVENLABS_TTS_MODEL;
  process.env.ELEVENLABS_API_KEY = 'test-only';
  const phrase = `Prueba ${crypto.randomUUID()}`;
  let calls = 0;
  globalThis.fetch = async () => { calls++; await new Promise(resolve => setTimeout(resolve, 10)); return new Response('audio'); };
  try {
    const [a, b] = await Promise.all([cachedTts(phrase), cachedTts(phrase)]);
    assert.deepEqual(a.audio, b.audio); assert.equal(calls, 1);
    assert.equal((await cachedTts(phrase)).cached, true); assert.equal(calls, 1);
    process.env.ELEVENLABS_TTS_MODEL = 'eleven_multilingual_v2';
    await cachedTts(phrase); assert.equal(calls, 2);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.ELEVENLABS_API_KEY; else process.env.ELEVENLABS_API_KEY = oldKey;
    if (oldModel === undefined) delete process.env.ELEVENLABS_TTS_MODEL; else process.env.ELEVENLABS_TTS_MODEL = oldModel;
  }
});

test('practice scoring handles accents and punctuation but preserves Spanish ñ', () => {
  assert.equal(scoreAttempt('¡Está aquí!', 'esta aqui').score, 1);
  assert.equal(scoreAttempt('El año', 'el ano').score, 0.5);
  assert.equal(scoreAttempt('El año', 'el año'.normalize('NFD')).score, 1);
  assert.equal(scoreAttempt('uno-dos', 'uno dos').score, 1);
  const result = scoreAttempt('hola buenos días', 'hola días');
  assert.equal(result.words.find(w => w.word === 'buenos').status, 'missed');
});
