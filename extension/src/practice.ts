// Word/phrase practice, rendered into the learning panel's lookup view (see panel.ts).
import type { AlignedLine, Pair } from './captions';
import { logEvent } from './events';
import { api, base64 } from './api';
import { icon, type IconName } from './icons';
import { createPracticeGate } from './practice-gate';
import { createSpeechCache } from './speech-cache';
import { updateDay } from './stats';
import { spanishPronunciation } from '../../backend/src/spanish-pronunciation';

/** The panel's lookup view; content.ts attaches it with attachPracticeView(). */
export type PracticeView = { el: HTMLElement; show(title?: string): void; hide(): void };

type Attempt = { transcript: string; score: number; words: { word: string; status: string; heard?: string }[]; event_saved: boolean };
type Explanation = { gloss: string; grammar_note?: string; why_here?: string; example?: string; formality?: string; translation?: string };

const gate = createPracticeGate();
export const waitForPracticeClose = () => gate.wait();
let view: PracticeView | null = null;
let selected: { line: AlignedLine; phrase: string; translation: string; videoId: string } | null = null;
let selectionVersion = 0, audio: HTMLAudioElement | null = null;
let recorder: MediaRecorder | null = null, recordTimer: ReturnType<typeof setTimeout> | null = null;
let recordingPending = false, playbackVersion = 0;
let recordingStream: MediaStream | null = null, recordingUrl: string | null = null;
// The parts of the current lookup that recording and playback update.
let ui: { status: HTMLElement; mic: HTMLButtonElement; hint: HTMLElement; idleHint: string; attempt: HTMLElement; listen: HTMLButtonElement[] } | null = null;
const speechCache = createSpeechCache(async (text, speed) => (await api('/tts', { text, speed })).audio);

export function attachPracticeView(next: PracticeView) { view = next; }

const video = () => document.querySelector<HTMLVideoElement>('#movie_player video');
const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') => {
  const node = document.createElement(tag); node.className = className; node.textContent = text; return node;
};
function button(label: string, action: () => void | Promise<void>) {
  const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
  b.addEventListener('click', e => { e.stopPropagation(); const epoch = selectionVersion; Promise.resolve().then(action).catch(error => { if (epoch === selectionVersion) showError(error); }); });
  return b;
}
function iconButton(className: string, name: IconName, size: number, label: string, action: () => void | Promise<void>, text = '') {
  const b = button(text, action); b.className = className; b.prepend(icon(name, size));
  if (!text) b.setAttribute('aria-label', label);
  return b;
}
function showError(error: unknown) { if (ui) ui.status.textContent = error instanceof Error ? error.message : String(error); }
// `text` with the looked-up phrase highlighted, when the offset (or a search) really finds it.
function marked(text: string, phrase?: string, start?: number) {
  const p = el('p');
  const at = phrase && start != null && text.slice(start, start + phrase.length) === phrase ? start : phrase ? text.indexOf(phrase) : -1;
  if (!phrase || at < 0) { p.textContent = text; return p; }
  p.append(text.slice(0, at), el('mark', '', phrase), text.slice(at + phrase.length));
  return p;
}
function clearAudio() {
  playbackVersion++; audio?.pause(); audio = null;
  if (recordingUrl) URL.revokeObjectURL(recordingUrl);
  recordingUrl = null;
}
function recordingControls(state: 'ready' | 'permission' | 'recording' | 'checking') {
  if (!ui) return;
  ui.mic.setAttribute('aria-pressed', String(state === 'recording'));
  ui.mic.replaceChildren(icon(state === 'recording' ? 'stop' : 'mic', 30));
  ui.mic.disabled = state === 'permission' || state === 'checking';
  for (const b of ui.listen) b.disabled = state !== 'ready';
}

export function resetPractice() {
  gate.close();
  selectionVersion++; selected = null; ui = null;
  stopRecording(); recordingStream?.getTracks().forEach(t => t.stop()); recordingStream = null; recordingPending = false; clearAudio();
  view?.hide();
}

