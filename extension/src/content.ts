import { activeIndex, jsonCaptions, segments } from './captions';
import type { Line, AlignedLine, Pair } from './captions';
import { api, base64 } from './api';
import { logEvent } from './events';
import { icon, type IconName } from './icons';
import { createPanel } from './panel';
import { updateDay } from './stats';
import { startWatchTracker, type WatchTracker } from './watch';
import styles from './style.css?inline';

let videoId = '', sourceKey = '', generation = 0;
let lines: Line[] = [], aligned = new Map<number, AlignedLine>();
let enabled = true, rendered = -2, host: HTMLElement | null = null;
let root: ShadowRoot, status: HTMLElement, captions: HTMLElement;
let selected: { line: AlignedLine; phrase: string; translation: string; videoId: string } | null = null;
let selectionVersion = 0, audio: HTMLAudioElement | null = null;
let recorder: MediaRecorder | null = null, recordTimer: ReturnType<typeof setTimeout> | null = null;
let recordingPending = false;
let watch: WatchTracker | null = null;

const video = () => document.querySelector<HTMLVideoElement>('#movie_player video');
const currentId = () => new URLSearchParams(location.search).get('v') ?? '';
const isWatchPage = () => location.pathname === '/watch';

// Learning panel (toolbar icon / Alt+L). Phrase practice opens inside it.
const sidebar = createPanel({
  getVideo: video,
  getVideoId: () => (isWatchPage() && videoId ? videoId : null),
  pendingWatch: () => watch?.pending() ?? new Map(),
  captionsOn: () => enabled,
  setCaptionsOn: setEnabled,
  onClose: () => { stopRecording(); audio?.pause(); },
  onLookupBack: () => { selectionVersion++; stopRecording(); audio?.pause(); },
});
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'll:toggle-panel') sidebar.toggle();
});

function setEnabled(on: boolean) {
  enabled = on; rendered = -2;
  if (host) {
    captions.hidden = !enabled;
    root.querySelector('.toolbar button')!.textContent = enabled ? 'Spanish overlay' : 'Overlay off';
  }
  sidebar.practice.hide();
  if (!enabled) { selectionVersion++; stopRecording(); audio?.pause(); }
  tick();
}
function button(label: string, action: () => void | Promise<void>) {
  const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
  b.addEventListener('click', e => { e.stopPropagation(); Promise.resolve(action()).catch(showError); });
  return b;
}
function showError(error: unknown) { status.textContent = error instanceof Error ? error.message : String(error); }
function mount() {
  const player = document.querySelector<HTMLElement>('#movie_player');
  if (!player) return false;
  if (host?.parentElement === player) return true;
  host?.remove();
  host = document.createElement('div'); host.id = 'll-learning-overlay';
  root = host.attachShadow({ mode: 'open' });
  const css = document.createElement('style'); css.textContent = styles; root.append(css);
  const toolbar = document.createElement('div'); toolbar.className = 'toolbar';
  toolbar.append(button(enabled ? 'Spanish overlay' : 'Overlay off', () => setEnabled(!enabled)),
    button('Retry', () => { void translate(generation); }));
  status = document.createElement('span'); status.setAttribute('role', 'status'); status.textContent = 'Waiting for English captions. Turn on CC.';
  toolbar.append(status);
  captions = document.createElement('div'); captions.className = 'captions'; captions.hidden = !enabled;
  root.append(toolbar, captions); player.append(host);
  return true;
}
function reset() {
  generation++; videoId = currentId(); sourceKey = ''; lines = []; aligned.clear(); rendered = -2;
  selected = null; selectionVersion++; stopRecording(); audio?.pause();
  watch?.stop(); watch = null;
  sidebar.reset(); sidebar.setStatus(isWatchPage() ? { kind: 'waiting' } : { kind: 'idle' });
  sidebar.practice.hide();
  document.querySelector('#movie_player')?.classList.remove('ll-active');
  if (mount()) { captions.replaceChildren(); status.textContent = 'Waiting for English captions. Turn on CC.'; }
}
function parse(body: string): Line[] {
  if (body.trim().startsWith('{')) return jsonCaptions(body);
  const doc = new DOMParser().parseFromString(body, 'text/xml');
  if (doc.querySelector('parsererror')) throw new Error('Could not parse captions.');
  return [...doc.querySelectorAll('p, text')].map(n => {
    const ms = n.hasAttribute('t');
    const start = Number(n.getAttribute(ms ? 't' : 'start') ?? 0) / (ms ? 1000 : 1);
    const end = start + Number(n.getAttribute(ms ? 'd' : 'dur') ?? 0) / (ms ? 1000 : 1);
    return { start, end, text: (n.textContent ?? '').replace(/\s+/g, ' ').trim() };
  }).filter(l => l.text && Number.isFinite(l.start) && l.end > l.start);
}
let translating = -1;
async function translate(epoch: number) {
  if (translating === epoch || !lines.length) return;
  translating = epoch;
  const capturedLines = lines, capturedId = videoId;
  const total = Math.ceil(lines.length / 30);
  let done = 0;
  sidebar.setStatus({ kind: 'aligning', done, total });
  try {
    // Start near playback so seeking and long videos do not wait for earlier batches.
    const active = Math.max(0, activeIndex(capturedLines, video()?.currentTime ?? 0));
    const first = Math.floor(active / 30) * 30;
    const batches = [first, ...Array.from({ length: Math.ceil(lines.length / 30) }, (_, i) => i * 30).filter(i => i !== first)];
    for (const startIndex of batches) {
      if (epoch !== generation) return;
      const chunk = capturedLines.slice(startIndex, startIndex + 30);
      if (chunk.every((_, i) => aligned.has(startIndex + i))) { done++; continue; }
      status.textContent = `Translating captions ${startIndex + 1}–${startIndex + chunk.length}…`;
      const result = await api('/align', { videoId: capturedId, lang: 'es', level: 'medium', startIndex, lines: chunk });
      if (epoch !== generation) return;
      if (!Array.isArray(result.lines) || result.lines.length !== chunk.length || result.lines.some((l: AlignedLine) => !l.target)) {
        throw new Error('Translation did not finish. Check Gemini configuration, then click Retry.');
      }
      result.lines.forEach((line: AlignedLine, i: number) => aligned.set(startIndex + i, line));
      rendered = -2; tick();
      sidebar.setStatus({ kind: 'aligning', done: ++done, total });
    }
    if (epoch === generation) {
      status.textContent = 'Ready · click a colored phrase to practice';
      sidebar.setStatus({ kind: 'ready', total, failed: 0 });
    }
  } catch (error) {
    if (epoch === generation) { showError(error); sidebar.setStatus({ kind: 'ready', total, failed: total - done }); }
  }
  finally { if (translating === epoch) translating = -1; }
}

