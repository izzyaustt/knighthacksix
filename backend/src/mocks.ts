// Mock data in the agreed API shapes. Tiger Data (/events, /vocab, /stats)
// replaces these; the response shapes should not change.

// In-memory stand-ins for the Tiger Data tables. Reset on every restart.
export interface LearningEvent {
  time: string;
  user_id: string;
  event_type: string;
  video_id?: string;
  word?: string;
  lang?: string;
  score?: number;
  meta?: unknown;
}

export const events: LearningEvent[] = [];
export const vocab = new Map<string, Record<string, unknown>>();

function lastDays(days: number) {
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(Date.now() - (days - 1 - i) * 86_400_000);
    return d.toISOString().slice(0, 10);
  });
}

export const mockStats = {
  scoreTrend: (days: number) => ({
    points: lastDays(days).map((day, i) => ({ day, avg_score: Math.min(0.95, 0.55 + i * 0.02) })),
  }),
  activity: (days: number) => ({
    points: lastDays(days).map((day, i) => ({ day, lookups: 5 + ((i * 7) % 13), minutes: 10 + ((i * 5) % 20) })),
  }),
  troubleWords: (limit: number) => ({
    words: [
      { word: 'perro', avg_score: 0.42, attempts: 9 },
      { word: 'ferrocarril', avg_score: 0.48, attempts: 6 },
      { word: 'hubiera', avg_score: 0.55, attempts: 7 },
      { word: 'trabajé', avg_score: 0.61, attempts: 5 },
    ].slice(0, limit),
  }),
  heatmap: () => ({
    cells: Array.from({ length: 7 * 24 }, (_, i) => ({
      dow: Math.floor(i / 24),
      hour: i % 24,
      count: (i % 24) >= 18 && (i % 24) <= 22 ? 4 + (i % 5) : i % 3 === 0 ? 1 : 0,
    })),
  }),
};
