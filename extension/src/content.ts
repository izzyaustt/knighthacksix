import { api } from './api';
import { attachPracticeView, openPractice, resetPractice, waitForPracticeClose } from './practice';
import { alignLines } from './align';
import { logEvent } from './events';
import { mountOverlay, renderLine, renderBuffering } from './overlay';
import { createCaptionBuffer } from './caption-buffer';
import { createPanel } from './panel';
import { startSync } from './sync';
import { nextBatchOffset } from './translation-queue';
import type { AlignedLine, Line } from './types';
import { startWatchTracker, type WatchTracker } from './watch';

console.log('[LL content] loaded');

let currentLines: AlignedLine[] = [];
let currentLine: AlignedLine | null = null;
const HIDE_STYLE_ID = 'll-hide-captions';

let lastKey = '';
let sessionVideoId: string | null = null;
let generation = 0; // bumped on every start/reset so stale align batches are dropped
let stopSync: (() => void) | null = null;
let overlay: ReturnType<typeof mountOverlay> | null = null;
let watch: WatchTracker | null = null;
let captionsOn = true;
let aligningGeneration: number | null = null;
let captionBuffer: ReturnType<typeof createCaptionBuffer> | null = null;

const isWatchPage = () => location.pathname === '/watch';
const findVideo = () => document.querySelector<HTMLVideoElement>('#movie_player video.html5-main-video');

function practice(line: AlignedLine, index?: number, trackLookup = true, word?: { text: string; language: 'en' | 'es' }) {
  captionBuffer?.pauseForInteraction();
  const standard = { start: line.start, end: line.end, source: line.src, target: line.tgt,
    pairs: line.pairs.map((p, i) => ({ ...p, srcStart: line.src.indexOf(p.src), tgtStart: line.tgt.indexOf(p.tgt), color: i % 3 })) };
  void openPractice(standard, index === undefined ? undefined : standard.pairs[index], trackLookup, word);
}

const panel = createPanel({
  getVideo: findVideo,
  getVideoId: () => sessionVideoId ?? (isWatchPage() ? new URLSearchParams(location.search).get('v') : null),
  pendingWatch: () => watch?.pending() ?? new Map(),
  captionsOn: () => captionsOn,
  setCaptionsOn,
  retry() { void alignProgressively(currentLines, generation); },
  // Leaving the lookup view ends practice, which also lets paused translation continue.
  onClose: resetPractice,
  onLookupBack: resetPractice,
});
attachPracticeView(panel.practice);
panel.setStatus(isWatchPage() ? { kind: 'waiting' } : { kind: 'idle' });

// The toolbar icon (or Alt+L) sends this via the service worker.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'll:toggle-panel') panel.toggle();
});

window.addEventListener('message', (e) => {
  if (e.source !== window || e.data?.source !== 'LL') return;
  if (e.data.type === 'tracks') { console.log('[LL content] got tracks', e.data.tracks); return; }
  if (e.data.type !== 'captions') return;
  if (typeof e.data.body !== 'string' || e.data.body.length > 5_000_000) return;
  const url = new URL(e.data.url, location.origin);
  if (url.origin !== location.origin || !url.pathname.includes('/api/timedtext') || !url.searchParams.get('lang')?.startsWith('en') || url.searchParams.get('v') !== new URLSearchParams(location.search).get('v')) return;
  const videoId = url.searchParams.get('v');
  const key = `${videoId}:${url.searchParams.get('lang')}`;
  if (key === lastKey) return; // dedupe repeated player requests

  let lines: Line[];
  try { lines = parseCaptions(e.data.body); } catch (err) {
    console.warn('[LL content] could not parse captions', err);
    return;
  }
  console.log('[LL content] lines', lines.length, lines.slice(0, 5));
  start(videoId, lines);
  lastKey = key; // after start(), which resets state
});

document.addEventListener('yt-navigate-finish', () => {
  // Also fires for the video we already have captions for (e.g. on first load); keep that session.
  if (new URLSearchParams(location.search).get('v') !== sessionVideoId) reset();
  window.postMessage({ source: 'LL', type: 'ready' }, '*');
});

function start(videoId: string | null, lines: Line[]) {
  reset();
  const video = findVideo();
  if (!video || !lines.length) { console.warn('[LL content] no video element or no lines'); return; }
  sessionVideoId = videoId;
  overlay = mountOverlay();
  applyCaptionsVisibility();
  const { root } = overlay;
  root.onclick = event => {
    const button = (event.target as Element).closest?.<HTMLElement>('[data-word]');
    if (button && currentLine?.tgt) {
      event.stopPropagation();
      practice(currentLine, undefined, true, { text: button.dataset.word!, language: button.closest('.ll-src') ? 'en' : 'es' });
    }
  };

  const aligned: AlignedLine[] = lines
    .map((l) => ({ start: l.start, end: l.end, src: l.text, tgt: '', pairs: [] }))
    .sort((a, b) => a.start - b.start);
  currentLines = aligned;
  captionBuffer = createCaptionBuffer(video, () => aligned, waiting => {
    renderBuffering(root, waiting);
  });
  captionBuffer.setEnabled(captionsOn);
  stopSync = startSync(video, () => aligned, (line) => {
    currentLine = line;
    applyCaptionsVisibility();
    renderLine(root, line);
    captionBuffer?.update();
  });

  // caption_view: once when captions load, then once per minute actually watched.
  logEvent({ event_type: 'caption_view', video_id: videoId, lang: 'es', meta: { reason: 'loaded', lines: aligned.length } });
  watch = startWatchTracker(video, () =>
    logEvent({ event_type: 'caption_view', video_id: videoId, lang: 'es', meta: { reason: 'minute', watched_seconds: 60 } }));

  void alignProgressively(aligned, generation);
}