window.addEventListener('message', e => {
  if (e.source !== window || e.data?.source !== 'LL') return;
  if (currentId() !== videoId) reset();
  if (!mount()) return;
  if (e.data.type === 'tracks') {
    if (e.data.videoId === videoId && !e.data.tracks?.some((t: any) => t.lang?.startsWith('en'))) status.textContent = 'This video needs English captions.';
    return;
  }
  if (e.data.type !== 'captions' || typeof e.data.body !== 'string' || e.data.body.length > 5_000_000) return;
  try {
    const url = new URL(e.data.url, location.origin);
    if (url.origin !== location.origin || !url.pathname.includes('/api/timedtext') || url.searchParams.get('v') !== videoId) return;
    if (!url.searchParams.get('lang')?.startsWith('en')) return;
    const key = `${videoId}|${url.searchParams.get('lang')}|${e.data.body}`;
    if (key === sourceKey) return;
    const parsed = parse(e.data.body).sort((a, b) => a.start - b.start);
    if (!parsed.length) return;
    generation++; sourceKey = key; lines = parsed; aligned.clear(); rendered = -2;
    // caption_view: once when captions load, then once per minute actually watched.
    const v = video(), id = videoId;
    watch?.stop();
    watch = v && startWatchTracker(v, () =>
      logEvent({ event_type: 'caption_view', video_id: id, lang: 'es', meta: { reason: 'minute' } }));
    logEvent({ event_type: 'caption_view', video_id: id, lang: 'es', meta: { reason: 'loaded', lines: parsed.length } });
    void translate(generation);
  } catch (error) { showError(error); }
});
document.addEventListener('yt-navigate-start', reset);
document.addEventListener('yt-navigate-finish', () => {
  if (currentId() !== videoId) reset();
  mount(); window.postMessage({ source: 'LL', type: 'ready' }, '*');
});

