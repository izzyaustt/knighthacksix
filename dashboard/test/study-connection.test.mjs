import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareStudyConnection } from '../src/study-connection.ts';

test('a provider failure never requests microphone access', async () => {
  await assert.rejects(prepareStudyConnection(new AbortController().signal,
    async () => { throw Error('provider offline'); },
    async () => { assert.fail('microphone should not be requested'); }), /provider offline/);
});
test('cancel during session preparation never requests microphone access', async () => {
  const controller = new AbortController();
  const session = await prepareStudyConnection(controller.signal,
    async () => { controller.abort(); return {}; },
    async () => { assert.fail('microphone should not be requested'); });
  assert.equal(session, null);
});
test('cancel during microphone permission releases tracks and never starts voice', async () => {
  const controller = new AbortController();
  let stopped = 0;
  const session = await prepareStudyConnection(controller.signal, async () => ({}), async () => {
    controller.abort();
    return { getTracks: () => [{ stop: () => stopped++ }, { stop: () => stopped++ }] };
  });
  assert.equal(session, null);
  assert.equal(stopped, 2);
});
test('successful permission check releases tracks before handing session to SDK', async () => {
  let stopped = false;
  const session = { signed_url: 'test' };
  const ready = await prepareStudyConnection(new AbortController().signal, async () => session,
    async () => ({ getTracks: () => [{ stop: () => { stopped = true; } }] }));
  assert.equal(ready, session);
  assert.equal(stopped, true);
});
