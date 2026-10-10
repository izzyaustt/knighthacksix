import test from 'node:test';
import assert from 'node:assert/strict';
import { nextBatchOffset } from '../src/translation-queue.ts';

const lines = () => Array.from({ length: 30 }, (_, i) => ({ start: i * 2, end: i * 2 + 1, src: `${i}`, tgt: '', pairs: [] }));

test('seeking ahead prioritizes current captions over an earlier backlog', () => {
  const data = lines();
  const attempted = new Set([0]);
  assert.equal(nextBatchOffset(data, 42, 3, attempted), 21);
  attempted.add(21);
  assert.equal(nextBatchOffset(data, 42, 3, attempted), 24);
  assert.equal(nextBatchOffset(data, 12, 3, attempted), 6);
});

test('gaps prioritize the upcoming caption and translated batches are skipped', () => {
  const data = lines();
  assert.equal(nextBatchOffset(data, 5.5, 3, new Set()), 3);
  data.slice(3, 6).forEach(line => { line.tgt = 'traducido'; });
  assert.equal(nextBatchOffset(data, 6, 3, new Set()), 6);
});

test('failed batches are attempted only once per run and a retry can revisit them', () => {
  const data = lines();
  const attempted = new Set(Array.from({ length: 10 }, (_, i) => i * 3));
  assert.equal(nextBatchOffset(data, 42, 3, attempted), null);
  assert.equal(nextBatchOffset(data, 42, 3, new Set()), 21);
  assert.equal(nextBatchOffset([], 0, 3, new Set()), null);
});
