// Intelligibility scoring: compares what Scribe heard with the target line.
// It measures recognizability, not true phonetic accuracy.

export type WordStatus = 'correct' | 'missed' | 'substituted';

export interface ScoreResult {
  score: number; // 0-1, matched words / total target words
  words: { word: string; status: WordStatus; heard?: string }[];
}

export function normalize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '') // strip accents so "esta" still matches "está"
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

// Word-level Levenshtein alignment, then walk back to label each target word.
export function scoreAttempt(target: string, transcript: string): ScoreResult {
  const display = target.split(/\s+/).filter((w) => normalize(w).length);
  const t = display.map((w) => normalize(w).join(''));
  const h = normalize(transcript);

  const d = Array.from({ length: t.length + 1 }, (_, i) =>
    Array.from({ length: h.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= t.length; i++) {
    for (let j = 1; j <= h.length; j++) {
      const sub = d[i - 1][j - 1] + (t[i - 1] === h[j - 1] ? 0 : 1);
      d[i][j] = Math.min(sub, d[i - 1][j] + 1, d[i][j - 1] + 1);
    }
  }

  const words: ScoreResult['words'] = [];
  let i = t.length;
  let j = h.length;
  while (i > 0) {
    if (j > 0 && d[i][j] === d[i - 1][j - 1] + (t[i - 1] === h[j - 1] ? 0 : 1)) {
      const correct = t[i - 1] === h[j - 1];
      words.unshift(
        correct
          ? { word: display[i - 1], status: 'correct' }
          : { word: display[i - 1], status: 'substituted', heard: h[j - 1] },
      );
      i--;
      j--;
    } else if (d[i][j] === d[i - 1][j] + 1) {
      words.unshift({ word: display[i - 1], status: 'missed' });
      i--;
    } else {
      j--; // extra word the user said; doesn't affect the target words
    }
  }

  const matched = words.filter((w) => w.status === 'correct').length;
  return { score: t.length ? matched / t.length : 0, words };
}