export async function openPractice(line: AlignedLine, pair?: Pair, trackLookup = true, word?: { text: string; language: 'en' | 'es' }) {
  if (!view) throw new Error('The learning panel is not ready yet.');
  gate.open();
  const epoch = ++selectionVersion;
  stopRecording(); recordingStream?.getTracks().forEach(t => t.stop()); recordingStream = null; recordingPending = false; clearAudio(); video()?.pause();
  selected = { line, phrase: word?.text ?? pair?.tgt ?? line.target, translation: word ? '' : pair?.src ?? line.source, videoId: new URLSearchParams(location.search).get('v') ?? '' };
  const snapshot = selected;
  const noun = pair || word ? 'word' : 'line';
  view.el.replaceChildren();
  view.show(pair || word ? 'Word lookup' : 'Line lookup');

  // Word, translation, explanation, pronunciation guide.
  const hero = el('div', 'hero'), wordRow = el('div', 'word-row');
  const size = snapshot.phrase.length > 28 ? ' long' : snapshot.phrase.length > 12 ? ' medium' : '';
  const title = el('h1', `word${size}`, snapshot.phrase); title.lang = word?.language ?? 'es';
  const status = el('p', 'status'); status.setAttribute('role', 'status');
  const listen = iconButton('round', 'speaker', 20, `Hear ${snapshot.phrase}`, () => speak(snapshot.phrase, 1));
  const slow = iconButton('pill-btn sm', 'speaker', 16, '', () => speak(snapshot.phrase, 0.7), 'Listen slowly');
  wordRow.append(title, listen);
  const gloss = el('p', 'gloss', snapshot.translation), grammar = el('p', 'grammar', 'Loading explanation…');
  const pron = el('p', 'pron'), syllables = el('p', 'pron-hint'), soundTips = el('p', 'pron-hint');
  pron.id = 'pronunciation'; syllables.id = 'pronunciation-syllables';
  const pronHint = el('p', 'pron-hint', 'Latin American Spanish · CAPS mark stress. Short vowels: ah / eh / ee / oh / oo.');
  const updatePronunciation = (text: string | null) => {
    if (!text) { pron.textContent = 'Pronunciation available after the Spanish translation.'; syllables.textContent = soundTips.textContent = ''; return; }
    const guide = spanishPronunciation(text);
    pron.textContent = `Say it: ${guide.respelling}`;
    syllables.textContent = `Syllables: ${guide.syllables}`;
    soundTips.textContent = guide.tips.join(' ');
  };
  updatePronunciation(word?.language === 'en' ? null : snapshot.phrase);
  const heroButtons = el('div', 'hero-btns'); heroButtons.append(slow);
  hero.append(wordRow, gloss, grammar, pron, syllables, pronHint, soundTips, heroButtons, status);

  // In this clip: the caption line with the phrase highlighted, why/example/tone, replay and save.
  const clip = el('section', 'clip'), clipHead = el('div', 'clip-head');
  clipHead.append(el('h2', 'eyebrow', 'In this clip'), el('span', '', `${clock(line.start)} – ${clock(line.end)}`));
  const clipLines = el('div', 'clip-lines'), tgtRow = el('div', 'clip-tgt-row');
  const highlightEs = word?.language === 'en' ? undefined : snapshot.phrase;
  const highlightEn = word?.language === 'en' ? word.text : pair?.src;
  const tgt = marked(line.target, highlightEs, pair?.tgtStart); tgt.className = 'clip-tgt'; tgt.lang = 'es';
  const src = marked(line.source, highlightEn, pair?.srcStart); src.className = 'clip-src';
  tgtRow.append(tgt);
  const listenLine = iconButton('round soft', 'speaker', 18, 'Hear the full line', () => speak(line.target, 1));
  if (pair || word) tgtRow.append(listenLine);
  clipLines.append(tgtRow, src);
  const block = (heading: string) => {
    const box = el('div', 'clip-block'), value = el('p', '', 'Loading…');
    box.append(el('h3', 'eyebrow', heading), value);
    return { box, value };
  };
  const why = block(pair || word ? `Why “${snapshot.phrase}” here` : 'Why it is said this way');
  const example = block('Example'), tone = block('Tone and usage');
  const details = [why, example, tone];
  const saveStatus = el('p', 'status'); saveStatus.setAttribute('role', 'status');
  let saved = false;
  const save = iconButton('pill-btn', 'bookmark', 18, '', async () => {
    if (saved) return;
    saveStatus.textContent = 'Saving…';
    try {
      await api('/vocab', { lang: 'es', word: snapshot.phrase, translation: snapshot.translation, video_id: snapshot.videoId, video_ts: line.start });
    } catch (error) { if (epoch === selectionVersion) saveStatus.textContent = `Could not save: ${error instanceof Error ? error.message : error}`; return; }
    void updateDay(d => { d.saves++; });
    if (epoch !== selectionVersion) return;
    saved = true; saveStatus.textContent = '';
    save.replaceChildren(icon('check', 18), 'Saved');
    save.setAttribute('aria-pressed', 'true');
  }, `Save ${noun}`);
  save.setAttribute('aria-pressed', 'false');
  const clipButtons = el('div', 'pair-btns');
  clipButtons.append(iconButton('pill-btn', 'replay', 18, '', () => replayClip(line, epoch), 'Replay clip'), save);
  clip.append(clipHead, clipLines, el('div', 'rule'), why.box, example.box, tone.box, clipButtons, saveStatus);

  // Say it: record, then score.
  const say = el('section', 'say'), sayRow = el('div', 'say-row'), sayText = el('div', 'say-text');
  const idleHint = `Tap the mic and say the ${noun}. Up to 15 seconds.`;
  const mic = iconButton('mic', 'mic', 30, `Record yourself saying ${snapshot.phrase}`, record);
  mic.setAttribute('aria-pressed', 'false');
  const hint = el('p', 'say-hint', idleHint); hint.setAttribute('role', 'status');
  const sayWord = el('p', `say-word${snapshot.phrase.length > 18 ? ' long' : ''}`, snapshot.phrase); sayWord.lang = 'es';
  sayText.append(sayWord, hint); sayRow.append(mic, sayText);
  const attempt = el('div', 'attempt'); attempt.id = 'attempt'; attempt.hidden = true;
  say.append(el('h2', 'eyebrow', 'Say it'), sayRow, attempt);
  ui = { status, mic, hint, idleHint, attempt, listen: [listen, slow, listenLine] };

  view.el.append(hero, clip, say);
  // Word lookups need the translation before anything can be practiced.
  const actionButtons = [listen, slow, listenLine, save, mic];
  if (word) actionButtons.forEach(b => { b.disabled = true; });
  // Persist the click independently of the explanation provider.
  if (trackLookup) logEvent({ event_type: 'lookup', lang: 'es', word: snapshot.phrase, video_id: snapshot.videoId });

  const showDetails = (e: Explanation) => {
    grammar.textContent = [e.gloss, e.grammar_note].filter(Boolean).join(' — ');
    why.value.textContent = e.why_here ?? ''; why.box.hidden = !e.why_here; // absent on an older backend
    example.value.textContent = e.example ?? ''; tone.value.textContent = e.formality ?? '';
  };
  try {
    const explanation: Explanation = await api('/explain', { phrase: snapshot.phrase, source: word ? line.source : snapshot.translation, context: line.target, lang: 'es',
      ...(word ? { word_lookup: true, word_lang: word.language, detail: 'brief' } : {}) });
    if (epoch !== selectionVersion) return;
    if (!word) { showDetails(explanation); return; }
    if (typeof explanation.translation !== 'string' || !explanation.translation.trim()) throw new Error('No word translation was returned.');
    snapshot.phrase = word.language === 'en' ? explanation.translation : word.text;
    snapshot.translation = word.language === 'en' ? word.text : explanation.translation;
    title.textContent = sayWord.textContent = snapshot.phrase; title.lang = 'es';
    gloss.textContent = snapshot.translation;
    grammar.textContent = explanation.gloss;
    updatePronunciation(snapshot.phrase);
    if (word.language === 'en') tgt.replaceWith(Object.assign(marked(line.target, snapshot.phrase), { className: 'clip-tgt', lang: 'es' }));
    actionButtons.forEach(b => { b.disabled = false; });
    // A quick lookup skips why/example/tone; load them on request.
    details.forEach(d => { d.box.hidden = true; });
    const more = button('More detail', async () => {
      more.disabled = true;
      more.textContent = 'Loading more detail…';
      try {
        const detail: Explanation = await api('/explain', { phrase: snapshot.phrase, source: snapshot.translation, context: line.target, lang: 'es' });
        if (epoch !== selectionVersion) return;
        details.forEach(d => { d.box.hidden = false; });
        showDetails(detail);
        more.remove();
      } finally { if (more.isConnected) { more.disabled = false; more.textContent = 'More detail'; } }
    });
    more.className = 'pill-btn more';
    clip.insertBefore(more, clipButtons);
  } catch (error) {
    if (epoch !== selectionVersion) return;
    grammar.textContent = `Explanation unavailable: ${error instanceof Error ? error.message : error}`;
    details.forEach(d => { d.value.textContent = 'Unavailable.'; });
  }
}

