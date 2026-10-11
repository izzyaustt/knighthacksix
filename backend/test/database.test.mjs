import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import multer from 'multer';
import { once } from 'node:events';
import { createPool } from '../database.mjs';
import { createDataRouter, createAttemptHandler, saveVideoWords } from '../data-routes.mjs';
import { scoreAttempt } from '../src/scoring.ts';

test('HTTP routes persist attempts, deduplicate retries, and feed dashboard statistics', {
  skip: process.env.RUN_DB_TESTS !== '1', timeout: 60000,
}, async () => {
  const pool = createPool();
  const client = await pool.connect();
  let server;
  const user = `api-verification-${randomUUID()}`;
  let providerCalls = 0;
  try {
    await client.query('BEGIN');
    await client.query('INSERT INTO users(user_id,display_name) VALUES ($1,$2)', [user, 'Temporary API verification']);
    // Preserve the outer fixture transaction while routes exercise inner transactions.
    const adapter = {
      query: (sql, values) => client.query(sql, values),
      connect: async () => ({
        release() {},
        query: async (sql, values) => {
          if (sql === 'BEGIN') return client.query('SAVEPOINT route_transaction');
          if (sql === 'COMMIT') return client.query('RELEASE SAVEPOINT route_transaction');
          if (sql === 'ROLLBACK') {
            await client.query('ROLLBACK TO SAVEPOINT route_transaction');
            return client.query('RELEASE SAVEPOINT route_transaction');
          }
          return client.query(sql, values);
        },
      }),
    };
    // Stands in for requireUser: the session user is the fixture user unless a test overrides it.
    const signedIn = (req, _res, next) => { req.userId = req.get('x-test-user') ?? user; next(); };
    const app = express();
    app.use(express.json());
    app.post('/stt', signedIn, multer({ storage: multer.memoryStorage() }).single('audio'), createAttemptHandler(adapter, {
      stt: async () => { providerCalls++; return { text: 'hola' }; }, scoreAttempt,
    }));
    app.use(createDataRouter(adapter, signedIn));
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    async function request(path, options = {}) {
      const response = await fetch(base + path, options);
      return { status: response.status, body: await response.json() };
    }
    const post = (path, body) => request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const query = '?lang=es';
    assert.equal((await request('/health/database')).status, 200);
    assert.equal((await request('/stats/activity' + query + '&days=-1')).status, 400);
    assert.equal((await request('/stats/recent' + query + '&since=invalid')).status, 400);
    assert.equal((await request('/stats/recent' + query + '&cursor=unsupported')).status, 400);
    const event = { event_id: randomUUID(), event_type: 'lookup', word: 'hola', lang: 'es' };
    assert.equal((await post('/events', event)).status, 200);
    assert.equal((await post('/events', event)).body.duplicate, true);
    assert.equal((await post('/events', { ...event, word: 'adios' })).status, 409);
    assert.equal((await post('/events', { event_type: 'shadow_attempt' })).status, 400);
    assert.equal((await post('/events', { event_type: 'caption_view', meta: { watched_seconds: 'invalid' } })).status, 400);
    assert.equal((await post('/events', { event_type: 'caption_view', meta: { watched_seconds: 120 } })).status, 200);
    const saved = { word: 'hola', translation: 'hello', lang: 'es' };
    assert.equal((await post('/vocab', saved)).status, 200);
    assert.equal((await post('/vocab', saved)).status, 200);
    assert.equal((await request('/vocab' + query)).body.words.length, 1);

    const attemptId = randomUUID();
    async function attempt(target = 'hola mundo') {
      const form = new FormData();
      form.append('audio', new Blob(['test recording'], { type: 'audio/webm' }), 'attempt.webm');
      form.append('target_text', target);
      form.append('attempt_id', attemptId);
      return request('/stt', { method: 'POST', body: form });
    }
    const first = await attempt();
    assert.equal(first.status, 200);
    assert.equal(first.body.event_saved, true);
    assert.equal(first.body.score, 0.5);
    assert.equal((await attempt()).body.cached, true);
    assert.equal(providerCalls, 1, 'retry must reuse stored transcription');
    assert.equal((await attempt('different target')).status, 409);
    const recent = (await request('/stats/recent' + query)).body.events;
    assert.equal(recent.filter(e => e.event_type === 'shadow_attempt').length, 1);
    assert.equal(recent.find(e => e.event_type === 'shadow_attempt').transcript, 'hola');
    const trend = (await request('/stats/score-trend' + query)).body.points;
    assert.equal(trend[0].avg_score, 0.5);
    assert.equal(trend[0].attempts, 1);
    const activity = (await request('/stats/activity' + query)).body.points[0];
    assert.equal(activity.lookups, 1);
    assert.equal(activity.vocab_saved, 1);
    assert.equal(activity.shadow_attempts, 1);
    assert.equal(activity.watched_minutes, 2);
    const trouble = (await request('/stats/trouble-words' + query)).body.words;
    assert.equal(trouble[0].word, 'mundo');
    assert.equal(trouble[0].miss_rate, 1);
    const heatmap = (await request('/stats/heatmap' + query)).body.cells;
    assert.equal(heatmap.length, 168);
    assert.equal(heatmap.reduce((sum, cell) => sum + cell.count, 0), 4);

    // Overview widgets: revisit list, summary, video word coverage, and mastery.
    const patch = body => request('/vocab', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const revisit = async () => (await request('/vocab/revisit' + query)).body.words;
    const summary = async () => (await request('/stats/summary' + query)).body;
    assert.deepEqual((await revisit()).map(w => [w.word, w.translation, w.misses]), [['hola', 'hello', 0]]);
    assert.deepEqual((await summary()).mastery, { total: 1, learning: 1, mastered: 0 });
    assert.equal((await summary()).immersion.hours, 2 / 60);
    assert.equal((await summary()).immersion.goal_hours, 500);

    const video = `video-${randomUUID()}`;
    await saveVideoWords(adapter, video, 'es', [{ target: '¡Hola, mundo!' }, { target: 'Gracias, amigo. Hola.' }]);
    assert.equal((await post('/events', { event_type: 'caption_view', video_id: video, meta: { watched_seconds: 60 } })).status, 200);
    const coverage = async () => (await request('/stats/videos' + query)).body.videos.find(v => v.video_id === video);
    // "hola" was looked up and saved, so 3 of the 4 caption words count as known.
    assert.deepEqual([(await coverage()).total_words, (await coverage()).known_pct, (await coverage()).watched_minutes], [4, 0.75, 1]);

    async function perfectAttempt() {
      const form = new FormData();
      form.append('audio', new Blob(['test recording'], { type: 'audio/webm' }), 'attempt.webm');
      form.append('target_text', 'Hola');
      form.append('attempt_id', randomUUID());
      assert.equal((await request('/stt', { method: 'POST', body: form })).body.score, 1);
      return (await request('/vocab' + query)).body.words[0].status;
    }
    assert.equal(await perfectAttempt(), 'learning');
    assert.equal(await perfectAttempt(), 'learning');
    assert.equal(await perfectAttempt(), 'known');
    assert.deepEqual(await revisit(), []);
    assert.deepEqual((await summary()).mastery, { total: 1, learning: 0, mastered: 1 });
    assert.equal((await coverage()).known_pct, 1);

    assert.equal((await patch({ word: 'hola', status: 'learning' })).status, 200);
    assert.equal((await revisit()).length, 1);
    assert.equal((await patch({ word: 'hola', status: 'mastered' })).status, 400);
    assert.equal((await patch({ word: 'never saved', status: 'known' })).status, 404);
    assert.deepEqual((await request('/stats/videos', { headers: { 'x-test-user': 'unrelated-user' } })).body.videos, []);

    assert.deepEqual((await request('/stats/recent', { headers: { 'x-test-user': 'unrelated-user' } })).body.events, []);
    // A user_id in the request is ignored; only the session user counts.
    assert.deepEqual((await request(`/stats/recent?user_id=${encodeURIComponent(user)}`, { headers: { 'x-test-user': 'unrelated-user' } })).body.events, []);
  } finally {
    if (server) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
});
