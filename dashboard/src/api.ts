import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BACKEND_URL, getSession, signOut } from './auth.ts';

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

export type VocabStatus = 'new' | 'learning' | 'known';

export type RevisitWord = {
  word: string;
  translation: string | null;
  note: string | null; // grammar note; the backend fills it in shortly after the word first appears
  status: VocabStatus;
  video_id: string | null;
  video_ts: number | null;
  misses: number;
};

export type VideoStat = {
  video_id: string;
  events: number;
  last_time: string;
  watched_minutes: number;
  total_words: number;
  known_pct: number | null; // 0-1; null until the video's captions have been translated
};

export type Summary = {
  immersion: { hours: number; goal_hours: number };
  mastery: { total: number; learning: number; mastered: number };
};

// The backend knows the user from the session token; there is no user_id parameter.
async function request<T>(url: URL, init: RequestInit): Promise<T> {
  const session = getSession();
  const response = await fetch(url, { ...init, headers: { ...init.headers, ...(session ? { Authorization: `Bearer ${session.token}` } : {}) } });
  if (response.status === 401) {
    signOut();
    throw new Error('Signed out');
  }
  if (!response.ok) throw new Error(`${url.pathname} returned ${response.status}`);
  return response.json() as Promise<T>;
}

function get<T>(path: string, query: Record<string, string | number>, signal: AbortSignal): Promise<T> {
  const url = new URL(path, BACKEND_URL);
  for (const [key, value] of Object.entries({ lang: LANG, ...query })) {
    url.searchParams.set(key, String(value));
  }
  return request<T>(url, { signal });
}

export const api = {
  activity: (days: number, signal: AbortSignal) =>
    get<{ points: ActivityDay[] }>('/stats/activity', { days }, signal).then((r) => r.points),
  scoreTrend: (days: number, signal: AbortSignal) =>
    get<{ points: ScoreDay[] }>('/stats/score-trend', { days }, signal).then((r) => r.points),
  summary: (signal: AbortSignal) => get<Summary>('/stats/summary', {}, signal),
  videos: (signal: AbortSignal) => get<{ videos: VideoStat[] }>('/stats/videos', { limit: 2 }, signal).then((r) => r.videos),
  revisit: (signal: AbortSignal) => get<{ words: RevisitWord[] }>('/vocab/revisit', { limit: 3 }, signal).then((r) => r.words),
  setVocabStatus: (word: string, status: VocabStatus) =>
    request<{ ok: true }>(new URL('/vocab', BACKEND_URL), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lang: LANG, word, status }),
    }),
};

// --- Polling ---

export type Status = 'loading' | 'ok' | 'stale' | 'error';
export type Polled<T> = { data: T | undefined; status: Status; refresh: () => void };

/**
 * Calls `load` every `intervalMs`, never overlapping requests, and pauses while the tab is hidden.
 * Keeps the last good data on failure: status is 'stale' when old data is shown, 'error' when there is none.
 * `refresh` reloads right away, for use after a change made from this page.
 */
export function usePolling<T>(load: (signal: AbortSignal) => Promise<T>, intervalMs: number): Polled<T> {
  const [state, setState] = useState<Omit<Polled<T>, 'refresh'>>({ data: undefined, status: 'loading' });
  const loadRef = useRef(load);
  loadRef.current = load;
  const restartRef = useRef(() => {});
  const refresh = useCallback(() => restartRef.current(), []);

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

    const restart = () => {
      clearTimeout(timer);
      controller?.abort();
      tick();
    };
    restartRef.current = restart;
    const onVisibility = () => {
      if (!document.hidden) restart();
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

  return useMemo(() => ({ ...state, refresh }), [state, refresh]);
}
