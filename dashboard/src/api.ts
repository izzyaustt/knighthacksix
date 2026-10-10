import { useEffect, useRef, useState } from 'react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

// The extension opens the dashboard with ?user_id=...; default to the shared demo user.
const params = new URLSearchParams(location.search);
export const USER_ID = params.get('user_id') || 'demo-user';
export const LANG = 'es';

// --- Response shapes (see backend/README.md) ---

export type ActivityDay = {
  day: string; // YYYY-MM-DD in America/New_York
  shadow_attempts: number;
  lookups: number;
  vocab_saved: number;
  watched_minutes: number;
  includes_synthetic: boolean;
};

export type ScoreDay = { day: string; avg_score: number; attempts: number; includes_synthetic: boolean };

export type VocabWord = {
  word: string;
  translation: string | null;
  video_id: string | null;
  video_ts: number | null;
  status: 'new' | 'learning' | 'known';
  saved_at: string;
};

export type RecentEvent = {
  time: string;
  event_id: string;
  event_type: string;
  video_id: string | null;
  video_ts: number | null;
};

async function get<T>(path: string, query: Record<string, string | number>, signal: AbortSignal): Promise<T> {
  const url = new URL(path, BACKEND_URL);
  for (const [key, value] of Object.entries({ user_id: USER_ID, lang: LANG, ...query })) {
    url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return response.json() as Promise<T>;
}

export const api = {
  activity: (days: number, signal: AbortSignal) =>
    get<{ points: ActivityDay[] }>('/stats/activity', { days }, signal).then((r) => r.points),
  scoreTrend: (days: number, signal: AbortSignal) =>
    get<{ points: ScoreDay[] }>('/stats/score-trend', { days }, signal).then((r) => r.points),
  vocab: (signal: AbortSignal) => get<{ words: VocabWord[] }>('/vocab', { limit: 200 }, signal).then((r) => r.words),
  recent: (signal: AbortSignal) =>
    get<{ events: RecentEvent[] }>('/stats/recent', { limit: 1000 }, signal).then((r) => r.events),
};

// --- Polling ---

export type Status = 'loading' | 'ok' | 'stale' | 'error';
export type Polled<T> = { data: T | undefined; status: Status };

/**
 * Calls `load` every `intervalMs`, never overlapping requests, and pauses while the tab is hidden.
 * Keeps the last good data on failure: status is 'stale' when old data is shown, 'error' when there is none.
 */
export function usePolling<T>(load: (signal: AbortSignal) => Promise<T>, intervalMs: number): Polled<T> {
  const [state, setState] = useState<Polled<T>>({ data: undefined, status: 'loading' });
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    let stopped = false;

    const tick = async () => {
      if (document.hidden) return; // resumed by the visibilitychange listener
      controller = new AbortController();
      try {
        const data = await loadRef.current(controller.signal);
        if (!stopped) setState({ data, status: 'ok' });
      } catch (error) {
        if (stopped || (error as Error).name === 'AbortError') return;
        setState((prev) => ({ data: prev.data, status: prev.data === undefined ? 'error' : 'stale' }));
      }
      if (!stopped) timer = setTimeout(tick, intervalMs);
    };

    const onVisibility = () => {
      if (document.hidden) return;
      clearTimeout(timer);
      controller?.abort();
      tick();
    };

    tick();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stopped = true;
      clearTimeout(timer);
      controller?.abort();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [intervalMs]);

  return state;
}
