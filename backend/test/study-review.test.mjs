import { cleanTutorText, wordTip, isReviewVocabulary } from '../../shared/tutor-feedback.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { validateReviewInput, reviewConversation } from '../study-review.mjs';
import { createStudyRouter } from '../study-routes.mjs';

const body = { review_id: 'bdc132aa-6cf5-4bc4-b6a4-a539c7413a38', lang: 'es', level: 'A1', scenario: 'cafe', messages: [
  { source: 'ai', text: '¿Qué quieres beber?' }, { source: 'user', text: 'Vivo en Nueva York.' },
  { source: 'ai', text: '¿Un café o un té?' }, { source: 'user', text: 'Un café, por favor.' },
] };
const generated = () => ({ summary: 'Your second reply answered the question well. Practice drink vocabulary.',
  ratings: Object.fromEntries(['understanding', 'relevance', 'vocabulary', 'grammar'].map(d => [d, { score: 3, feedback: 'You answered the second question clearly.' }])),
  struggles: [{ turn_index: 1, word: 'beber', translation: 'to drink', reason: 'Luna asked what you wanted to drink, but you answered where you live.', better_reply: 'Quiero beber un café.' }],
});
test('validation bounds transcripts and supported settings before provider calls', () => {
  assert.equal(validateReviewInput(body).messages.length, 4);
  for (const patch of [{ review_id: 'wrong' }, { lang: 'xx' }, { level: 'C2' }, { scenario: '__proto__' }, { messages: [{ source: 'system', text: 'hello' }] }, { messages: Array(121).fill(body.messages[0]) }, { messages: [{ source: 'user', text: 'x'.repeat(2001) }] }]) assert.throws(() => validateReviewInput({ ...body, ...patch }));
});
test('short conversations receive no invented score or AI request', async () => {
  const result = await reviewConversation({ ...body, messages: body.messages.slice(0, 2) }, () => assert.fail('AI must not run'));
  assert.equal(result.status, 'insufficient'); assert.equal(result.score, null); assert.deepEqual(result.struggles, []);
});
test('contextual review links words to actual dialogue and uses a transparent rubric', async () => {
  const result = await reviewConversation(body, async request => {
    assert.match(request.system, /must not count as an irrelevant reply/);
    assert.match(request.system, /Never assess pronunciation/);
    assert.deepEqual(request.schema.properties.struggles.items.properties.turn_index.enum, [1, 3]);
    assert.equal(JSON.parse(request.contents).exchanges[0].luna, '¿Qué quieres beber?');
    assert.equal(JSON.parse(request.contents).exchanges[0].user_reply, 'Vivo en Nueva York.');
    return generated();
  });
  assert.equal(result.score, 60);
  assert.equal(result.struggles[0].question, '¿Qué quieres beber?');
  assert.equal(result.struggles[0].reply, 'Vivo en Nueva York.');
});
test('invalid ratings still fail, while unsupported words do not discard valid ratings', async () => {
  const badRating = generated(); badRating.ratings.grammar.score = 9;
  await assert.rejects(reviewConversation(body, async () => badRating), { code: 'INVALID_REVIEW' });
  for (const mutate of [r => { r.struggles[0].turn_index = 0; }, r => { r.struggles[0].word = ''; }, r => { r.struggles[0].turn_index = 90; }, r => { r.struggles[0].word = 'Vivo en Nueva York'; }, r => { r.struggles[0].better_reply = '¿Qué quieres beber?'; }, r => { delete r.struggles; }]) {
    const output = generated(); mutate(output);
    const review = await reviewConversation(body, async () => output);
    assert.equal(review.score, 60); assert.deepEqual(review.struggles, []);
    assert.match(review.vocabulary_warning, /rating is saved/);
  }
  const result = await reviewConversation(body, async () => ({ ...generated(), struggles: [] }));
  assert.deepEqual(result.struggles, []);
  assert.equal(result.vocabulary_warning, undefined);
  const mixed = generated(); mixed.struggles.push({ ...mixed.struggles[0], word: 'unrelated' });
  const mixedReview = await reviewConversation(body, async () => mixed);
  assert.equal(mixedReview.struggles.length, 1); assert.equal(mixedReview.struggles[0].word, 'beber');
});
test('answer practice rejects novel questions and keeps first-person answers', async () => {
  const input = { ...body, messages: [
    { source: 'ai', text: '¿Qué haces los fines de semana?' }, { source: 'user', text: 'Te gusta leer.' },
    { source: 'ai', text: '¿Qué libros lees?' }, { source: 'user', text: 'Leo novelas.' },
  ] };
  for (const question of ['¿Qué te gusta hacer en tu tiempo libre?', 'Te gusta leer?', 'Te gusta leer？']) {
    const output = generated(); output.struggles = [{ ...output.struggles[0], word: 'te', better_reply: question }];
    const review = await reviewConversation(input, async () => output);
    assert.equal(review.score, 60); assert.deepEqual(review.struggles, []);
  }
  const output = generated(); output.struggles = [{ ...output.struggles[0], word: 'me', translation: 'me', reason: 'Use me when talking about what you like.', better_reply: 'Me gusta leer.' }];
  const review = await reviewConversation(input, async request => {
    assert.match(request.system, /declarative answer spoken by the learner/);
    return output;
  });
  assert.equal(review.struggles[0].better_reply, 'Me gusta leer.');
  assert.equal(review.struggles[0].word, 'me');
});
test('a focused repair recovers useful words without changing the rating', async () => {
  let calls = 0;
  const result = await reviewConversation(body, async request => {
    calls++;
    if (calls === 1) { const output = generated(); output.struggles[0].better_reply = '¿Quieres beber café?'; return output; }
    assert.equal(request.schema.properties.struggles.maxItems, 3);
    assert.match(request.system, /learner.s perspective/);
    assert.equal(JSON.parse(request.contents).exchanges[0].user_reply, 'Vivo en Nueva York.');
    return { struggles: generated().struggles };
  });
  assert.equal(calls, 2); assert.equal(result.score, 60);
  assert.equal(result.struggles[0].word, 'beber'); assert.equal(result.vocabulary_warning, undefined);
});
test('word repair is bounded and failures preserve valid feedback', async () => {
  let calls = 0;
  const result = await reviewConversation(body, async () => {
    calls++; if (calls > 1) throw Error('provider offline');
    const output = generated(); output.struggles[0].turn_index = 90; return output;
  });
  assert.equal(calls, 2); assert.equal(result.score, 60); assert.deepEqual(result.struggles, []);
  assert.ok(result.vocabulary_warning);
  calls = 0;
  await reviewConversation(body, async () => { calls++; return generated(); });
  assert.equal(calls, 1);
});
test('Spanish first-person tips preserve the actual hobby and avoid another AI request', async () => {
  const input = { ...body, messages: [
    { source: 'ai', text: '¿Qué te gusta hacer en tu tiempo libre?' }, { source: 'user', text: 'Te gusta leer.' },
    { source: 'ai', text: '¿Qué libros lees?' }, { source: 'user', text: 'Leo novelas.' },
  ] };
  let calls = 0;
  const result = await reviewConversation(input, async () => {
    calls++; const output = generated(); output.struggles = []; return output;
  });
  assert.equal(calls, 1);
  assert.equal(result.struggles[0].word, 'me');
  assert.equal(result.struggles[0].better_reply, 'Me gusta leer.');
  assert.equal(result.struggles[0].question, input.messages[0].text);
  assert.equal(result.vocabulary_warning, undefined);
  const other = await reviewConversation({ ...input, lang: 'fr' }, async () => ({ ...generated(), struggles: [] }));
  assert.deepEqual(other.struggles, []);
});
test('internal field labels never appear in displayed word tips', async () => {
  const leaked = 'me to talk about what you like, better_reply Me gusta leer libros.';
  assert.equal(cleanTutorText(leaked), 'me to talk about what you like');
  assert.equal(wordTip('me', 'Me gusta leer libros.', leaked), 'Use “me” when saying what you like.');
  assert.equal(cleanTutorText('reason: Use beber for drinks, better_reply: Quiero beber café.'), 'Use beber for drinks');
  assert.equal(cleanTutorText('Use beber for drinks.'), 'Use beber for drinks.');
  const output = generated(); output.struggles[0].reason = 'Practice drink vocabulary, better_reply Quiero beber café.';
  const review = await reviewConversation(body, async () => output);
  assert.equal(review.struggles[0].reason, 'Practice drink vocabulary');
  assert.equal(review.struggles[0].better_reply, 'Quiero beber un café.');
});
test('content-word mistakes become vocabulary and pronouns stay grammar tips', async () => {
  for (const misspelled of ['oranjes', 'naranjes']) {
    const input = { ...body, messages: [
      { source: 'ai', text: '¿Qué te gusta comer?' }, { source: 'user', text: `Te gusta comer ${misspelled}.` },
      { source: 'ai', text: '¿Qué bebes?' }, { source: 'user', text: 'Bebo agua.' },
    ] };
    const result = await reviewConversation(input, async () => ({ ...generated(), struggles: [] }));
    const words = result.struggles.filter(w => w.kind === 'vocabulary');
    const grammar = result.struggles.filter(w => w.kind === 'grammar');
    assert.deepEqual(words.map(w => w.word), ['naranjas']);
    assert.equal(words[0].translation, 'oranges');
    assert.equal(words[0].better_reply, 'Me gusta comer naranjas.');
    assert.equal(grammar[0].word, 'me');
    assert.equal(grammar[0].better_reply, 'Me gusta comer naranjas.');
  }
  for (const word of ['me', 'te', 'tu', 'tú', 'la']) assert.equal(isReviewVocabulary(word, 'es'), false);
  for (const word of ['naranjas', 'beber', 'té', 'libros']) assert.equal(isReviewVocabulary(word, 'es'), true);
});
test('review route authenticates, saves atomically, caches retries, and hides failures', async t => {
  let committed = null, pending = null, vocabWrites = 0, calls = 0, failSave = false, failAI = false;
  const query = async (sql, params) => {
    if (sql === 'BEGIN') { pending = null; return {}; }
    if (sql === 'COMMIT') { committed = pending; return {}; }
    if (sql === 'ROLLBACK') { pending = null; return {}; }
    if (sql.includes('SELECT meta')) return { rows: committed ? [{ meta: committed }] : [] };
    if (sql.includes('advisory')) return {};
    if (sql.includes('INSERT INTO public.vocab')) {
      assert.deepEqual(params, ['learner', 'es', 'beber', 'to drink']);
      vocabWrites++; if (failSave) throw Error('private db failure'); return {};
    }
    if (sql.includes('INSERT INTO public.learning_events')) { assert.equal(params[1], 'learner'); assert.equal(params[3], .6); pending = JSON.parse(params[4]); return {}; }
    assert.fail(sql);
  };
  const pool = { query, connect: async () => ({ query, release() {} }) };
  const app = express(); app.use(express.json());
  app.use(createStudyRouter(pool, (req, res, next) => { if (req.headers.authorization !== 'test') return res.sendStatus(401); req.userId = 'learner'; next(); }, { review: async input => { calls++; if (failAI) throw Error('private provider failure'); const output = generated(); output.struggles.push({ ...output.struggles[0], word: 'me', translation: 'to me', better_reply: 'Me gusta beber café.' }); return reviewConversation(input, async () => output); } }));
  app.use((e, req, res, next) => res.status(e.status ?? 503).json({ error: 'Could not save feedback' }));
  const server = app.listen(0, '127.0.0.1'); await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const url = `http://127.0.0.1:${server.address().port}/study/review`;
  const post = (payload = body, auth = 'test') => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: auth }, body: JSON.stringify(payload) });
  assert.equal((await post(body, '')).status, 401); assert.equal(calls, 0);
  assert.equal((await post({ ...body, lang: 'xx' })).status, 400); assert.equal(calls, 0);
  failAI = true; const failedAI = await post(); assert.equal(failedAI.status, 502); assert.ok(!(await failedAI.text()).includes('private')); assert.equal(committed, null);
  failAI = false; failSave = true; assert.equal((await post()).status, 503); assert.equal(committed, null);
  failSave = false; const success = await post(); assert.equal(success.status, 200); assert.equal((await success.json()).score, 60);
  const count = calls, writes = vocabWrites;
  assert.equal((await post()).status, 200); assert.equal(calls, count); assert.equal(vocabWrites, writes);
  assert.equal((await post({ ...body, level: 'A2' })).status, 409); assert.equal(calls, count);
});
