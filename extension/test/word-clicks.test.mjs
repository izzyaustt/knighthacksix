import test from 'node:test';
import assert from 'node:assert/strict';
import { wordSegments } from '../src/colorize.ts';

test('every word is selectable without changing punctuation, spacing or phrase colors', () => {
  const text = 'I am hungry, my friend!';
  const parts = wordSegments(text, ['am hungry', 'friend']);
  assert.equal(parts.map(p => p.text).join(''), text);
  assert.deepEqual(parts.filter(p => p.word).map(p => [p.word, p.index]), [
    ['I', undefined], ['am', 0], ['hungry', 0], ['my', undefined], ['friend', 1],
  ]);
});

test('Spanish accents, contractions, repeated words and numbers are selectable', () => {
  const text = "¡Sí! Don't re-read él: sí, 15.";
  const parts = wordSegments(text, ['él']);
  assert.equal(parts.map(p => p.text).join(''), text);
  assert.deepEqual(parts.filter(p => p.word).map(p => p.word), ['Sí', "Don't", 're-read', 'él', 'sí', '15']);
});
