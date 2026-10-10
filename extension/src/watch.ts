import { updateDay } from './stats';

export type WatchTracker = {
  stop(): void;
  /** Seconds watched but not yet written to storage, keyed by epoch minute. */
  pending(): ReadonlyMap<number, number>;
};

/**
 * Counts seconds while the video is actually playing (not paused, not an ad, tab visible),
 * flushes them into per-minute buckets every 15s, and calls onMinute once per full minute
 * watched (the spec's caption_view cadence).
 */
export function startWatchTracker(video: HTMLVideoElement, onMinute: () => void): WatchTracker {
  const player = video.closest('#movie_player');
  const pending = new Map<number, number>();
  let last = performance.now();
  let sinceEvent = 0;

  const tick = () => {
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 2); // throttled background timers shouldn't over-count
    last = now;
    const watching = !video.paused && !video.ended && document.visibilityState === 'visible'
      && !player?.classList.contains('ad-showing');
    if (!watching) return;
    const minute = Math.floor(Date.now() / 60_000);
    pending.set(minute, (pending.get(minute) ?? 0) + dt);
    sinceEvent += dt;
    if (sinceEvent >= 60) { sinceEvent -= 60; onMinute(); }
  };

  const flush = () => {
    if (!pending.size) return;
    const byDay = new Map<string, { date: Date; items: [number, number][] }>();
    for (const [minute, secs] of pending) {
      const date = new Date(minute * 60_000);
      const k = date.toDateString();
      if (!byDay.has(k)) byDay.set(k, { date, items: [] });
      byDay.get(k)!.items.push([date.getHours() * 60 + date.getMinutes(), secs]);
    }
    pending.clear();
    for (const { date, items } of byDay.values()) {
      void updateDay((day) => {
        for (const [m, s] of items) day.watch[m] = (day.watch[m] ?? 0) + s;
      }, date);
    }
  };

  const tickId = setInterval(tick, 1000);
  const flushId = setInterval(flush, 15_000);
  const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
  document.addEventListener('visibilitychange', onHide);

  return {
    stop() {
      tick();
      clearInterval(tickId);
      clearInterval(flushId);
      document.removeEventListener('visibilitychange', onHide);
      flush();
    },
    pending: () => pending,
  };
}
