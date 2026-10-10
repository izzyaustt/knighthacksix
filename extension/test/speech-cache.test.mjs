import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpeechCache } from '../src/speech-cache.ts';

test('replays share audio; normal and slow remain separate; failed requests can retry', async () => {
  let calls = 0;
  const cache = createSpeechCache(async (_text, speed) => { calls++; return `audio-${speed}`; });
  assert.deepEqual(await Promise.all([cache.get('hola', 1), cache.get('hola', 1)]), ['audio-1', 'audio-1']);
  await cache.get('hola', 1); assert.equal(calls, 1);
  assert.equal(await cache.get('hola', 0.7), 'audio-0.7'); assert.equal(calls, 2);
  let attempts = 0;
  const retry = createSpeechCache(async () => { if (++attempts === 1) throw Error('busy'); return 'ok'; });
  await assert.rejects(retry.get('hola', 1), /busy/);
  assert.equal(await retry.get('hola', 1), 'ok');
});
