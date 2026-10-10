export type Line = { start: number; end: number; text: string };
export type Pair = { src: string; tgt: string; srcStart: number; tgtStart: number; color: number };
export type AlignedLine = { start: number; end: number; source: string; target: string; pairs: Pair[] };

export function jsonCaptions(body: string): Line[] {
  const data = JSON.parse(body);
  return (data.events ?? []).flatMap((event: any) => {
    if (!Array.isArray(event.segs)) return [];
    const text = event.segs.map((s: any) => s.utf8 ?? '').join('').replace(/\s+/g, ' ').trim();
    const start = Number(event.tStartMs) / 1000;
    const end = start + Number(event.dDurationMs ?? 0) / 1000;
    return text && Number.isFinite(start) && end > start ? [{ start, end, text }] : [];
  });
}

export function activeIndex(lines: Line[], time: number): number {
  // Auto-captions can overlap: use the latest line that has started.
  let lo = 0, hi = lines.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (lines[mid].start <= time) lo = mid + 1;
    else hi = mid;
  }
  return lo && time < lines[lo - 1].end ? lo - 1 : -1;
}

export function segments(line: AlignedLine, target: boolean) {
  const text = target ? line.target : line.source;
  const pairs = [...line.pairs].sort((a, b) => (target ? a.tgtStart - b.tgtStart : a.srcStart - b.srcStart));
  const out: { text: string; pair?: Pair }[] = [];
  let cursor = 0;
  for (const pair of pairs) {
    const start = target ? pair.tgtStart : pair.srcStart;
    const phrase = target ? pair.tgt : pair.src;
    if (!Number.isInteger(start) || start < cursor || !phrase || text.slice(start, start + phrase.length) !== phrase) continue;
    if (start > cursor) out.push({ text: text.slice(cursor, start) });
    out.push({ text: phrase, pair });
    cursor = start + phrase.length;
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor) });
  return out;
}
