import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const tick = () => new Promise(r => setImmediate(r));
const session = { token: 'test-token', user: { id: 'test-user', email: 'test@example.com', name: null } };
async function fixture(fetchOverride) {
  const storage = new Map([['langtube:session', JSON.stringify(session)]]);
  let storageChanged;
  const source = (await readFile(new URL('../src/auth.ts', import.meta.url), 'utf8')).replace(/^import .*;\n/gm, '').replace('import.meta.env.VITE_BACKEND_URL', "'http://test.invalid'");
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    exports, URL, fetch: fetchOverride, useSyncExternalStore: () => {},
    localStorage: { getItem: key => storage.get(key), setItem: (k, v) => storage.set(k, v), removeItem: key => storage.delete(key) },
    window: { google: { accounts: { id: { cancel() { throw Error('Google unavailable'); }, disableAutoSelect() {} } } }, addEventListener: (_, cb) => { storageChanged = cb; } },
  });
  return { auth: exports, storage, storageChanged: event => storageChanged(event) };
}
test('logout removes the session even if Google cleanup throws', async () => {
  const { auth, storage } = await fixture();
  auth.signOut();
  assert.equal(auth.getSession(), null);
  assert.equal(storage.has('langtube:session'), false);
});
test('a login response arriving after logout cannot sign the user back in', async () => {
  let resolve;
  const { auth, storage } = await fixture(() => new Promise(r => { resolve = r; }));
  const pending = auth.signIn('id-token');
  auth.signOut();
  resolve({ ok: true, json: async () => session });
  await pending;
  assert.equal(auth.getSession(), null);
  assert.equal(storage.has('langtube:session'), false);
});
test('logout from another dashboard tab cancels an in-flight login', async () => {
  let resolve;
  const { auth, storageChanged } = await fixture(() => new Promise(r => { resolve = r; }));
  const pending = auth.signIn('id-token');
  storageChanged({ key: 'langtube:session', newValue: null });
  resolve({ ok: true, json: async () => session });
  await pending;
  assert.equal(auth.getSession(), null);
});
test('a new explicit sign-in works after logging out', async () => {
  const { auth } = await fixture(async () => ({ ok: true, json: async () => session }));
  auth.signOut();
  await auth.signIn('new-id-token');
  assert.equal(auth.getSession().user.id, 'test-user');
});
test('Google callback requires a button click and ignores callbacks after unmount', async () => {
  let config, options, cleanup;
  const attempts = [];
  const source = (await readFile(new URL('../src/components/SignIn.tsx', import.meta.url), 'utf8')).replace(/^import .*;\n/gm, '').replace('import.meta.env.VITE_GOOGLE_CLIENT_ID', "'test-client'");
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText, {
    exports, React: { createElement() {} }, useRef: () => ({ current: {} }), useState: () => [null, () => {}], useEffect: effect => { cleanup = effect(); },
    signIn: async token => { attempts.push(token); }, window: { google: { accounts: { id: {
      initialize: c => { config = c; }, renderButton: (_, o) => { options = o; },
    } } } },
  });
  exports.SignIn(); await tick();
  assert.equal(config.auto_select, false); assert.equal(config.button_auto_select, false);
  config.callback({ credential: 'unsolicited' });
  assert.deepEqual(attempts, []);
  options.click_listener(); config.callback({ credential: 'clicked' });
  assert.deepEqual(attempts, ['clicked']);
  options.click_listener(); cleanup(); config.callback({ credential: 'old-view' });
  assert.deepEqual(attempts, ['clicked']);
});
