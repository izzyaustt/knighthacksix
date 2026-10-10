import test from 'node:test';
import assert from 'node:assert/strict';
import { createCaptionBuffer } from '../src/caption-buffer.ts';

class Video extends EventTarget {
  paused = false;
  currentTime = 0;
  resumes = 0;
  pause() { this.paused = true; }
  play() { this.paused = false; this.resumes++; return Promise.resolve(); }
  closest() { return null; }
}
const fixture = () => [{ start: 0, end: 2, src: 'Hello', tgt: '', pairs: [] }, { start: 2, end: 5, src: 'Friend', tgt: '', pairs: [] }];

test('playback waits for current captions and a short buffer, then resumes', () => {
  const video = new Video(), lines = fixture();
  let waiting = false;
  const buffer = createCaptionBuffer(video, () => lines, value => { waiting = value; });
  buffer.update();
  assert.equal(video.paused, true);
  assert.equal(waiting, true);
  lines[0].tgt = 'Hola'; buffer.update();
  assert.equal(video.paused, true);
  lines[1].tgt = 'Amigo'; buffer.update();
  assert.equal(video.paused, false);
  assert.equal(video.resumes, 1);
  assert.equal(waiting, false);
  buffer.destroy();
});

test('a user-paused video is never automatically started', () => {
  const video = new Video(), lines = fixture(); video.paused = true;
  const buffer = createCaptionBuffer(video, () => lines, () => {});
  buffer.update(); lines.forEach(line => { line.tgt = 'listo'; }); buffer.update();
  assert.equal(video.resumes, 0);
  buffer.destroy();
});

test('overlapping earlier captions do not block an already translated current line', () => {
  const video = new Video(); video.currentTime = 3;
  const lines = [{ start: 0, end: 10, src: 'old', tgt: '', pairs: [] }, { start: 2, end: 8, src: 'new', tgt: 'nuevo', pairs: [] }];
  const buffer = createCaptionBuffer(video, () => lines, () => {});
  buffer.update();
  assert.equal(video.paused, false);
  buffer.destroy();
});

test('disabling bilingual captions releases playback; navigation cleanup never resumes it', () => {
  const video = new Video();
  const buffer = createCaptionBuffer(video, fixture, () => {});
  buffer.update(); buffer.setEnabled(false);
  assert.equal(video.resumes, 1);
  buffer.setEnabled(true); buffer.destroy();
  video.dispatchEvent(new Event('play'));
  assert.equal(video.resumes, 1);
});