function tick() {
  const player = document.querySelector('#movie_player');
  if (currentId() !== videoId) reset();
  if (!mount()) return;
  const v = video();
  const index = v && enabled && !player?.classList.contains('ad-showing') ? activeIndex(lines, v.currentTime) : -1;
  const line = aligned.get(index);
  player?.classList.toggle('ll-active', enabled && !!line);
  if (rendered === index) return;
  rendered = index; captions.replaceChildren();
  if (!enabled || index < 0) return;
  if (!line) return; // not translated yet: YouTube's own caption stays visible
  for (const target of [false, true]) {
    const row = document.createElement('div'); row.className = target ? 'target' : 'source';
    for (const part of segments(line, target)) {
      if (!part.pair) row.append(document.createTextNode(part.text));
      else {
        const pair = part.pair;
        const span = button(part.text, () => selectPhrase(line, pair));
        span.className = `phrase color-${pair.color % 3}`;
        row.append(span);
      }
    }
    captions.append(row);
  }
  const practice = button('Practice this line', () => selectPhrase(line)); practice.className = 'practice'; captions.append(practice);
}

type Attempt = { transcript: string; score: number; words: { word: string; status: string; heard?: string }[]; event_saved: boolean };
// The parts of the lookup view that recording updates.
type LookupUi = { mic: HTMLButtonElement; hint: HTMLElement; idleHint: string; showAttempt(result: Attempt, recording: string): void };
let lookupUi: LookupUi | null = null;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') => {
  const node = document.createElement(tag); node.className = className; node.textContent = text; return node;
};
function iconButton(className: string, name: IconName, size: number, label: string, action: () => void | Promise<void>, text = '') {
  const b = button(text, action); b.className = className; b.prepend(icon(name, size));
  if (!text) b.setAttribute('aria-label', label);
  return b;
}
const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
// `text` with the looked-up phrase highlighted, when its offset really points at it.
function marked(text: string, phrase?: string, start?: number) {
  const p = el('p');
  if (!phrase || start == null || text.slice(start, start + phrase.length) !== phrase) { p.textContent = text; return p; }
  p.append(text.slice(0, start), el('mark', '', phrase), text.slice(start + phrase.length));
  return p;
}

