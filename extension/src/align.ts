import { api } from './api';
import { getSettings } from './settings';
import type { AlignedLine, Line } from './types';

export async function alignLines(lines: Line[], videoId: string, startIndex: number): Promise<AlignedLine[]> {
  const settings = await getSettings();
  const level = ['easy', 'medium', 'hard'].includes(settings.level) ? settings.level : 'medium';
  const result = await api('/align', { videoId, startIndex, lang: settings.langTgt, level, lines });
  if (!Array.isArray(result.lines) || result.lines.length !== lines.length || result.lines.some((l: any) => !l.target)) {
    throw new Error('Translation returned an incomplete caption batch.');
  }
  return result.lines.map((l: any) => ({ start: l.start, end: l.end, src: l.source, tgt: l.target, pairs: l.pairs ?? [] }));
}
