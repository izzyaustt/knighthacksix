import type { AlignedLine, Pair } from './captions';
import { logEvent } from './events';
import { api, base64 } from './api';
import styles from './practice.css?inline';
import { createPracticeGate } from './practice-gate';
const gate = createPracticeGate();
export const waitForPracticeClose = () => gate.wait();
let host: HTMLElement | null = null;
let root: ShadowRoot, panel: HTMLElement, status: HTMLElement;
let selected: { line: AlignedLine; phrase: string; translation: string; videoId: string } | null = null;
let selectionVersion = 0, audio: HTMLAudioElement | null = null;
let recorder: MediaRecorder | null = null, recordTimer: ReturnType<typeof setTimeout> | null = null;
let recordingPending = false;
const video = () => document.querySelector<HTMLVideoElement>('#movie_player video');
function button(label: string, action: () => void | Promise<void>) {
  const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
  b.addEventListener('click', e => { e.stopPropagation(); Promise.resolve(action()).catch(showError); });
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
  selectionVersion++; selected = null; stopRecording(); audio?.pause();
  if (panel) panel.hidden = true;
}
export async function openPractice(line: AlignedLine, pair?: Pair, trackLookup = true, word?: { text: string; language: 'en' | 'es' }) {
  mount();
  gate.open();
  stopRecording(); audio?.pause(); video()?.pause();
  const epoch = ++selectionVersion;
  selected = { line, phrase: word?.text ?? pair?.tgt ?? line.target, translation: word ? '' : pair?.src ?? line.source, videoId: new URLSearchParams(location.search).get('v') ?? '' };
  const snapshot = selected;
  panel.replaceChildren(); panel.hidden = false; status.textContent = '';
  panel.append(button('Close', resetPractice));
  const title = document.createElement('h3'); title.textContent = snapshot.phrase; panel.append(title);
  const gloss = document.createElement('p'); gloss.textContent = snapshot.translation; panel.append(gloss);
  const notes = document.createElement('p'); notes.textContent = 'Loading explanation…'; panel.append(notes);
  const actions = document.createElement('div'); actions.className = 'actions';
  actions.append(button('Listen', () => speak(snapshot.phrase, 1)), button('Slow', () => speak(snapshot.phrase, 0.7)),
    button('Save phrase', async () => {
      await api('/vocab', { user_id: 'demo-user', lang: 'es', word: snapshot.phrase, translation: snapshot.translation, video_id: snapshot.videoId, video_ts: line.start });
      if (epoch === selectionVersion) notes.textContent = 'Saved to vocabulary.';
    }), button('Record / Stop', record));
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
  } catch (error) { if (epoch === selectionVersion) notes.textContent = `Explanation unavailable: ${error instanceof Error ? error.message : error}`; }
}
async function speak(text: string, speed: number) {
  const epoch = selectionVersion;
  audio?.pause(); status.textContent = 'Loading pronunciation…';
  const result = await api('/tts', { text, speed });
  if (epoch !== selectionVersion) return;
  audio?.pause(); audio = new Audio(`data:audio/mpeg;base64,${result.audio}`);
  await audio.play(); status.textContent = 'Playing pronunciation';
}
function stopRecording() {
  if (recordTimer) clearTimeout(recordTimer); recordTimer = null;
  if (recorder?.state === 'recording') recorder.stop();
}
async function record() {
  if (recorder?.state === 'recording') { stopRecording(); return; }
  if (recordingPending || !selected) return;
  const snapshot = selected, epoch = selectionVersion;
  const feedback = root.querySelector<HTMLElement>('#feedback')!;
  recordingPending = true;
  feedback.textContent = 'Requesting microphone…';
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
      if (epoch !== selectionVersion) return;
      feedback.textContent = 'Checking your recording…';
      recordingPending = true;
      try {
        const blob = new Blob(chunks, { type: capture.mimeType });
        if (!blob.size) throw new Error('No audio recorded. Try again.');
        const result = await api('/stt', { audio: await base64(blob), mime: blob.type, attempt_id: crypto.randomUUID(),
          user_id: 'demo-user', target_text: snapshot.phrase, lang: 'es', video_id: snapshot.videoId, video_ts: snapshot.line.start });
        if (epoch !== selectionVersion) return;
        feedback.textContent = `Heard: ${result.transcript}\nIntelligibility: ${Math.round(result.score * 100)}%\n${result.words.map((w: any) => `${w.word}: ${w.status}`).join(' · ')}\n${result.event_saved ? 'Saved to your progress.' : 'Score received, but progress was not saved.'}`;
      } catch (error) { if (epoch === selectionVersion) feedback.textContent = `Recording failed: ${error instanceof Error ? error.message : error}`; }
      finally { recordingPending = false; }
    };
    capture.onerror = () => { stream.getTracks().forEach(t => t.stop()); feedback.textContent = 'Recording failed. Try again.'; };
    capture.start(); feedback.textContent = 'Recording… click Record / Stop to finish (15-second limit).';
    recordTimer = setTimeout(stopRecording, 15000);
  } catch (error) { feedback.textContent = `Microphone unavailable: ${error instanceof Error ? error.message : error}. Allow microphone access for YouTube in Chrome site settings.`; }
  finally { recordingPending = false; }
}