// Builds the word lookup view inside the learning panel (and opens the panel if it is closed).
async function selectPhrase(line: AlignedLine, pair?: Pair) {
  stopRecording(); audio?.pause(); video()?.pause();
  const epoch = ++selectionVersion;
  selected = { line, phrase: pair?.tgt ?? line.target, translation: pair?.src ?? line.source, videoId };
  const snapshot = selected;
  const noun = pair ? 'word' : 'line';
  const view = sidebar.practice.el;
  view.replaceChildren(); sidebar.practice.show(pair ? 'Word lookup' : 'Line lookup');

  // Word, gloss, grammar note. Gloss shows the aligned translation until /explain answers.
  const hero = el('div', 'hero'), wordRow = el('div', 'word-row');
  const size = snapshot.phrase.length > 28 ? ' long' : snapshot.phrase.length > 12 ? ' medium' : '';
  const word = el('h1', `word${size}`, snapshot.phrase); word.lang = 'es';
  const audioStatus = el('p', 'status'); audioStatus.setAttribute('role', 'status');
  wordRow.append(word, iconButton('round', 'speaker', 20, `Hear ${snapshot.phrase}`, () => speak(snapshot.phrase, audioStatus)));
  const gloss = el('p', 'gloss', snapshot.translation), grammar = el('p', 'grammar', 'Loading…');
  hero.append(wordRow, gloss, grammar, audioStatus);

  // In this clip: the caption line with the phrase highlighted, example, tone, replay and save.
  const clip = el('section', 'clip'), clipHead = el('div', 'clip-head');
  clipHead.append(el('h2', 'eyebrow', 'In this clip'), el('span', '', `${clock(line.start)} – ${clock(line.end)}`));
  const clipLines = el('div', 'clip-lines'), tgtRow = el('div', 'clip-tgt-row');
  const tgt = marked(line.target, pair?.tgt, pair?.tgtStart); tgt.className = 'clip-tgt'; tgt.lang = 'es';
  const src = marked(line.source, pair?.src, pair?.srcStart); src.className = 'clip-src';
  tgtRow.append(tgt);
  if (pair) tgtRow.append(iconButton('round soft', 'speaker', 18, 'Hear the full line', () => speak(line.target, audioStatus)));
  clipLines.append(tgtRow, src);
  const block = (title: string) => {
    const box = el('div', 'clip-block'), value = el('p', '', 'Loading…');
    box.append(el('h3', 'eyebrow', title), value);
    return { box, value };
  };
  const why = block(pair ? `Why “${snapshot.phrase}” here` : 'Why it is said this way');
  const example = block('Example'), tone = block('Tone and usage');
  const saveStatus = el('p', 'status'); saveStatus.setAttribute('role', 'status');
  let saved = false, sent = false;
  const save = iconButton('pill-btn', 'bookmark', 18, '', async () => {
    if (!saved && !sent) {
      saveStatus.textContent = 'Saving…';
      try {
        await api('/vocab', { user_id: 'demo-user', lang: 'es', word: snapshot.phrase, translation: snapshot.translation, video_id: snapshot.videoId, video_ts: line.start });
      } catch (error) { saveStatus.textContent = `Could not save: ${error instanceof Error ? error.message : error}`; return; }
      void updateDay(d => { d.saves++; });
      sent = true; saveStatus.textContent = '';
    }
    saved = !saved;
    save.replaceChildren(icon(saved ? 'check' : 'bookmark', 18), saved ? 'Saved' : `Save ${noun}`);
    save.setAttribute('aria-pressed', String(saved));
  }, `Save ${noun}`);
  save.setAttribute('aria-pressed', 'false');
  const clipButtons = el('div', 'pair-btns');
  clipButtons.append(iconButton('pill-btn', 'replay', 18, '', () => replayClip(line, epoch), 'Replay clip'), save);
  clip.append(clipHead, clipLines, el('div', 'rule'), why.box, example.box, tone.box, clipButtons, saveStatus);

  // Say it: record, then score.
  const say = el('section', 'say'), sayRow = el('div', 'say-row'), sayText = el('div', 'say-text');
  const idleHint = `Tap the mic and say the ${noun}.`;
  const mic = iconButton('mic', 'mic', 30, `Record yourself saying ${snapshot.phrase}`, record);
  mic.setAttribute('aria-pressed', 'false');
  const hint = el('p', 'say-hint', idleHint); hint.setAttribute('role', 'status');
  const sayWord = el('p', `say-word${snapshot.phrase.length > 18 ? ' long' : ''}`, snapshot.phrase); sayWord.lang = 'es';
  sayText.append(sayWord, hint); sayRow.append(mic, sayText);
  const attempt = el('div', 'attempt'); attempt.hidden = true;
  say.append(el('h2', 'eyebrow', 'Say it'), sayRow, attempt);
  lookupUi = {
    mic, hint, idleHint,
    showAttempt(result, recording) {
      const head = el('div', 'attempt-head'), chips = el('div', 'word-chips'), buttons = el('div', 'pair-btns');
      head.append(el('span', '', 'Your attempt'), el('span', 'score', `${Math.round(result.score * 100)}%`));
      for (const w of result.words) {
        const chip = el('span', '', w.status === 'correct' ? `${w.word} ✓` : `${w.word} · ${w.status === 'missed' ? 'missed' : `heard “${w.heard ?? '?'}”`}`);
        chip.dataset.status = w.status; chips.append(chip);
      }
      const heard = el('p', '', `Heard: ${result.transcript || '(nothing)'}${result.event_saved ? '' : '\nScore received, but progress was not saved.'}`);
      buttons.append(
        iconButton('pill-btn sm', 'play', 16, '', () => { audio?.pause(); audio = new Audio(recording); return audio.play(); }, 'Hear yours'),
        iconButton('pill-btn sm dark', 'replay', 16, '', record, 'Try again'));
      attempt.replaceChildren(head, chips, heard, buttons); attempt.hidden = false;
    },
  };

  view.append(hero, clip, say);
  // Persist the click independently of the explanation provider.
  void updateDay(d => { d.lookups++; }); // local count for the learning panel
  void api('/events', { user_id: 'demo-user', event_id: crypto.randomUUID(), event_type: 'lookup', lang: 'es', word: snapshot.phrase, video_id: snapshot.videoId }).catch(showError);
  try {
    const explanation = await api('/explain', { phrase: snapshot.phrase, source: snapshot.translation, context: line.target, lang: 'es' });
    if (epoch !== selectionVersion) return;
    gloss.textContent = explanation.gloss; grammar.textContent = explanation.grammar_note;
    example.value.textContent = explanation.example; tone.value.textContent = explanation.formality;
    why.value.textContent = explanation.why_here ?? ''; why.box.hidden = !explanation.why_here; // absent on an older backend
  } catch (error) {
    if (epoch !== selectionVersion) return;
    grammar.textContent = `Explanation unavailable: ${error instanceof Error ? error.message : error}`;
    why.value.textContent = example.value.textContent = tone.value.textContent = 'Unavailable.';
  }
}
// Plays the caption line from the video, then pauses again at its end.
function replayClip(line: AlignedLine, epoch: number) {
  const v = video();
  if (!v) return;
  audio?.pause();
  const stop = () => {
    if (epoch === selectionVersion && v.currentTime < line.end) return;
    v.removeEventListener('timeupdate', stop);
    if (epoch === selectionVersion) v.pause();
  };
  v.addEventListener('timeupdate', stop);
  v.currentTime = line.start;
  return v.play();
}
async function speak(text: string, note: HTMLElement) {
  const epoch = selectionVersion;
  audio?.pause(); note.textContent = 'Loading audio…';
  try {
    const result = await api('/tts', { text, speed: 1 });
    if (epoch !== selectionVersion) return;
    audio?.pause(); audio = new Audio(`data:audio/mpeg;base64,${result.audio}`);
    await audio.play(); note.textContent = '';
  } catch (error) { note.textContent = `Audio unavailable: ${error instanceof Error ? error.message : error}`; }
}
function stopRecording() {
  if (recordTimer) clearTimeout(recordTimer); recordTimer = null;
  if (recorder?.state === 'recording') recorder.stop();
}
async function record() {
  if (recorder?.state === 'recording') { stopRecording(); return; }
  if (recordingPending || !selected || !lookupUi) return;
  const snapshot = selected, epoch = selectionVersion, ui = lookupUi;
  const recording = (on: boolean) => { ui.mic.setAttribute('aria-pressed', String(on)); ui.mic.replaceChildren(icon(on ? 'stop' : 'mic', 30)); };
  recordingPending = true;
  ui.hint.textContent = 'Requesting microphone…';
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (epoch !== selectionVersion) { stream.getTracks().forEach(t => t.stop()); return; }
    const mimeType = ['audio/webm;codecs=opus', 'audio/webm'].find(t => MediaRecorder.isTypeSupported(t));
    const capture = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorder = capture;
    const chunks: BlobPart[] = [];
    capture.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    capture.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      if (recorder === capture) recorder = null;
      recording(false);
      if (epoch !== selectionVersion) return;
      ui.hint.textContent = 'Checking your recording…';
      recordingPending = true;
      try {
        const blob = new Blob(chunks, { type: capture.mimeType });
        if (!blob.size) throw new Error('No audio recorded. Try again.');
        const encoded = await base64(blob);
        const result = await api('/stt', { audio: encoded, mime: blob.type, attempt_id: crypto.randomUUID(),
          user_id: 'demo-user', target_text: snapshot.phrase, lang: 'es', video_id: snapshot.videoId, video_ts: snapshot.line.start });
        if (epoch !== selectionVersion) return;
        ui.showAttempt(result, `data:${blob.type};base64,${encoded}`);
        ui.hint.textContent = ui.idleHint;
      } catch (error) { if (epoch === selectionVersion) ui.hint.textContent = `Recording failed: ${error instanceof Error ? error.message : error}`; }
      finally { recordingPending = false; }
    };
    capture.onerror = () => { stream.getTracks().forEach(t => t.stop()); recording(false); ui.hint.textContent = 'Recording failed. Try again.'; };
    capture.start(); recording(true);
    ui.hint.textContent = 'Recording… tap again to stop (15-second limit).';
    recordTimer = setTimeout(stopRecording, 15000);
  } catch (error) { ui.hint.textContent = `Microphone unavailable: ${error instanceof Error ? error.message : error}. Allow microphone access for YouTube in Chrome site settings.`; }
  finally { recordingPending = false; }
}
// Hide native captions only while a translated line is actually visible.
const nativeStyle = document.createElement('style');
nativeStyle.textContent = '#movie_player.ll-active .ytp-caption-window-container { visibility: hidden !important; }';
document.documentElement.append(nativeStyle);
reset(); setInterval(tick, 200);
window.postMessage({ source: 'LL', type: 'ready' }, '*');
