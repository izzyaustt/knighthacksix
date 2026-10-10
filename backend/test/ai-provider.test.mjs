import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getAIConfig, aiCacheKey, generateJSON } from '../ai-provider.mjs';

const request = { system: 'Translate into Spanish.', contents: 'hello', schema: { type: 'object', properties: { target: { type: 'string' } }, required: ['target'] } };

test('Gemini is the default; Ollama uses smaller batches and separate cache keys', () => {
  const gemini = getAIConfig({});
  const local = getAIConfig({ AI_PROVIDER: 'ollama' });
  assert.equal(gemini.provider, 'gemini');
  assert.equal(gemini.batchSize, 30);
  assert.equal(local.batchSize, 3);
  assert.equal(local.model, 'qwen2.5:3b');
  assert.equal(getAIConfig({ LLM_PROVIDER: 'ollama' }).provider, 'ollama');
  assert.equal(getAIConfig({ AI_PROVIDER: 'gemini', LLM_PROVIDER: 'ollama' }).provider, 'gemini');
  assert.equal(getAIConfig({ LLM_PROVIDER: 'ollama', OLLAMA_URL: 'http://localhost:11434' }).baseUrl, 'http://localhost:11434');
  assert.notEqual(aiCacheKey(gemini), aiCacheKey(local));
  assert.notEqual(aiCacheKey(local), aiCacheKey({ ...local, model: 'different' }));
  assert.throws(() => getAIConfig({ AI_PROVIDER: 'typo' }), /AI_PROVIDER/);
  assert.throws(() => getAIConfig({ AI_PROVIDER: 'ollama', OLLAMA_BASE_URL: 'https://ollama.com' }), /local HTTP/);
  assert.throws(() => getAIConfig({ AI_PROVIDER: 'ollama', OLLAMA_MODEL: 'example:cloud' }), /local OLLAMA_MODEL/);
});

test('Ollama sends a nonstreaming schema-constrained request and never constructs Gemini', async () => {
  const data = await generateJSON(request, {
    config: getAIConfig({ AI_PROVIDER: 'ollama' }),
    geminiFactory: () => { throw new Error('Gemini must not be called'); },
    fetchImpl: async (url, options) => {
      assert.equal(url, 'http://127.0.0.1:11434/api/chat');
      const body = JSON.parse(options.body);
      assert.equal(body.stream, false);
      assert.deepEqual(body.format, request.schema);
      assert.equal(body.messages[0].content, request.system);
      assert.equal(body.messages[1].content, request.contents);
      return new Response(JSON.stringify({ message: { content: '{"target":"hola"}' } }));
    },
  });
  assert.deepEqual(data, { target: 'hola' });
});

test('Ollama errors are actionable and never silently fall back to Gemini', async () => {
  const config = getAIConfig({ AI_PROVIDER: 'ollama' });
  const geminiFactory = () => { throw new Error('Unexpected paid fallback'); };
  await assert.rejects(generateJSON(request, { config, geminiFactory, fetchImpl: async () => { throw new Error('network'); } }), /Cannot reach Ollama/);
  await assert.rejects(generateJSON(request, { config, geminiFactory, fetchImpl: async () => new Response('{}', { status: 404 }) }), /ollama pull qwen2.5:3b/);
  await assert.rejects(generateJSON(request, { config, geminiFactory, fetchImpl: async () => new Response(JSON.stringify({ message: { content: 'bad json' } })) }), /invalid JSON/);
});

test('Gemini uses the selected model and identical JSON schema without contacting Ollama', async () => {
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'test-only-not-a-real-key';
  try {
    const data = await generateJSON(request, {
      config: getAIConfig({ AI_PROVIDER: 'gemini', GEMINI_MODEL: 'demo-model' }),
      fetchImpl: () => { throw new Error('Ollama must not be contacted'); },
      geminiFactory: () => ({ models: { generateContent: async options => {
        assert.equal(options.model, 'demo-model');
        assert.deepEqual(options.config.responseJsonSchema, request.schema);
        return { text: '{"target":"hola"}' };
      } } }),
    });
    assert.deepEqual(data, { target: 'hola' });
  } finally {
    if (previous === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previous;
  }
});
