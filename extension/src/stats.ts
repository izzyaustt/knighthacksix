// Local per-day stats that make the panel feel live without waiting on the backend.
// chrome.storage.local["ll:stats:YYYY-MM-DD"] = DayStats

export type DayStats = {
  watch: Record<string, number>; // minute of day (0–1439) -> seconds watched with captions
  lookups: number;
  saves: number;
  shadow: number[];              // shadowing scores, for when recording lands
};

export const emptyDay = (): DayStats => ({ watch: {}, lookups: 0, saves: 0, shadow: [] });

export function dayKey(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const storageKey = (d: Date) => `ll:stats:${dayKey(d)}`;
export const isStatsKey = (k: string) => k.startsWith('ll:stats:');

let queue: Promise<unknown> = Promise.resolve();

/** Read-modify-write one day's stats. Calls are serialized within this tab. */
export function updateDay(fn: (day: DayStats) => void, when = new Date()): Promise<void> {
  const run = async () => {
    const k = storageKey(when);
    const got = (await chrome.storage.local.get(k)) as Record<string, DayStats | undefined>;
    const day = { ...emptyDay(), ...got[k] };
    fn(day);
    await chrome.storage.local.set({ [k]: day });
  };
  const p = queue.then(run);
  queue = p.catch((err) => console.warn('[LL stats]', err));
  return p;
}

export async function readRecent(): Promise<{ today: DayStats; yesterday: DayStats }> {
  const now = new Date();
  const y = new Date(now.getTime() - 864e5);
  const got = (await chrome.storage.local.get([storageKey(now), storageKey(y)])) as Record<string, DayStats | undefined>;
  return {
    today: { ...emptyDay(), ...got[storageKey(now)] },
    yesterday: { ...emptyDay(), ...got[storageKey(y)] },
  };
}
