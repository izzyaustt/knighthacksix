import test from 'node:test';
import assert from 'node:assert/strict';
import { explainPhrase } from '../explain.mjs';

test('word translations request the correct direction and have separate cache entries', async () => {
  const oldProvider = process.env.AI_PROVIDER;
  const oldFetch = globalThis.fetch;
  const requests = [];
  process.env.AI_PROVIDER = 'ollama';
  globalThis.fetch = async (_url, options) => {
    const request = JSON.parse(options.body); requests.push(request);
    return new Response(JSON.stringify({ message: { content: JSON.stringify({
      translation: request.messages[0].content.includes('into Spanish') ? 'minutos' : 'minutes', gloss: 'A unit of time.',
      grammar_note: 'Plural noun.', example: 'Cinco minutos — five minutes.', formality: 'Neutral', pronunciation: 'mee-NOO-tohs',
    }) } }), { status: 200 });
  };
  try {
    const input = { phrase: 'minutes', source: 'It took five minutes.', context: 'Tardó cinco minutos.', word_lookup: true };
    assert.equal((await explainPhrase({ ...input, word_lang: 'en' })).translation, 'minutos');
    assert.equal((await explainPhrase({ ...input, word_lang: 'es' })).translation, 'minutes');
    assert.equal((await explainPhrase({ ...input, word_lang: 'en' })).cached, true);
    assert.equal(requests.length, 2);
    assert.match(requests[0].messages[0].content, /into Spanish/);
    assert.match(requests[1].messages[0].content, /into English/);
    assert.ok(requests[0].format.required.includes('translation'));
    const brief = await explainPhrase({ ...input, word_lang: 'en', detail: 'brief' });
    assert.equal(brief.pronunciation, 'mee-NOO-tohs');
    assert.equal(brief.pronunciation_syllables, 'mi-NU-tos');
    assert.equal(brief.translation, 'minutos');
    assert.deepEqual(requests[2].format.required, ['translation', 'gloss']);
    assert.ok(!requests[2].format.required.includes('pronunciation'));
    assert.ok(!requests[2].messages[0].content.includes('OH-lah'));
    assert.equal(requests[2].options.num_predict, 256);
    assert.equal((await explainPhrase({ ...input, word_lang: 'en', detail: 'brief' })).cached, true);
    assert.equal(requests.length, 3);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldProvider === undefined) delete process.env.AI_PROVIDER;
    else process.env.AI_PROVIDER = oldProvider;
  }
});

test('sentence responses are retried and rejected instead of being cached as words', async () => {
  const oldProvider = process.env.AI_PROVIDER, oldFetch = globalThis.fetch;
  process.env.AI_PROVIDER = 'ollama';
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(JSON.stringify({ message: { content: JSON.stringify({ translation: 'This is an entire sentence.',
      gloss: 'word', grammar_note: 'note', example: 'example', formality: 'neutral', pronunciation: 'WORD' }) } }), { status: 200 });
  };
  try {
    await assert.rejects(explainPhrase({ phrase: 'uncached-word-test', source: 'context', context: 'context', word_lookup: true, word_lang: 'en' }), /sentence instead/);
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldProvider === undefined) delete process.env.AI_PROVIDER;
    else process.env.AI_PROVIDER = oldProvider;
  }
});

test('guides use actual Spanish text, ignoring any AI pronunciation field', async () => {
  const oldProvider = process.env.AI_PROVIDER, oldFetch = globalThis.fetch;
  process.env.AI_PROVIDER = 'ollama';
  globalThis.fetch = async () => Response.json({ message: { content: JSON.stringify({
    translation: 'I did', gloss: 'Past tense of hacer', pronunciation: 'hee',
  }) } });
  try {
    const result = await explainPhrase({ phrase: 'hice', source: 'I did', context: '', word_lookup: true, word_lang: 'es', detail: 'brief' });
    assert.equal(result.translation, 'I did'); assert.equal(result.pronunciation, 'EE-seh');
    assert.equal(result.pronunciation_syllables, 'HI-ce');
  } finally {
    globalThis.fetch = oldFetch;
    if (oldProvider === undefined) delete process.env.AI_PROVIDER; else process.env.AI_PROVIDER = oldProvider;
  }
});
