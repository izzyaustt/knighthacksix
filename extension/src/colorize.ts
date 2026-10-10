export const PALETTE = ['#FFB547','#4FC3F7','#AED581','#F06292','#BA68C8','#4DD0E1','#FF8A65','#DCE775'];

export type Range = { start: number; end: number; index: number };

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Finds each phrase in `text` (case-insensitive, Unicode word boundaries), skipping occurrences
// that overlap a range claimed by an earlier phrase. Phrases that aren't found are left out.
export function findRanges(text: string, phrases: string[]): Range[] {
  const claimed: Range[] = [];
  phrases.forEach((phrase, index) => {
    const words = (phrase ?? '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return;
    try {
      const re = new RegExp(`(?<![\\p{L}\\p{N}])${words.map(escapeRegExp).join('\\s+')}(?![\\p{L}\\p{N}])`, 'giu');
      for (const m of text.matchAll(re)) {
        const start = m.index, end = start + m[0].length;
        if (claimed.some((r) => start < r.end && end > r.start)) continue;
        claimed.push({ start, end, index });
        break;
      }
    } catch {}
  });
  return claimed.sort((a, b) => a.start - b.start);
}

export function wordSegments(text: string, phrases: string[]) {
  const ranges = findRanges(text, phrases);
  const segments: { text: string; word?: string; index?: number }[] = [];
  let pos = 0;
  for (const match of text.matchAll(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)) {
    if (match.index > pos) segments.push({ text: text.slice(pos, match.index) });
    const range = ranges.find(r => match.index >= r.start && match.index + match[0].length <= r.end);
    segments.push({ text: match[0], word: match[0], index: range?.index });
    pos = match.index + match[0].length;
  }
  if (pos < text.length) segments.push({ text: text.slice(pos) });
  return segments;
}

export function renderColored(text: string, phrases: string[]): DocumentFragment {
  const frag = document.createDocumentFragment();
  for (const segment of wordSegments(text, phrases)) {
    if (!segment.word) { frag.append(segment.text); continue; }
    const word = document.createElement('button');
    word.type = 'button';
    word.dataset.word = segment.word;
    word.title = `Explain “${segment.word}” in this sentence`;
    if (segment.index !== undefined) {
      word.style.color = PALETTE[segment.index % PALETTE.length];
      word.dataset.pairIndex = String(segment.index);
    }
    word.textContent = segment.text;
    frag.append(word);
  }
  return frag;
}
