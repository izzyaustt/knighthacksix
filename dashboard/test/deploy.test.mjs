import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
const run = env => spawnSync(process.execPath, [new URL('../check-deploy.mjs', import.meta.url).pathname], {
  env: { ...process.env, VITE_BACKEND_URL: '', VITE_GOOGLE_CLIENT_ID: '', ...env }, encoding: 'utf8',
});
test('hosted build requires an HTTPS backend origin and public Google client ID', () => {
  const valid = { VITE_BACKEND_URL: 'https://langtube-api.example.com', VITE_GOOGLE_CLIENT_ID: 'sample.apps.googleusercontent.com' };
  assert.equal(run(valid).status, 0);
  for (const url of ['', 'http://localhost:3000', 'https://localhost:3000', 'https://api.example.com/path', 'https://user:pass@api.example.com', 'https://api.example.com/?key=value']) {
    assert.notEqual(run({ ...valid, VITE_BACKEND_URL: url }).status, 0);
  }
  assert.notEqual(run({ ...valid, VITE_GOOGLE_CLIENT_ID: '' }).status, 0);
});
