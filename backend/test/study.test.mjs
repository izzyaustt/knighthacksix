import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import { requireUser } from '../auth.mjs';
import { createStudyRouter } from '../study-routes.mjs';

test('study sessions authenticate, scope vocabulary, validate input, and hide provider errors', async t => {
  const previous = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = 'test-study-session-secret';
  let providerCalls = 0;
  let providerOk = true;
  let signedUrl = 'wss://api.elevenlabs.io/v1/convai/conversation?token=test';
  let databaseFails = false;
  const env = { ELEVENLABS_API_KEY: 'private-test-key', ELEVENLABS_AGENT_ID: 'private-test-agent' };
  const pool = { query: async (sql, parameters) => {
    assert.deepEqual(parameters, ['learner-123', 'es']);
    assert.match(sql, /LIMIT 5/);
    if (databaseFails) throw Error('database unavailable');
    return { rows: [{ word: 'café' }, { word: 'hola' }] };
  } };
  const app = express();
  app.use(express.json());
  app.use(createStudyRouter(pool, requireUser, { env, fetchImpl: async (url, options) => {
    providerCalls++;
    assert.equal(url.searchParams.get('agent_id'), env.ELEVENLABS_AGENT_ID);
    assert.equal(options.headers['xi-api-key'], env.ELEVENLABS_API_KEY);
    return providerOk ? Response.json({ signed_url: signedUrl }) : new Response('secret provider error', { status: 401 });
  } }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  t.after(async () => {
    await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    if (previous === undefined) delete process.env.SESSION_SECRET; else process.env.SESSION_SECRET = previous;
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { Authorization: `Bearer ${jwt.sign({ uid: 'learner-123' }, process.env.SESSION_SECRET)}`, 'Content-Type': 'application/json' };
  const session = body => fetch(`${base}/study/session`, { method: 'POST', headers, body: JSON.stringify(body) });
  await t.test('both endpoints reject unauthenticated requests', async () => {
    assert.equal((await fetch(`${base}/study/config`)).status, 401);
    assert.equal((await fetch(`${base}/study/session`, { method: 'POST' })).status, 401);
    assert.equal(providerCalls, 0);
  });
  await t.test('config exposes availability without credentials', async () => {
    const config = await (await fetch(`${base}/study/config`, { headers })).json();
    assert.equal(config.available, true);
    assert.equal(config.scenarios.length, 3);
    assert.ok(!JSON.stringify(config).includes('private-test'));
  });
  await t.test('invalid scenarios and levels cannot call ElevenLabs', async () => {
    for (const body of [{ scenario: '__proto__' }, { scenario: ['cafe'] }, { level: 'C2' }]) {
      assert.equal((await session(body)).status, 400);
    }
    assert.equal(providerCalls, 0);
  });
  await t.test('signed session contains only this learner’s Spanish vocabulary', async () => {
    const response = await session({ scenario: 'cafe', level: 'A1' });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const body = await response.json();
    assert.equal(body.dynamic_variables.vocabulary, 'café, hola');
    assert.equal(body.dynamic_variables.level, 'A1');
    assert.equal(body.max_duration_seconds, 180);
    assert.ok(!JSON.stringify(body).includes(env.ELEVENLABS_API_KEY));
  });
  await t.test('practice remains available if vocabulary storage is offline', async () => {
    databaseFails = true;
    assert.equal((await (await session({})).json()).dynamic_variables.vocabulary, 'No saved vocabulary yet');
  });
  await t.test('provider failures and unexpected URLs fail safely', async () => {
    providerOk = false;
    let response = await session({});
    assert.equal(response.status, 502);
    assert.ok(!(await response.text()).includes('secret provider error'));
    providerOk = true; signedUrl = 'wss://unexpected.invalid/session';
    response = await session({});
    assert.equal(response.status, 502);
  });
  await t.test('missing configuration returns a clear unavailable response', async () => {
    delete env.ELEVENLABS_AGENT_ID;
    assert.equal((await session({})).status, 503);
  });
});
