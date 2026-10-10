import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

test('installed Ollama translates and explains through the real backend', { skip: process.env.RUN_OLLAMA_TESTS !== '1', timeout: 180000 }, async () => {
  const server = spawn(process.execPath, ['start-provider.mjs', 'ollama'], {
    cwd: new URL('../', import.meta.url),
    env: { ...process.env, MOCK: '1', PORT: '3098', GEMINI_API_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  server.stdout.on('data', b => { output += b; });
  server.stderr.on('data', b => { output += b; });
  const base = 'http://127.0.0.1:3098';
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (server.exitCode !== null) throw new Error(output);
      if (output.includes('backend on')) { ready = true; break; }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.ok(ready, `Server did not start: ${output}`);
    const health = await (await fetch(base + '/health')).json();
    assert.equal(health.ai.provider, 'ollama');
    assert.equal(health.ai.batch_size, 3);
    const post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(100000) });
    const body = { videoId: `live-${crypto.randomUUID()}`, lines: [{ start: 0, end: 3, text: 'Hello, my friend.' }] };
    const response = await post('/align', body);
    const data = await response.json();
    assert.equal(response.status, 200, JSON.stringify(data));
    assert.ok(data.lines[0].target && data.lines[0].target !== body.lines[0].text);
    assert.ok(data.lines[0].pairs.length > 0);
    console.log(`Live Spanish: ${data.lines[0].target}`);
    const cached = await (await post('/align', body)).json();
    assert.equal(cached.cached, true);
    const batchResponse = await post('/align', { videoId: `live-batch-${crypto.randomUUID()}`, lines: [
      { start: 0, end: 2, text: 'Hello, my friend.' },
      { start: 2, end: 4, text: 'How are you?' },
      { start: 4, end: 6, text: 'Let us go.' },
    ] });
    const batch = await batchResponse.json();
    assert.equal(batchResponse.status, 200, JSON.stringify(batch));
    assert.equal(batch.lines.length, 3);
    assert.deepEqual(batch.lines.map(l => l.source), ['Hello, my friend.', 'How are you?', 'Let us go.']);
    assert.ok(batch.lines.every(l => l.target));
    console.log(`Live batch: ${batch.lines.map(l => l.target).join(' | ')}`);
    const explanationResponse = await post('/explain', { phrase: 'hola', source: 'hello', context: data.lines[0].target });
    const explanation = await explanationResponse.json();
    assert.equal(explanationResponse.status, 200, JSON.stringify(explanation));
    for (const key of ['gloss', 'grammar_note', 'example', 'formality']) assert.ok(typeof explanation[key] === 'string' && explanation[key].trim());
    console.log(`Live gloss: ${explanation.gloss}`);
  } finally {
    server.kill('SIGTERM');
    if (server.exitCode === null) await once(server, 'exit');
  }
});
