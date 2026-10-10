import { alignLines } from './align';
import { mountOverlay, renderLine } from './overlay';
import { startSync } from './sync';
import type { AlignedLine, Line } from './types';

console.log('[LL content] loaded');

const BATCH = 30;
const HIDE_STYLE_ID = 'll-hide-captions';

let lastKey = '';
let sessionVideoId: string | null = null;
let generation = 0; // bumped on every start/reset so stale align batches are dropped
let stopSync: (() => void) | null = null;
let overlay: ReturnType<typeof mountOverlay> | null = null;

window.addEventListener('message', (e) => {
  if (e.source !== window || e.data?.source !== 'LL') return;
  if (e.data.type === 'tracks') { console.log('[LL content] got tracks', e.data.tracks); return; }
  if (e.data.type !== 'captions') return;
  const url = new URL(e.data.url, location.origin);
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
});

function start(videoId: string | null, lines: Line[]) {
  reset();
  const video = document.querySelector<HTMLVideoElement>('#movie_player video.html5-main-video');
  if (!video || !lines.length) { console.warn('[LL content] no video element or no lines'); return; }
  sessionVideoId = videoId;
  hideNativeCaptions();
  overlay = mountOverlay();
  const { root } = overlay;

  const aligned: AlignedLine[] = lines
    .map((l) => ({ start: l.start, end: l.end, src: l.text, tgt: '', pairs: [] }))
    .sort((a, b) => a.start - b.start);
  stopSync = startSync(video, () => aligned, (line) => renderLine(root, line));
  void alignProgressively(aligned, generation);
}

// First batch right away, then the rest in the background, merging each batch in place.
async function alignProgressively(aligned: AlignedLine[], gen: number) {
  for (let offset = 0; offset < aligned.length; offset += BATCH) {
    try {
      const batch = aligned.slice(offset, offset + BATCH);
      const result = await alignLines(batch.map((l) => ({ start: l.start, end: l.end, text: l.src })));
      if (gen !== generation) return;
      result.slice(0, batch.length).forEach((line, i) => { aligned[offset + i] = line; });
    } catch (err) {
      console.warn('[LL content] align failed for batch at', offset, err);
    }
  }
}

function reset() {
  generation++;
  stopSync?.();
  stopSync = null;
  if (overlay) renderLine(overlay.root, null);
  document.getElementById(HIDE_STYLE_ID)?.remove();
  sessionVideoId = null;
  lastKey = '';
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
      .filter((l: Line) => l.text);
  }
  // XML fallback (srv3 / default format)
  const doc = new DOMParser().parseFromString(t, 'text/xml');
  const nodes = [...doc.querySelectorAll('p, text')];
  return nodes.map((n) => {
    const tAttr = n.getAttribute('t'), dAttr = n.getAttribute('d');
    const start = tAttr != null ? +tAttr / 1000 : +(n.getAttribute('start') ?? 0);
    const dur = dAttr != null ? +dAttr / 1000 : +(n.getAttribute('dur') ?? 0);
    return { start, end: start + dur, text: (n.textContent ?? '').replace(/\s+/g, ' ').trim() };
  }).filter((l) => l.text);
}

window.postMessage({ source: 'LL', type: 'ready' }, '*');
