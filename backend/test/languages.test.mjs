import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { LANGUAGES, isLanguage } from '../../shared/languages.ts';
import { alignBatch } from '../align.mjs';
import { explainPhrase } from '../explain.mjs';
import { cachedTts } from '../src/ttsCache.ts';
import { makeStudyAgentConfig } from '../study-agent-config.mjs';

test('captions and dictionary requests use the selected language without cross-language cache hits', async () => {
  const oldFetch = globalThis.fetch, oldProvider = process.env.AI_PROVIDER;
  process.env.AI_PROVIDER = 'ollama';
  const requests = [];
  globalThis.fetch = async (_url, options) => {
    const request = JSON.parse(options.body);
    requests.push(request);
    const french = request.messages[0].content.includes('French');
    const translation = french ? 'bonjour' : 'kamusta';
    const output = request.format.type === 'array'
      ? [{ id: 0, target: translation, pairs: [{ src: 'hello', tgt: translation, color: 0 }] }]
      : { translation, gloss: 'hello', pronunciation: 'FAKE' };
    return Response.json({ message: { content: JSON.stringify(output) } });
  };
  try {
    for (const lang of ['fr', 'fil']) {
      const result = await alignBatch([{ start: 0, end: 2, text: 'hello' }], { lang });
      assert.equal(result[0].target, lang === 'fr' ? 'bonjour' : 'kamusta');
      assert.equal(result[0].pairs.length, 1);
      const input = { phrase: 'hello', source: 'hello', context: '', word_lookup: true, word_lang: 'en', detail: 'brief', lang };
      const lookup = await explainPhrase(input);
      assert.equal(lookup.translation, lang === 'fr' ? 'bonjour' : 'kamusta');
      assert.equal(lookup.pronunciation, ''); // Never reuse the Spanish guide or invented model spelling.
      assert.equal((await explainPhrase(input)).cached, true);
    }
    assert.equal(requests.length, 4);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldProvider === undefined) delete process.env.AI_PROVIDER; else process.env.AI_PROVIDER = oldProvider;
  }
});

test('audio cache separates identical text by language and sends the matching speech language', async () => {
  const oldFetch = globalThis.fetch, oldKey = process.env.ELEVENLABS_API_KEY;
  process.env.ELEVENLABS_API_KEY = 'test-language-key';
  const calls = [];
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body); calls.push(body.language_code);
    return new Response(body.language_code);
  };
  try {
    const text = `test-${randomUUID()}`;
    for (const lang of ['es', 'fr', 'fil']) {
      assert.equal((await cachedTts(text, 1, lang)).audio.toString(), lang);
      assert.equal((await cachedTts(text, 1, lang)).cached, true);
    }
    assert.deepEqual(calls, ['es', 'fr', 'fil']);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.ELEVENLABS_API_KEY; else process.env.ELEVENLABS_API_KEY = oldKey;
  }
});

test('each Tutor has a private language-specific prompt and greeting', () => {
  for (const lang of Object.keys(LANGUAGES)) {
    const config = makeStudyAgentConfig(lang);
    assert.equal(config.conversation_config.agent.language, lang);
    assert.ok(config.conversation_config.agent.first_message.startsWith(LANGUAGES[lang].greeting));
    assert.ok(config.conversation_config.agent.prompt.prompt.includes(LANGUAGES[lang].name));
    assert.equal(config.platform_settings.auth.enable_auth, true);
  }
  for (const invalid of ['en', 'to', 'constructor', null, ['fr']]) assert.equal(isLanguage(invalid), false);
});
