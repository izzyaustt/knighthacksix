import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { createSpeechCache } from '../src/speech-cache.ts';
import { spanishPronunciation } from '../../backend/src/spanish-pronunciation.ts';

class Element {
  children = []; dataset = {}; hidden = false; disabled = false; handlers = {}; text = '';
  set textContent(value) { this.text = value; this.children = []; }
  get textContent() { return this.text + this.children.map(c => c.textContent).join(''); }
  append(...nodes) { for (const node of nodes) { this.children.push(node); node.parentElement = this; } }
  replaceChildren(...nodes) { this.children = []; this.text = ''; this.append(...nodes); }
  insertBefore(node, target) { this.children.splice(this.children.indexOf(target), 0, node); node.parentElement = this; }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(c => c !== this); }
  setAttribute() {}
  addEventListener(event, handler) { this.handlers[event] = handler; }
  attachShadow() { this.shadowRoot = new Element(); return this.shadowRoot; }
  querySelectorAll(selector) {
    const nodes = this.children.flatMap(c => [c, ...c.querySelectorAll('*')]);
    return nodes.filter(c => selector === '*' || selector === 'button' && c.type === 'button' || selector === '[data-listen]' && c.dataset.listen !== undefined || selector.startsWith('#') && c.id === selector.slice(1));
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  click() { if (!this.disabled) this.handlers.click?.({ stopPropagation() {} }); }
}
const tick = () => new Promise(resolve => setImmediate(resolve));
async function fixture(apiOverride, microphone) {
  const player = new Element(), document = { createElement: () => new Element(), querySelector: selector => selector.includes('video') ? { pause() {} } : player };
  const played = [];
  const audio = class { constructor(src) { this.src = src; } pause() {} async play() { played.push(this.src); } };
  const captures = [];
  class Recorder {
    static isTypeSupported() { return true; }
    state = 'inactive'; mimeType = 'audio/webm';
    constructor() { captures.push(this); }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['clip']) }); this.onstop?.(); }
  }
  let source = await readFile(new URL('../src/practice.ts', import.meta.url), 'utf8');
  source = source.replace(/^import .*;\n/gm, '');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 } }).outputText;
  const exports = {};
  const context = { exports, document, styles: '', createSpeechCache, spanishPronunciation, createPracticeGate: () => ({ open() {}, close() {}, wait() {} }),
    api: apiOverride ?? (async path => path === '/explain' ? { gloss: 'Hello', grammar_note: '', example: '', formality: '', pronunciation: 'OH-lah' } : { transcript: 'hola', score: 1, words: [{ word: 'hola', status: 'correct' }], event_saved: true }),
    base64: async () => 'clip', logEvent() {}, location: { search: '?v=test' }, URL, URLSearchParams, crypto, Blob, Audio: audio, MediaRecorder: Recorder,
    navigator: { mediaDevices: { getUserMedia: microphone } }, setTimeout, clearTimeout, setInterval, clearInterval, console };
  vm.runInNewContext(js, context);
  await exports.openPractice({ start: 0, source: 'hello', target: 'hola' });
  const panel = player.children[0].shadowRoot;
  const button = label => panel.querySelectorAll('button').find(b => b.textContent === label);
  return { exports, panel, button, played, captures };
}

test('rapid Listen/Slow switches play only the latest requested audio', async () => {
  const requests = [];
  const f = await fixture(async path => path === '/tts' ? new Promise(resolve => requests.push(resolve)) : { gloss: 'Hello' });
  f.button('Listen').click(); await tick();
  f.button('Listen slowly').click(); await tick();
  requests[1]({ audio: 'slow' }); await tick();
  requests[0]({ audio: 'normal' }); await tick();
  assert.deepEqual(f.played, ['data:audio/mpeg;base64,slow']);
  f.exports.resetPractice();
});

test('recording blocks reference playback, returns feedback and releases the microphone', async () => {
  let released = 0;
  const f = await fixture(undefined, async () => ({ getTracks: () => [{ stop() { released++; } }] }));
  f.button('Record yourself').click(); await tick();
  assert.equal(f.button('Listen').disabled, true);
  assert.ok(f.button('Stop recording'));
  f.button('Stop recording').click(); await tick(); await tick();
  assert.ok(released > 0);
  assert.match(f.panel.querySelector('#feedback').textContent, /Words recognized: 100%/);
  assert.ok(f.button('Play my recording'));
  assert.equal(f.button('Listen').disabled, false);
  f.exports.resetPractice();
});

test('closing during microphone permission releases the eventual stream without recording', async () => {
  let resolveMic, released = 0;
  const f = await fixture(undefined, () => new Promise(resolve => { resolveMic = resolve; }));
  f.button('Record yourself').click(); await tick();
  f.exports.resetPractice();
  resolveMic({ getTracks: () => [{ stop() { released++; } }] }); await tick();
  assert.equal(released, 1); assert.equal(f.captures.length, 0);
});

test('closing an active recording discards the attempt and stops tracks', async () => {
  let released = 0, submissions = 0;
  const f = await fixture(async path => { if (path === '/stt') submissions++; return { gloss: 'Hello' }; }, async () => ({ getTracks: () => [{ stop() { released++; } }] }));
  f.button('Record yourself').click(); await tick();
  f.exports.resetPractice(); await tick();
  assert.equal(f.captures[0].state, 'inactive');
  assert.ok(released > 0); assert.equal(submissions, 0);
});

test('Spanish pronunciation appears for phrases and for a translated English word', async () => {
  const f = await fixture();
  assert.equal(f.panel.querySelector('#pronunciation').textContent, 'Say it: OH-lah');
  f.exports.resetPractice();
  const word = await fixture(async () => ({ translation: 'minutos', gloss: 'Minutes', pronunciation: 'mee-NOO-tohs' }));
  await word.exports.openPractice({ start: 0, source: 'Five minutes', target: 'Cinco minutos' }, undefined, false, { text: 'minutes', language: 'en' });
  assert.equal(word.panel.querySelector('#pronunciation').textContent, 'Say it: mee-NOO-tohs');
  assert.ok(word.panel.textContent.includes('minutos'));
  word.exports.resetPractice();
});

test('pronunciation ignores the model guide and works without a provider pronunciation field', async () => {
  const f = await fixture(async () => ({ gloss: 'Hello' }));
  assert.equal(f.panel.querySelector('#pronunciation').textContent, 'Say it: OH-lah');
  await f.exports.openPractice({ start: 0, source: 'I did', target: 'hice' });
  assert.equal(f.panel.querySelector('#pronunciation').textContent, 'Say it: EE-seh');
  assert.equal(f.panel.querySelector('#pronunciation-syllables').textContent, 'Syllables: HI-ce');
  assert.equal(f.button('Listen').disabled, false);
  f.exports.resetPractice();
});
