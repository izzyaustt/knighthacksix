import type { AlignedLine, Pair } from './captions';
import { logEvent } from './events';
import { api, base64 } from './api';
import styles from './practice.css?inline';
import { createPracticeGate } from './practice-gate';
import { createSpeechCache } from './speech-cache';
import { spanishPronunciation } from '../../backend/src/spanish-pronunciation';
const gate = createPracticeGate();
export const waitForPracticeClose = () => gate.wait();
let host: HTMLElement | null = null;
let root: ShadowRoot, panel: HTMLElement, status: HTMLElement;
let selected: { line: AlignedLine; phrase: string; translation: string; videoId: string } | null = null;
let selectionVersion = 0, audio: HTMLAudioElement | null = null;
let recorder: MediaRecorder | null = null, recordTimer: ReturnType<typeof setTimeout> | null = null;
let recordingPending = false, playbackVersion = 0;
let recordingStream: MediaStream | null = null, recordingUrl: string | null = null;
const speechCache = createSpeechCache(async (text, speed) => (await api('/tts', { text, speed })).audio);
function clearAudio() {
  playbackVersion++; audio?.pause(); audio = null;
  if (recordingUrl) URL.revokeObjectURL(recordingUrl);
  recordingUrl = null;
}
function recordingControls(state: 'ready' | 'permission' | 'recording' | 'checking') {
  const b = root.querySelector<HTMLButtonElement>('#record');
  if (b) { b.textContent = { ready: 'Record yourself', permission: 'Allow microphone…', recording: 'Stop recording', checking: 'Checking…' }[state]; b.disabled = state === 'permission' || state === 'checking'; }
  root.querySelectorAll<HTMLButtonElement>('[data-listen]').forEach(b => { b.disabled = state !== 'ready'; });
}
const video = () => document.querySelector<HTMLVideoElement>('#movie_player video');
function button(label: string, action: () => void | Promise<void>) {
  const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
  b.addEventListener('click', e => { e.stopPropagation(); const epoch = selectionVersion; Promise.resolve().then(action).catch(error => { if (epoch === selectionVersion) showError(error); }); });
  return b;
}
function showError(error: unknown) { status.textContent = error instanceof Error ? error.message : String(error); }
function mount() {
  const player = document.querySelector<HTMLElement>('#movie_player');
  if (!player) throw new Error('Open a YouTube video first.');
  if (host?.parentElement === player) return;
  host?.remove(); host = document.createElement('div'); host.id = 'll-practice-host';
  root = host.attachShadow({ mode: 'open' });
  const css = document.createElement('style'); css.textContent = styles;
  panel = document.createElement('section'); panel.className = 'panel';
  panel.setAttribute('aria-label', 'Phrase practice');
  status = document.createElement('p'); status.setAttribute('role', 'status');
  root.append(css, panel); player.append(host);
}
export function resetPractice() {
  gate.close();
  selectionVersion++; selected = null; stopRecording(); recordingStream?.getTracks().forEach(t => t.stop()); recordingStream = null; recordingPending = false; clearAudio();
  if (panel) panel.hidden = true;
}
export async function openPractice(line: AlignedLine, pair?: Pair, trackLookup = true, word?: { text: string; language: 'en' | 'es' }) {
  mount();
  gate.open();
  const epoch = ++selectionVersion;
  stopRecording(); recordingStream?.getTracks().forEach(t => t.stop()); recordingStream = null; recordingPending = false; clearAudio(); video()?.pause();
  selected = { line, phrase: word?.text ?? pair?.tgt ?? line.target, translation: word ? '' : pair?.src ?? line.source, videoId: new URLSearchParams(location.search).get('v') ?? '' };
  const snapshot = selected;
  panel.replaceChildren(); panel.hidden = false; status.textContent = '';
  panel.append(button('Close', resetPractice));
  const title = document.createElement('h3'); title.textContent = snapshot.phrase; panel.append(title);
  const pronunciation = document.createElement('p'); pronunciation.id = 'pronunciation';
  const syllables = document.createElement('p'); syllables.id = 'pronunciation-syllables';
  const pronunciationHint = document.createElement('small'); pronunciationHint.className = 'pronunciation-hint';
  const soundTips = document.createElement('small'); soundTips.className = 'pronunciation-hint';
  pronunciationHint.textContent = 'Latin American Spanish · CAPS mark stress. Short vowels: ah / eh / ee / oh / oo. Listen for the exact sounds.';
  panel.append(pronunciation, syllables, pronunciationHint, soundTips);
  const updatePronunciation = (text: string | null) => {
    if (!text) { pronunciation.textContent = 'Pronunciation available after the Spanish translation.'; syllables.textContent = ''; soundTips.textContent = ''; return; }
    const guide = spanishPronunciation(text);
    pronunciation.textContent = `Say it: ${guide.respelling}`;
    syllables.textContent = `Syllables: ${guide.syllables}`;
    soundTips.textContent = guide.tips.join(' ');
  };
  updatePronunciation(word?.language === 'en' ? null : snapshot.phrase);
  const gloss = document.createElement('p'); gloss.textContent = snapshot.translation; panel.append(gloss);
  const notes = document.createElement('p'); notes.textContent = 'Loading explanation…'; panel.append(notes);
  const actions = document.createElement('div'); actions.className = 'actions';
  const listen = button('Listen', () => speak(snapshot.phrase, 1)); listen.dataset.listen = '';
  const slow = button('Listen slowly', () => speak(snapshot.phrase, 0.7)); slow.dataset.listen = '';
  const recordButton = button('Record yourself', record); recordButton.id = 'record';
  actions.append(listen, slow,
    button('Save phrase', async () => {
      await api('/vocab', { user_id: 'demo-user', lang: 'es', word: snapshot.phrase, translation: snapshot.translation, video_id: snapshot.videoId, video_ts: line.start });
      if (epoch === selectionVersion) notes.textContent = 'Saved to vocabulary.';
    }), recordButton, button('Stop audio', () => { playbackVersion++; audio?.pause(); status.textContent = ''; }));
  const result = document.createElement('div'); result.id = 'feedback'; result.setAttribute('role', 'status');
  result.textContent = 'Record up to 15 seconds. Your browser will ask for microphone access.';
  panel.append(actions, result, status);
  if (word) actions.querySelectorAll('button').forEach(b => { b.disabled = true; });
  // Persist the click independently of the explanation provider.
  if (trackLookup) logEvent({ event_type: 'lookup', lang: 'es', word: snapshot.phrase, video_id: snapshot.videoId });
  try {
    const explanation = await api('/explain', { phrase: snapshot.phrase, source: word ? line.source : snapshot.translation, context: line.target, lang: 'es',
      ...(word ? { word_lookup: true, word_lang: word.language, detail: 'brief' } : {}) });
    if (epoch === selectionVersion) {
      if (word) {
        if (typeof explanation.translation !== 'string' || !explanation.translation.trim()) throw new Error('No word translation was returned.');
        snapshot.phrase = word.language === 'en' ? explanation.translation : word.text;
        snapshot.translation = word.language === 'en' ? word.text : explanation.translation;
        title.textContent = snapshot.phrase;
        gloss.textContent = snapshot.translation;
        updatePronunciation(snapshot.phrase);
        actions.querySelectorAll('button').forEach(b => { b.disabled = false; });
      }
      notes.textContent = word ? explanation.gloss : `${explanation.gloss}\n${explanation.grammar_note}\nExample: ${explanation.example}\nTone: ${explanation.formality}`;
      if (word) {
        const more = button('More detail', async () => {
          more.disabled = true;
          status.textContent = 'Loading more detail…';
          try {
            const detail = await api('/explain', { phrase: snapshot.phrase, source: snapshot.translation, context: line.target, lang: 'es' });
            if (epoch !== selectionVersion) return;
            notes.textContent = `${detail.gloss}\n${detail.grammar_note}\nExample: ${detail.example}\nTone: ${detail.formality}`;
            status.textContent = '';
          } finally { if (epoch === selectionVersion) more.disabled = false; }
        });
        panel.insertBefore(more, actions);
      }
    }
  } catch (error) { if (epoch === selectionVersion) { notes.textContent = `Explanation unavailable: ${error instanceof Error ? error.message : error}`; } }
}
async function speak(text: string, speed: number) {
  if (recordingPending || recorder?.state === 'recording') return;
  const epoch = selectionVersion, request = ++playbackVersion;
  audio?.pause(); status.textContent = 'Loading pronunciation…';
  try {
    const encoded = await speechCache.get(text, speed);
    if (epoch !== selectionVersion || request !== playbackVersion) return;
    audio = new Audio(`data:audio/mpeg;base64,${encoded}`);
    const playback = audio;
    playback.onended = () => { if (request === playbackVersion) status.textContent = 'Your turn — record yourself saying the Spanish text.'; };
    await playback.play();
    if (epoch === selectionVersion && request === playbackVersion) status.textContent = speed < 1 ? 'Playing slowly…' : 'Playing pronunciation…';
  } catch (error) { if (epoch === selectionVersion && request === playbackVersion) showError(error); }
}
function stopRecording() {
  if (recordTimer) clearInterval(recordTimer); recordTimer = null;
  if (recorder?.state === 'recording') recorder.stop();
}
function renderFeedback(feedback: HTMLElement, result: { transcript: string; score: number; words: { word: string; status: string; heard?: string }[]; event_saved: boolean }) {
  feedback.replaceChildren();
  const summary = document.createElement('p');
  summary.textContent = `Heard: ${result.transcript}\nWords recognized: ${Math.round(result.score * 100)}%`;
  feedback.append(summary);
  const words = document.createElement('div'); words.className = 'word-results';
  for (const word of result.words) {
    const chip = document.createElement('span');
    chip.className = word.status === 'correct' ? 'recognized' : 'retry';
    chip.textContent = `${word.status === 'correct' ? '✓' : '↻'} ${word.word}`;
    chip.title = word.status === 'correct' ? 'Recognized' : word.heard ? `Heard “${word.heard}” instead. Try again.` : 'Not recognized. Try again.';
    chip.setAttribute('aria-label', `${word.word}: ${chip.title}`); words.append(chip);
  }
  const tip = document.createElement('p');
  const retry = result.words.filter(w => w.status !== 'correct').map(w => w.word);
  tip.textContent = `${retry.length ? `Listen slowly, then retry: ${retry.join(', ')}.` : 'All target words were recognized. Try again at normal speed.'}\nThis compares the transcript, rather than grading your accent.\n${result.event_saved ? 'Saved to your progress.' : 'Feedback received, but progress was not saved.'}`;
  feedback.append(words, tip);
}
async function record() {
  if (recorder?.state === 'recording') { stopRecording(); return; }
  if (recordingPending || !selected) return;
  const snapshot = selected, epoch = selectionVersion;
  const feedback = root.querySelector<HTMLElement>('#feedback')!;
  clearAudio(); root.querySelector('#own-recording')?.remove(); status.textContent = '';
  recordingPending = true; recordingControls('permission');
  feedback.textContent = 'Requesting microphone…';
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
      feedback.textContent = 'Checking your recording…';
      recordingPending = true; recordingControls('checking');
      try {
        const blob = new Blob(chunks, { type: capture.mimeType });
        if (!blob.size) throw new Error('No audio recorded. Try again.');
        recordingUrl = URL.createObjectURL(blob);
        root.querySelector('#own-recording')?.remove();
        const replay = button('Play my recording', async () => {
          if (!recordingUrl || recorder?.state === 'recording' || recordingPending) return;
          const request = ++playbackVersion; audio?.pause(); audio = new Audio(recordingUrl);
          await audio.play();
          if (epoch === selectionVersion && request === playbackVersion) status.textContent = 'Playing your recording…';
        });
        replay.id = 'own-recording'; replay.dataset.listen = ''; replay.disabled = true;
        panel.insertBefore(replay, feedback);
        const result = await api('/stt', { audio: await base64(blob), mime: blob.type, attempt_id: crypto.randomUUID(),
          user_id: 'demo-user', target_text: snapshot.phrase, lang: 'es', video_id: snapshot.videoId, video_ts: snapshot.line.start });
        if (epoch === selectionVersion) renderFeedback(feedback, result);
      } catch (error) { if (epoch === selectionVersion) feedback.textContent = `Recording failed: ${error instanceof Error ? error.message : error}`; }
      finally { if (epoch === selectionVersion) { recordingPending = false; recordingControls('ready'); } }
    };
    capture.onerror = () => {
      failed = true; if (capture.state === 'recording') capture.stop(); release();
      if (epoch === selectionVersion) { recordingPending = false; recordingControls('ready'); feedback.textContent = 'Recording failed. Check your microphone and try again.'; }
    };
    capture.start(); recordingPending = false; recordingControls('recording');
    let seconds = 0;
    feedback.textContent = 'Recording… 0 / 15 seconds. Say the Spanish text, then press Stop recording.';
    recordTimer = setInterval(() => {
      seconds++; feedback.textContent = `Recording… ${seconds} / 15 seconds. Press Stop recording when finished.`;
      if (seconds >= 15) stopRecording();
    }, 1000);
  } catch (error) {
    stream?.getTracks().forEach(t => t.stop());
    if (epoch === selectionVersion) {
      recordingPending = false; recordingControls('ready');
      feedback.textContent = `Microphone unavailable: ${error instanceof Error ? error.message : error}. Check microphone permission for YouTube in Chrome site settings.`;
    }
  }
}
