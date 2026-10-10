import { activeIndex, jsonCaptions, segments } from './captions';
import type { Line, AlignedLine, Pair } from './captions';
import { api, base64 } from './api';
import styles from './style.css?inline';

let videoId = '', sourceKey = '', generation = 0;
let lines: Line[] = [], aligned = new Map<number, AlignedLine>();
let enabled = true, rendered = -2, host: HTMLElement | null = null;
let root: ShadowRoot, status: HTMLElement, captions: HTMLElement, panel: HTMLElement;
let selected: { line: AlignedLine; phrase: string; translation: string; videoId: string } | null = null;
let selectionVersion = 0, audio: HTMLAudioElement | null = null;
let recorder: MediaRecorder | null = null, recordTimer: ReturnType<typeof setTimeout> | null = null;
let recordingPending = false;

const video = () => document.querySelector<HTMLVideoElement>('#movie_player video');
const currentId = () => new URLSearchParams(location.search).get('v') ?? '';
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
  toolbar.append(button('Spanish overlay', () => {
    enabled = !enabled; rendered = -2; captions.hidden = !enabled; panel.hidden = true;
    toolbar.querySelector('button')!.textContent = enabled ? 'Spanish overlay' : 'Overlay off';
    if (!enabled) { selectionVersion++; stopRecording(); audio?.pause(); }
    tick();
  }), button('Retry', () => { void translate(generation); }));
  status = document.createElement('span'); status.setAttribute('role', 'status'); status.textContent = 'Waiting for English captions. Turn on CC.';
  toolbar.append(status);
  captions = document.createElement('div'); captions.className = 'captions';
  panel = document.createElement('section'); panel.className = 'panel'; panel.hidden = true;
  panel.setAttribute('aria-label', 'Phrase practice');
  root.append(toolbar, captions, panel); player.append(host);
  return true;
}
function reset() {
  generation++; videoId = currentId(); sourceKey = ''; lines = []; aligned.clear(); rendered = -2;
  selected = null; selectionVersion++; stopRecording(); audio?.pause();
  document.querySelector('#movie_player')?.classList.remove('ll-active');
  if (mount()) { captions.replaceChildren(); panel.hidden = true; status.textContent = 'Waiting for English captions. Turn on CC.'; }
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
  try {
    // Start near playback so seeking and long videos do not wait for earlier batches.
    const active = Math.max(0, activeIndex(capturedLines, video()?.currentTime ?? 0));
    const first = Math.floor(active / 30) * 30;
    const batches = [first, ...Array.from({ length: Math.ceil(lines.length / 30) }, (_, i) => i * 30).filter(i => i !== first)];
    for (const startIndex of batches) {
      if (epoch !== generation) return;
      const chunk = capturedLines.slice(startIndex, startIndex + 30);
      if (chunk.every((_, i) => aligned.has(startIndex + i))) continue;
      status.textContent = `Translating captions ${startIndex + 1}–${startIndex + chunk.length}…`;
      const result = await api('/align', { videoId: capturedId, lang: 'es', level: 'medium', startIndex, lines: chunk });
      if (epoch !== generation) return;
      if (!Array.isArray(result.lines) || result.lines.length !== chunk.length || result.lines.some((l: AlignedLine) => !l.target)) {
        throw new Error('Translation did not finish. Check Gemini configuration, then click Retry.');
      }
      result.lines.forEach((line: AlignedLine, i: number) => aligned.set(startIndex + i, line));
      rendered = -2; tick();
    }
    if (epoch === generation) status.textContent = 'Ready · click a colored phrase to practice';
  } catch (error) { if (epoch === generation) showError(error); }
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
  if (!line) { captions.textContent = lines[index].text; return; }
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

async function selectPhrase(line: AlignedLine, pair?: Pair) {
  stopRecording(); audio?.pause(); video()?.pause();
  const epoch = ++selectionVersion;
  selected = { line, phrase: pair?.tgt ?? line.target, translation: pair?.src ?? line.source, videoId };
  const snapshot = selected;
  panel.replaceChildren(); panel.hidden = false;
  panel.append(button('Close', () => { panel.hidden = true; selectionVersion++; stopRecording(); audio?.pause(); }));
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
  panel.append(actions, result);
  // Persist the click independently of the explanation provider.
  void api('/events', { user_id: 'demo-user', event_id: crypto.randomUUID(), event_type: 'lookup', lang: 'es', word: snapshot.phrase, video_id: snapshot.videoId }).catch(showError);
  try {
    const explanation = await api('/explain', { phrase: snapshot.phrase, source: snapshot.translation, context: line.target, lang: 'es' });
    if (epoch === selectionVersion) notes.textContent = `${explanation.gloss}\n${explanation.grammar_note}\nExample: ${explanation.example}\nTone: ${explanation.formality}`;
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
// Hide native captions only while a translated line is actually visible.
const nativeStyle = document.createElement('style');
nativeStyle.textContent = '#movie_player.ll-active .ytp-caption-window-container { visibility: hidden !important; }';
document.documentElement.append(nativeStyle);
reset(); setInterval(tick, 200);
window.postMessage({ source: 'LL', type: 'ready' }, '*');
