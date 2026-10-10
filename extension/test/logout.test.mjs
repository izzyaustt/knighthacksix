import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
const tick = () => new Promise(resolve => setImmediate(resolve));
async function load(name, context) {
  const source = (await readFile(new URL(`../src/${name}.ts`, import.meta.url), 'utf8')).replace(/^import .*;\n/gm, '').replace('import.meta.env.VITE_GOOGLE_CLIENT_ID', "'test-web-client'");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 } }).outputText;
  const exports = {};
  vm.runInNewContext(js, { exports, ...context });
  return exports;
}
async function panelFixture(initialRead = Promise.resolve({ user: { id: 'test-user' } })) {
  const nodes = new Map();
  const element = () => ({ hidden: false, style: {}, handlers: {}, focus() {}, addEventListener(event, fn) { this.handlers[event] = fn; } });
  const node = id => { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); };
  const signOuts = [element(), element()];
  const shadow = { getElementById: node, querySelectorAll: selector => selector === '.sign-out' ? signOuts : [] };
  const host = { ...element(), attachShadow: () => shadow };
  let changed, resets = 0;
  const removed = [], messages = [];
  const chrome = {
    storage: { local: { get: () => initialRead, set: async () => {}, remove: async keys => { removed.push([...keys]); } }, onChanged: { addListener: fn => { changed = fn; } } },
    runtime: { sendMessage: async msg => { if (msg.type === 'whoami') return initialRead; messages.push(msg.type); return { ok: true }; } },
  };
  const exports = await load('panel', { chrome, console, LOGO_FULL: '', LOGO_MARK: '', PANEL_CSS: '', emptyDay: () => ({}), isStatsKey: () => false,
    document: { createElement: () => host, getElementById: () => ({}), addEventListener() {} } });
  exports.createPanel({ onLookupBack: () => { resets++; } });
  return { node, signOuts, removed, messages, changed: (...args) => changed(...args), resets: () => resets };
}
for (const index of [0, 1]) {
  test(`sign-out button ${index + 1} clears both login stores and returns to sign-in`, async () => {
    const f = await panelFixture(); await tick();
    assert.equal(f.node('view-home').hidden, false);
    await f.signOuts[index].handlers.click();
    assert.equal(f.node('view-signin').hidden, false);
    assert.equal(f.node('view-home').hidden, true);
    assert.equal(f.node('view-lookup').hidden, true);
    assert.deepEqual(f.removed, [['session', 'll:signedIn']]);
    assert.deepEqual(f.messages, ['signout']); assert.equal(f.resets(), 1);
  });
}
test('a stale initial session reply cannot restore login after signing out', async () => {
  let resolve;
  const f = await panelFixture(new Promise(r => { resolve = r; }));
  await f.signOuts[0].handlers.click(); resolve({ user: { id: 'test-user' } }); await tick();
  assert.equal(f.node('view-signin').hidden, false);
});
test('logout in another tab updates the panel even while closed', async () => {
  const f = await panelFixture(); await tick();
  f.changed({ session: { oldValue: { token: 'test' } } }, 'local');
  assert.equal(f.node('view-signin').hidden, false); assert.equal(f.resets(), 1);
});
async function backgroundFixture({ remove = async () => {}, clear = async () => {} } = {}) {
  let listener;
  const exports = await load('auth', { chrome: { storage: { local: { remove } }, identity: { clearAllCachedAuthTokens: clear },
    runtime: { id: 'extension-test', onMessage: { addListener: fn => { listener = fn; } } } } });
  exports.registerAuth();
  return () => new Promise(resolve => { assert.equal(listener({ type: 'signout' }, { id: 'extension-test' }, resolve), true); });
}
test('background logout clears login before cache cleanup and survives Google failure', async () => {
  const calls = [];
  const logout = await backgroundFixture({ remove: async keys => { calls.push([...keys]); }, clear: async () => { calls.push('clear'); throw Error('Google unavailable'); } });
  assert.equal((await logout()).ok, true); assert.deepEqual(calls, [['session', 'll:signedIn'], 'clear']);
});
test('background logout replies even if identity cleanup never finishes', async () => {
  const logout = await backgroundFixture({ clear: () => new Promise(() => {}) }); assert.equal((await logout()).ok, true);
});
test('background logout reports storage failures instead of leaving the message unanswered', async () => {
  const logout = await backgroundFixture({ remove: async () => { throw Error('storage unavailable'); } });
  const reply = await logout(); assert.equal(reply.ok, false); assert.match(reply.error, /storage unavailable/);
});

test('extension login cannot restore a session after logout during token exchange', async () => {
  let listener, reply;
  const writes = [];
  const exports = await load('auth', {
    URL, chooseGoogleAccount: async () => 'google-id-token', getSettings: async () => ({ backendUrl: 'http://test.invalid' }),
    fetch: () => new Promise(resolve => { reply = resolve; }),
    chrome: {
      storage: { local: { remove: async () => {}, set: async value => { writes.push(value); } } },
      identity: { getAuthToken: async () => ({ token: 'google-token' }), clearAllCachedAuthTokens: async () => {} },
      runtime: { id: 'extension-test', onMessage: { addListener: fn => { listener = fn; } } },
    },
  });
  exports.registerAuth();
  const send = type => new Promise(resolve => listener({ type }, { id: 'extension-test' }, resolve));
  const pending = send('signin'); await tick();
  assert.equal((await send('signout')).ok, true);
  reply({ ok: true, json: async () => ({ token: 'app-token', user: { id: 'test-user' } }) });
  assert.equal((await pending).ok, false);
  assert.deepEqual(writes, []);
});

test('logout removes a session even if its earlier storage write is still pending', async () => {
  let listener, finishWrite;
  const calls = [];
  const exports = await load('auth', {
    URL, chooseGoogleAccount: async () => 'google-id-token', getSettings: async () => ({ backendUrl: 'http://test.invalid' }),
    fetch: async () => ({ ok: true, json: async () => ({ token: 'app-token', user: { id: 'test-user' } }) }),
    chrome: {
      storage: { local: {
        set: () => new Promise(resolve => { finishWrite = () => { calls.push('set'); resolve(); }; }),
        remove: async () => { calls.push('remove'); },
      } },
      identity: { getAuthToken: async () => ({ token: 'google-token' }), clearAllCachedAuthTokens: async () => {} },
      runtime: { id: 'extension-test', onMessage: { addListener: fn => { listener = fn; } } },
    },
  });
  exports.registerAuth();
  const send = type => new Promise(resolve => listener({ type }, { id: 'extension-test' }, resolve));
  const pending = send('signin'); await tick();
  const logout = send('signout');
  finishWrite();
  assert.equal((await pending).ok, false);
  assert.equal((await logout).ok, true);
  assert.deepEqual(calls, ['set', 'remove']);
});