// First batch right away, then the rest in the background, merging each batch in place.
async function alignProgressively(aligned: AlignedLine[], gen: number) {
  if (aligningGeneration === gen) return;
  aligningGeneration = gen;
  try {
    let BATCH = 3;
    try { const health = await api('/health', {}); BATCH = health.ai?.batch_size === 3 ? 3 : 30; }
    catch (error) { console.warn('[LL content] backend unavailable', error); panel.setStatus({ kind: 'ready', total: 1, failed: 1 }); return; }
    if (gen !== generation) return;
    const total = Math.ceil(aligned.length / BATCH);
    let failed = 0;
    panel.setStatus({ kind: 'aligning', done: 0, total });
    const attempted = new Set<number>();
    while (true) {
      await waitForPracticeClose();
      if (gen !== generation) return;
      const offset = nextBatchOffset(aligned, findVideo()?.currentTime ?? 0, BATCH, attempted);
      if (offset === null) break;
      if (gen !== generation) return;
      attempted.add(offset);
      try {
        const batch = aligned.slice(offset, offset + BATCH);
        const result = await alignLines(batch.map((l) => ({ start: l.start, end: l.end, text: l.src })), sessionVideoId!, offset);
        if (gen !== generation) return;
        result.slice(0, batch.length).forEach((line, i) => { aligned[offset + i] = line; });
      } catch (err) {
        if (gen !== generation) return;
        failed++;
        console.warn('[LL content] align failed for batch at', offset, err);
      }
      const done = Array.from({ length: total }, (_, i) => aligned.slice(i * BATCH, (i + 1) * BATCH).every(line => !!line.tgt)).filter(Boolean).length;
      panel.setStatus({ kind: 'aligning', done, total });
      captionBuffer?.update();
    }
    panel.setStatus({ kind: 'ready', total, failed });
  } finally {
    if (aligningGeneration === gen) aligningGeneration = null;
  }
}

function reset() {
  generation++;
  captionBuffer?.destroy();
  captionBuffer = null;
  currentLines = []; currentLine = null; resetPractice();
  stopSync?.();
  stopSync = null;
  watch?.stop();
  watch = null;
  if (overlay) renderLine(overlay.root, null);
  document.getElementById(HIDE_STYLE_ID)?.remove();
  sessionVideoId = null;
  lastKey = '';
  panel.reset();
  panel.setStatus(isWatchPage() ? { kind: 'waiting' } : { kind: 'idle' });
}

// Panel toggle: show our overlay and hide YouTube's, or the reverse.
function setCaptionsOn(on: boolean) {
  captionsOn = on;
  captionBuffer?.setEnabled(on);
  if (!on) resetPractice();
  if (sessionVideoId) applyCaptionsVisibility();
}

function applyCaptionsVisibility() {
  if (captionsOn) {
    if (currentLine?.tgt) hideNativeCaptions();
    else document.getElementById(HIDE_STYLE_ID)?.remove();
    overlay?.root.style.removeProperty('display');
  } else {
    document.getElementById(HIDE_STYLE_ID)?.remove();
    overlay?.root.style.setProperty('display', 'none', 'important');
  }
}

// CC stays on in the player (that is what triggers the capture); we only hide it visually.
function hideNativeCaptions() {
  if (document.getElementById(HIDE_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = HIDE_STYLE_ID;
  style.textContent = '.ytp-caption-window-container { display: none !important; }';
  document.head.append(style);
}

function parseCaptions(body: string): Line[] {
  const t = body.trim();
  if (t.startsWith('{')) {
    const data = JSON.parse(t);
    return (data.events ?? [])
      .filter((ev: any) => ev.segs)
      .map((ev: any) => ({
        start: ev.tStartMs / 1000,
        end: (ev.tStartMs + (ev.dDurationMs ?? 0)) / 1000,
        text: ev.segs.map((s: any) => s.utf8).join('').replace(/\n/g, ' ').trim(),
      }))
      .filter((l: Line) => l.text && Number.isFinite(l.start) && l.end > l.start);
  }
  // XML fallback (srv3 / default format)
  const doc = new DOMParser().parseFromString(t, 'text/xml');
  const nodes = [...doc.querySelectorAll('p, text')];
  return nodes.map((n) => {
    const tAttr = n.getAttribute('t'), dAttr = n.getAttribute('d');
    const start = tAttr != null ? +tAttr / 1000 : +(n.getAttribute('start') ?? 0);
    const dur = dAttr != null ? +dAttr / 1000 : +(n.getAttribute('dur') ?? 0);
    return { start, end: start + dur, text: (n.textContent ?? '').replace(/\s+/g, ' ').trim() };
  }).filter((l) => l.text && Number.isFinite(l.start) && l.end > l.start);
}

window.postMessage({ source: 'LL', type: 'ready' }, '*');
