import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import jwt from 'jsonwebtoken';

test('mock extension API accepts captions/explanations and rejects invalid requests', async () => {
  const server = spawn(process.execPath, ['server.mjs'], {
    cwd: new URL('../', import.meta.url),
    env: { ...process.env, MOCK: '1', PORT: '3097', SESSION_SECRET: 'test-secret' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  server.stdout.on('data', b => { output += b; });
  server.stderr.on('data', b => { output += b; });
  const base = 'http://127.0.0.1:3097';
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (server.exitCode !== null) throw new Error(output);
      if (output.includes('backend on')) { ready = true; break; }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.ok(ready, `Server did not start: ${output}`);
    const health = await (await fetch(base + '/health')).json();
    assert.equal(health.ai.provider, 'mock');
    const post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    for (const body of [{ text: '' }, { text: 'x'.repeat(2001) }, { text: 'hola', speed: 'fast' }]) {
      assert.equal((await post('/tts', body)).status, 400);
    }
    const result = await post('/align', { videoId: 'test', lines: [{ start: 1, end: 3, text: 'hello world' }] });
    assert.equal(result.status, 200);
    const data = await result.json();
    assert.equal(data.lines[0].source, 'hello world');
    assert.equal(data.lines[0].target, '[ES] hello world');
    assert.equal(data.lines[0].pairs[0].srcStart, 0);
    for (const lang of ['fr', 'fil']) {
      const translated = await post('/align', { videoId: 'test', lang, lines: [{ start: 1, end: 3, text: 'hello' }] });
      assert.equal(translated.status, 200);
      assert.equal((await translated.json()).lines[0].target, `[${lang.toUpperCase()}] hello`);
      assert.equal((await post('/explain', { phrase: 'hello', lang, word_lookup: true, word_lang: 'en', detail: 'brief' })).status, 200);
    }
    for (const body of [
      { videoId: 'test', lang: 'to', lines: [{ start: 1, end: 3, text: 'hello' }] },
      { videoId: 'test', lines: [{ start: 3, end: 1, text: 'hello' }] },
      { videoId: 'test', lines: Array.from({ length: 31 }, () => ({ start: 0, end: 1, text: 'hello' })) },
    ]) assert.equal((await post('/align', body)).status, 400);
    const explanation = await post('/explain', { phrase: 'hola', source: 'hello', context: 'hola mundo' });
    assert.equal(explanation.status, 200);
    const explained = await explanation.json();
    assert.equal(explained.gloss, 'hello');
    for (const field of ['grammar_note', 'why_here', 'example', 'formality']) assert.equal(typeof explained[field], 'string');
    for (const word_lang of ['en', 'es']) {
      const word = await post('/explain', { phrase: 'test', word_lookup: true, word_lang });
      assert.equal(word.status, 200);
      assert.equal(typeof (await word.json()).translation, 'string');
    }
    assert.equal((await post('/explain', { phrase: 'word', word_lookup: 'true' })).status, 400);
    assert.equal((await post('/explain', { phrase: 'word', word_lookup: true, word_lang: 'fr' })).status, 400);
    assert.equal((await post('/explain', { phrase: 'word', word_lookup: true, detail: 'brief' })).status, 200);
    assert.equal((await post('/explain', { phrase: 'word', detail: 'invalid' })).status, 400);
    assert.equal((await post('/explain', { phrase: '' })).status, 400);
    assert.equal((await post('/explain', { phrase: 'hola', lang: 'to' })).status, 400);

    // User data routes require a session token; a user_id in the request is not enough.
    assert.equal((await fetch(base + '/stats/recent?user_id=demo-user')).status, 401);
    assert.equal((await post('/events', { user_id: 'demo-user', event_type: 'lookup' })).status, 401);
    assert.equal((await fetch(base + '/stt', { method: 'POST' })).status, 401);
    const forged = jwt.sign({ uid: 'demo-user' }, 'wrong-secret');
    assert.equal((await fetch(base + '/vocab', { headers: { Authorization: `Bearer ${forged}` } })).status, 401);
    const token = jwt.sign({ uid: 'test-user', email: 'test@example.com' }, 'test-secret');
    const me = await fetch(base + '/auth/me', { headers: { Authorization: `Bearer ${token}` } });
    assert.deepEqual(await me.json(), { id: 'test-user', email: 'test@example.com' });
    assert.equal((await post('/auth/google', {})).status, 401);
  } finally {
    server.kill('SIGTERM');
    if (server.exitCode === null) await once(server, 'exit');
  }
});
