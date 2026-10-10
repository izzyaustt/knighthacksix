import type { AlignedLine, Line, Pair } from './types';

// Hardcoded real examples, keyed by normalized source text, to sanity-check real phrase pairs.
const EXAMPLES: Record<string, { tgt: string; pairs: Pair[] }> = {
  'how are you?': {
    tgt: '¿cómo estás?',
    pairs: [
      { src: 'how', tgt: 'cómo', note: 'interrogative adverb' },
      { src: 'are you', tgt: 'estás', note: 'estar, 2nd person singular, present' },
    ],
  },
};

function mockAlign(line: Line): AlignedLine {
  const base = { start: line.start, end: line.end, src: line.text };
  const example = EXAMPLES[line.text.trim().toLowerCase()];
  if (example) return { ...base, ...example };

  // Chunks of 2, 1, 2, 1… words; the same chunk is findable in both src and tgt.
  const words = line.text.split(/\s+/).filter(Boolean);
  const pairs: Pair[] = [];
  for (let i = 0, size = 2; i < words.length; i += size, size = size === 2 ? 1 : 2) {
    const chunk = words.slice(i, i + size).join(' ');
    pairs.push({ src: chunk, tgt: chunk });
  }
  return { ...base, tgt: '(ES) ' + line.text, pairs };
}

// MOCK. Later this body becomes a chrome.runtime.sendMessage to the service worker, which calls
// POST /align ({ lang_src: "en", lang_tgt: "es", level: "A2", lines } -> { lines: AlignedLine[] }).
export async function alignLines(lines: Line[]): Promise<AlignedLine[]> {
  return lines.map(mockAlign);
}
