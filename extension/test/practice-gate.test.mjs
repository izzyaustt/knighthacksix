import test from 'node:test';
import assert from 'node:assert/strict';
import { createPracticeGate } from '../src/practice-gate.ts';

test('new caption requests wait while a lookup is open and resume on close or reset', async () => {
  const gate = createPracticeGate();
  await gate.wait();
  gate.open();
  let resumed = false;
  const pending = gate.wait().then(() => { resumed = true; });
  await Promise.resolve();
  assert.equal(resumed, false);
  gate.close(); await pending;
  assert.equal(resumed, true);
  gate.open();
  const pendingReset = gate.wait();
  gate.close(); await pendingReset;
  await gate.wait();
});
