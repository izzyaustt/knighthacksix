import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseGoogleAccount } from '../src/google-signin.ts';
const redirect = 'https://test-extension.chromiumapp.org/google-auth';
function setup(change = p => p) {
  let requested;
  globalThis.chrome = { identity: {
    getRedirectURL: path => { assert.equal(path, 'google-auth'); return redirect; },
    launchWebAuthFlow: async details => {
      requested = details;
      const query = new URL(details.url).searchParams;
      const token = 'header.' + Buffer.from(JSON.stringify({ nonce: query.get('nonce') })).toString('base64url') + '.signature';
      const params = change(new URLSearchParams({ state: query.get('state'), id_token: token }));
      return params === null ? undefined : redirect + '#' + params;
    },
  } };
  return () => requested;
}
test('every sidebar sign-in opens an interactive Google account chooser', async () => {
  const request = setup();
  await chooseGoogleAccount('web-client');
  const first = new URL(request().url);
  assert.equal(request().interactive, true);
  assert.equal(first.searchParams.get('prompt'), 'select_account');
  assert.equal(first.searchParams.get('client_id'), 'web-client');
  assert.equal(first.searchParams.get('redirect_uri'), redirect);
  assert.equal(first.searchParams.has('login_hint'), false);
  assert.equal(first.searchParams.get('response_type'), 'id_token');
  await chooseGoogleAccount('web-client');
  assert.notEqual(first.searchParams.get('state'), new URL(request().url).searchParams.get('state'));
});
test('closing Google account selection does not return a login token', async () => {
  setup(() => null);
  await assert.rejects(chooseGoogleAccount('web-client'), /cancelled/);
});
test('a mismatched state is rejected', async () => {
  setup(p => { p.set('state', 'wrong'); return p; });
  await assert.rejects(chooseGoogleAccount('web-client'), /state did not match/);
});
test('a mismatched nonce is rejected', async () => {
  setup(p => { p.set('id_token', 'header.' + Buffer.from('{"nonce":"wrong"}').toString('base64url') + '.signature'); return p; });
  await assert.rejects(chooseGoogleAccount('web-client'), /nonce did not match/);
});
test('missing web client gives a configuration error without launching login', async () => {
  const request = setup();
  await assert.rejects(chooseGoogleAccount(''), /VITE_GOOGLE_CLIENT_ID/);
  assert.equal(request(), undefined);
});
