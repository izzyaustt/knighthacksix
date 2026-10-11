import test from 'node:test';
import assert from 'node:assert/strict';
import { createDataRouter } from '../data-routes.mjs';

test('caption coverage only credits learned vocabulary and resets when mastery is removed', async () => {
  let saved = [], captions = ['hola', 'mundo', 'gracias', 'amigo'];
  const pool = { query: async (sql, args) => {
    if (sql.includes('FROM learning_events')) {
      assert.deepEqual(args, ['learner', 'es', 2]);
      assert.ok(!sql.includes("event_type='lookup'"));
      return { rows: [{ video_id: 'video', events: '17', watched_minutes: '1' }] };
    }
    if (sql.includes('FROM video_words')) {
      assert.deepEqual(args, ['es', ['video']]);
      return { rows: captions.map(word => ({ video_id: 'video', word })) };
    }
    assert.match(sql, /FROM vocab/); assert.deepEqual(args, ['learner', 'es']);
    return { rows: saved };
  } };
  const router = createDataRouter(pool, (_req, _res, next) => next());
  const handler = router.stack.find(layer => layer.route?.path === '/stats/videos').route.stack.at(-1).handle;
  async function coverage() {
    let result;
    await handler({ userId: 'learner', query: { lang: 'es' } }, { json(body) { result = body.videos[0]; } });
    return result;
  }
  assert.equal((await coverage()).known_pct, 0);
  saved = [{ word: 'hola', status: 'new' }, { word: 'mundo', status: 'learning' }];
  assert.equal((await coverage()).known_pct, 0);
  saved = [{ word: '¡Hola!', status: 'known' }, { word: 'mundo', status: 'learning' }, { word: 'otro', status: 'known' }];
  assert.equal((await coverage()).known_words, 1); assert.equal((await coverage()).known_pct, .25);
  saved[0].status = 'learning'; assert.equal((await coverage()).known_pct, 0);
  captions = []; assert.equal((await coverage()).known_pct, null);
});
