import type { AlignedLine } from './types';

// Local inference can be slower than speech. Hold playback rather than letting
// every translation arrive after its caption has already left the screen.
export function createCaptionBuffer(video: HTMLVideoElement, getLines: () => AlignedLine[], onWaiting: (waiting: boolean) => void) {
  let enabled = true;
  let held = false;
  let destroyed = false;
  const release = () => {
    const resume = held;
    held = false;
    onWaiting(false);
    if (resume && !destroyed) void video.play().catch(() => {});
  };
  const update = () => {
    if (destroyed) return;
    if (!enabled || video.closest('#movie_player')?.classList.contains('ad-showing')) { release(); return; }
    const time = video.currentTime;
    const lines = getLines();
    // Auto captions overlap. Older entries stop being active when the next
    // entry starts, even if their reported end time is later.
    const active = Math.max(0, lines.findLastIndex(line => line.start <= time));
    const missing = lines.slice(active).some(line => line.end > time && line.start < time + 4 && !line.tgt);
    if (!missing) { release(); return; }
    if (!video.paused) {
      held = true;
      video.pause();
    }
    onWaiting(held);
  };
  video.addEventListener('play', update);
  video.addEventListener('seeked', update);
  return {
    update,
    setEnabled(value: boolean) { enabled = value; update(); },
    destroy() {
      destroyed = true;
      held = false;
      onWaiting(false);
      video.removeEventListener('play', update);
      video.removeEventListener('seeked', update);
    },
  };
}
