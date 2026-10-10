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

export function renderColored(text: string, phrases: string[]): DocumentFragment {
  const frag = document.createDocumentFragment();
  let pos = 0;
  for (const r of findRanges(text, phrases)) {
    if (r.start > pos) frag.append(text.slice(pos, r.start));
    const span = document.createElement('span');
    span.style.color = PALETTE[r.index % PALETTE.length];
    span.dataset.pairIndex = String(r.index);
    span.textContent = text.slice(r.start, r.end);
    frag.append(span);
    pos = r.end;
  }
  if (pos < text.length) frag.append(text.slice(pos));
  return frag;
}