// Plays the caption line from the video, then pauses again at its end.
function replayClip(line: AlignedLine, epoch: number) {
  const v = video();
  if (!v) return;
  playbackVersion++; audio?.pause();
  const stop = () => {
    if (epoch === selectionVersion && v.currentTime < line.end) return;
    v.removeEventListener('timeupdate', stop);
    if (epoch === selectionVersion) v.pause();
  };
  v.addEventListener('timeupdate', stop);
  v.currentTime = line.start;
  return v.play();
}

async function speak(text: string, speed: number) {
  if (recordingPending || recorder?.state === 'recording' || !ui) return;
  const epoch = selectionVersion, request = ++playbackVersion, status = ui.status;
  audio?.pause(); status.textContent = 'Loading pronunciation…';
  try {
    const encoded = await speechCache.get(text, speed);
    if (epoch !== selectionVersion || request !== playbackVersion) return;
    audio = new Audio(`data:audio/mpeg;base64,${encoded}`);
    const playback = audio;
    playback.onended = () => { if (request === playbackVersion) status.textContent = 'Your turn: tap the mic and say it.'; };
    await playback.play();
    if (epoch === selectionVersion && request === playbackVersion) status.textContent = speed < 1 ? 'Playing slowly…' : 'Playing pronunciation…';
  } catch (error) { if (epoch === selectionVersion && request === playbackVersion) showError(error); }
}

