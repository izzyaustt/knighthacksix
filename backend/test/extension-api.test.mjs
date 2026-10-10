import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

test('mock extension API accepts captions/explanations and rejects invalid requests', async () => {
  const server = spawn(process.execPath, ['server.mjs'], {
    cwd: new URL('../', import.meta.url),
    env: { ...process.env, MOCK: '1', PORT: '3097' }, stdio: ['ignore', 'pipe', 'pipe'],
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
    const post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const result = await post('/align', { videoId: 'test', lines: [{ start: 1, end: 3, text: 'hello world' }] });
    assert.equal(result.status, 200);
    const data = await result.json();
    assert.equal(data.lines[0].source, 'hello world');
    assert.equal(data.lines[0].target, '[ES] hello world');
    assert.equal(data.lines[0].pairs[0].srcStart, 0);
    for (const body of [
      { videoId: 'test', lang: 'fr', lines: [{ start: 1, end: 3, text: 'hello' }] },
      { videoId: 'test', lines: [{ start: 3, end: 1, text: 'hello' }] },
      { videoId: 'test', lines: Array.from({ length: 31 }, () => ({ start: 0, end: 1, text: 'hello' })) },
    ]) assert.equal((await post('/align', body)).status, 400);
    const explanation = await post('/explain', { phrase: 'hola', source: 'hello', context: 'hola mundo' });
    assert.equal(explanation.status, 200);
    assert.equal((await explanation.json()).gloss, 'hello');
    assert.equal((await post('/explain', { phrase: '' })).status, 400);
    assert.equal((await post('/explain', { phrase: 'hola', lang: 'fr' })).status, 400);
  } finally {
    server.kill('SIGTERM');
    if (server.exitCode === null) await once(server, 'exit');
  }
});
