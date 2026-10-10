import type { AlignedLine } from './types';

// Binary search over lines sorted by start: the last line with start <= t, if t is before its end.
// (Auto-generated captions overlap, so a line effectively ends when the next one starts.)
export function findLine(lines: AlignedLine[], t: number): AlignedLine | null {
  let lo = 0, hi = lines.length - 1, idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].start <= t) { idx = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return idx >= 0 && t < lines[idx].end ? lines[idx] : null;
}

export function startSync(
  video: HTMLVideoElement,
  getLines: () => AlignedLine[],
  render: (line: AlignedLine | null) => void
): () => void {
  const player = video.closest('#movie_player');
  let last: AlignedLine | null | undefined; // undefined = nothing rendered yet
  let raf = 0;

  const update = (force = false) => {
    const line = player?.classList.contains('ad-showing') ? null : findLine(getLines(), video.currentTime);
    // Identity, not index: an aligned batch replaces the entry in place and must re-render.
    if (!force && line === last) return;
    last = line;
    render(line);
  };
  const tick = () => { update(); raf = requestAnimationFrame(tick); };
  const onSeeked = () => update(true);

  video.addEventListener('seeked', onSeeked);
  tick();
  return () => {
    cancelAnimationFrame(raf);
    video.removeEventListener('seeked', onSeeked);
  };
}