function stopRecording() {
  if (recordTimer) clearInterval(recordTimer); recordTimer = null;
  if (recorder?.state === 'recording') recorder.stop();
}

function showAttempt(result: Attempt, epoch: number) {
  if (!ui) return;
  const head = el('div', 'attempt-head'), chips = el('div', 'word-chips'), buttons = el('div', 'pair-btns');
  head.append(el('span', '', 'Your attempt'), el('span', 'score', `${Math.round(result.score * 100)}%`));
  for (const w of result.words) {
    const chip = el('span', '', w.status === 'correct' ? `${w.word} ✓` : `${w.word} · ${w.heard ? `heard “${w.heard}”` : 'missed'}`);
    chip.dataset.status = w.status;
    chip.title = w.status === 'correct' ? 'Recognized' : w.heard ? `Heard “${w.heard}” instead. Try again.` : 'Not recognized. Try again.';
    chips.append(chip);
  }
  const retry = result.words.filter(w => w.status !== 'correct').map(w => w.word);
  const notes = el('p', '', [
    `Heard: ${result.transcript || '(nothing)'}`,
    retry.length ? `Listen slowly, then retry: ${retry.join(', ')}.` : 'All target words were recognized. Try again at normal speed.',
    'This compares the transcript, rather than grading your accent.',
    result.event_saved ? 'Saved to your progress.' : 'Feedback received, but progress was not saved.',
  ].join('\n'));
  const hearYours = iconButton('pill-btn sm', 'play', 16, '', async () => {
    if (!recordingUrl || recorder?.state === 'recording' || recordingPending) return;
    const request = ++playbackVersion; audio?.pause(); audio = new Audio(recordingUrl);
    await audio.play();
    if (epoch === selectionVersion && request === playbackVersion && ui) ui.status.textContent = 'Playing your recording…';
  }, 'Hear yours');
  ui.listen.push(hearYours);
  buttons.append(hearYours, iconButton('pill-btn sm dark', 'replay', 16, '', record, 'Try again'));
  ui.attempt.replaceChildren(head, chips, notes, buttons); ui.attempt.hidden = false;
}

