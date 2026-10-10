import type { AlignedLine } from './types';

// Re-evaluate playback after every request so a seek cannot leave the current
// caption waiting behind the beginning of a long video.
export function nextBatchOffset(lines: AlignedLine[], time: number, size: number, attempted: Set<number>): number | null {
  if (!lines.length) return null;
  let index = lines.findLastIndex(line => line.start <= time);
  if (index < 0) index = 0;
  else if (time >= lines[index].end && index + 1 < lines.length) index++;
  const first = Math.floor(index / size) * size;
  const needed = (offset: number) => !attempted.has(offset) && lines.slice(offset, offset + size).some(line => !line.tgt);
  for (let offset = first; offset < lines.length; offset += size) {
    if (needed(offset)) return offset;
  }
  for (let offset = 0; offset < first; offset += size) {
    if (needed(offset)) return offset;
  }
  return null;
}
