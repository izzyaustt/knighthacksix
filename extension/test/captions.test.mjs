import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeIndex, jsonCaptions, segments } from '../src/captions.ts';

test('caption parsing ignores untimed and empty events, joins segments', () => {
  assert.deepEqual(jsonCaptions(JSON.stringify({ events: [
    { tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: 'hello\n' }, { utf8: 'world' }] },
    { tStartMs: 4000, dDurationMs: 0, segs: [{ utf8: 'untimed' }] },
    { tStartMs: 0, dDurationMs: 1000 },
  ] })), [{ start: 1, end: 3, text: 'hello world' }]);
});
test('playback uses latest overlapping caption, clears gaps, supports seeking backward', () => {
  const lines = [{ start: 1, end: 4 }, { start: 3, end: 5 }, { start: 7, end: 9 }];
  assert.equal(activeIndex(lines, 0), -1);
  assert.equal(activeIndex(lines, 3.5), 1);
  assert.equal(activeIndex(lines, 5), -1);
  assert.equal(activeIndex(lines, 8), 2);
  assert.equal(activeIndex(lines, 1), 0);
});
test('Spanish phrases render in Spanish order and reject mismatched offsets', () => {
  const line = { source: 'red car', target: 'coche rojo', pairs: [
    { src: 'red', tgt: 'rojo', srcStart: 0, tgtStart: 6, color: 0 },
    { src: 'car', tgt: 'coche', srcStart: 4, tgtStart: 0, color: 1 },
    { src: 'bad', tgt: 'missing', srcStart: 99, tgtStart: 99, color: 2 },
  ] };
  assert.equal(segments(line, true).map(s => s.text).join(''), 'coche rojo');
  assert.equal(segments(line, false).map(s => s.text).join(''), 'red car');
  assert.equal(segments(line, true)[0].pair.src, 'car');
  assert.equal(segments(line, true).filter(s => s.pair).length, 2);
});