async function record() {
  if (recorder?.state === 'recording') { stopRecording(); return; }
  if (recordingPending || !selected || !ui) return;
  const snapshot = selected, epoch = selectionVersion, { hint, idleHint, status } = ui;
  clearAudio(); status.textContent = '';
  recordingPending = true; recordingControls('permission');
  hint.textContent = 'Requesting microphone…';
  let stream: MediaStream | undefined;
  try {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error('Audio recording is unavailable in this browser.');
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    if (epoch !== selectionVersion) { stream.getTracks().forEach(t => t.stop()); return; }
    recordingStream = stream;
    const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(t => MediaRecorder.isTypeSupported(t));
    const capture = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorder = capture;
    const chunks: BlobPart[] = [];
    let failed = false;
    const release = () => {
      stream?.getTracks().forEach(t => t.stop());
      if (recorder === capture) { recorder = null; stopRecording(); recordingStream = null; }
    };
    capture.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    capture.onstop = async () => {
      release();
      if (epoch !== selectionVersion || failed) return;
      hint.textContent = 'Checking your recording…';
      recordingPending = true; recordingControls('checking');
      try {
        const blob = new Blob(chunks, { type: capture.mimeType });
        if (!blob.size) throw new Error('No audio recorded. Try again.');
        recordingUrl = URL.createObjectURL(blob);
        const result: Attempt = await api('/stt', { audio: await base64(blob), mime: blob.type, attempt_id: crypto.randomUUID(),
          target_text: snapshot.phrase, lang: 'es', video_id: snapshot.videoId, video_ts: snapshot.line.start });
        if (epoch === selectionVersion) { showAttempt(result, epoch); hint.textContent = idleHint; }
      } catch (error) { if (epoch === selectionVersion) hint.textContent = `Recording failed: ${error instanceof Error ? error.message : error}`; }
      finally { if (epoch === selectionVersion) { recordingPending = false; recordingControls('ready'); } }
    };
    capture.onerror = () => {
      failed = true; if (capture.state === 'recording') capture.stop(); release();
      if (epoch === selectionVersion) { recordingPending = false; recordingControls('ready'); hint.textContent = 'Recording failed. Check your microphone and try again.'; }
    };
    capture.start(); recordingPending = false; recordingControls('recording');
    let seconds = 0;
    hint.textContent = 'Recording… 0 / 15 seconds. Tap the mic again to stop.';
    recordTimer = setInterval(() => {
      seconds++; hint.textContent = `Recording… ${seconds} / 15 seconds. Tap the mic again to stop.`;
      if (seconds >= 15) stopRecording();
    }, 1000);
  } catch (error) {
    stream?.getTracks().forEach(t => t.stop());
    if (epoch === selectionVersion) {
      recordingPending = false; recordingControls('ready');
      hint.textContent = `Microphone unavailable: ${error instanceof Error ? error.message : error}. Check microphone permission for YouTube in Chrome site settings.`;
    }
  }
}
