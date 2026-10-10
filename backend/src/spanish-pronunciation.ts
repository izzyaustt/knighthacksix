// Beginner respelling for Latin American Spanish. No network or model guesses.
// Letter sounds: https://www.spanishdict.com/guide/spanish-alphabet-pronunciation
// Stress/hiatus conventions: https://www.rae.es/dpd/tilde
type Unit = { text: string; start: number; end: number; vowel: boolean };
type Nucleus = { start: number; end: number; vowels: string };
const base = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '');
const vowel = (s: string) => /^[aeiouüáéíóú]$/u.test(s);
const strong = (s: string) => /^[aeoáéóíú]$/u.test(s);
const onset = /^(?:[pbfcg]l|[pbtdcfg]r|tl|ch|ll|rr|qu|gu)$/u;
const sounds: Record<string, string> = { a: 'ah', e: 'eh', i: 'ee', o: 'oh', u: 'oo', y: 'ee' };
const glides: Record<string, string> = {
  ia: 'yah', ie: 'yeh', io: 'yoh', iu: 'yoo', ua: 'wah', ue: 'weh', uo: 'woh', ui: 'wee',
  ai: 'eye', ei: 'ay', oi: 'oy', au: 'ow', eu: 'ehw', ou: 'ohw',
  ay: 'eye', ey: 'ay', oy: 'oy', uy: 'ooy', uai: 'why', uay: 'why', uei: 'way', uey: 'way', iai: 'yeye', iau: 'yow',
};

function wordGuide(input: string): { say: string; syllables: string } | null {
  const word = input.toLowerCase().normalize('NFC');
  // Foreign spelling, acronyms, and names with exceptional x need actual audio.
  if (!/^[a-záéíóúüñ]+$/u.test(word) || /^[A-Z]{2,}$/.test(input)
    || /^(?:software|hardware|youtube|google|javascript|online|hawái|méxico|mexicano|oaxaca|texas)$/u.test(word)) return null;
  // -mente adverbs retain the adjective's stress as well as the suffix's.
  if (word.endsWith('mente') && word.length > 5) {
    const adjective = wordGuide(word.slice(0, -5));
    if (adjective) return { say: `${adjective.say}-MEHN-teh`, syllables: `${adjective.syllables}-MEN-te` };
  }
  const units: Unit[] = [];
  for (let i = 0; i < word.length;) {
    const pair = word.slice(i, i + 2);
    const digraph = /^(ch|ll|rr)$/.test(pair) || /^(qu|gu)$/.test(pair) && /^[eéií]$/.test(word[i + 2] ?? '');
    const size = digraph ? 2 : 1;
    units.push({ text: word.slice(i, i + size), start: i, end: i + size,
      vowel: !digraph && (vowel(word[i]) || word[i] === 'y' && i === word.length - 1) });
    i += size;
  }
  const nuclei: Nucleus[] = [];
  let previousVowelIndex = -2;
  for (let i = 0; i < units.length; i++) {
    const u = units[i]; if (!u.vowel) continue;
    const last = nuclei.at(-1);
    const adjacent = units.slice(previousVowelIndex + 1, i).every(x => x.text === 'h');
    const sequence = (last?.vowels ?? '') + u.text;
    const repeated = last && base(last.vowels.at(-1)!) === base(u.text);
    const combine = last && adjacent && !repeated && !/[íú]/.test(sequence)
      && [...sequence].filter(strong).length <= 1 && sequence.length <= 3;
    if (combine) { last.end = u.end; last.vowels += u.text; }
    else nuclei.push({ start: u.start, end: u.end, vowels: u.text });
    previousVowelIndex = i;
  }
  if (!nuclei.length) return null;
  const boundaries = [0];
  for (let i = 1; i < nuclei.length; i++) {
    const gap = word.slice(nuclei[i - 1].end, nuclei[i].start);
    const lastTwo = gap.slice(-2);
    const onsetLength = gap.length >= 2 && onset.test(lastTwo) ? 2 : Math.min(gap.length, 1);
    boundaries.push(nuclei[i].start - onsetLength);
  }
  boundaries.push(word.length);
  const accent = word.search(/[áéíóú]/u);
  const ending = word.at(-1)!;
  const regularPenultimate = vowel(ending) || /[ns]/.test(ending) && vowel(word.at(-2) ?? '');
  const stressed = accent >= 0 ? boundaries.findIndex((start, i) => start <= accent && boundaries[i + 1] > accent)
    : Math.max(0, nuclei.length - (regularPenultimate ? 2 : 1));
  const say: string[] = [], syllables: string[] = [];
  for (let s = 0; s < nuclei.length; s++) {
    const start = boundaries[s], end = boundaries[s + 1];
    let rendered = '';
    for (const u of units.filter(x => x.start >= start && x.start < end)) {
      const nucleus = nuclei[s];
      if (u.start === nucleus.start) {
        const v = base(nucleus.vowels);
        rendered += glides[v] ?? [...v].map(c => sounds[c]).join('');
      } else if (u.start < nucleus.end && u.end > nucleus.start || u.text === 'h') continue;
      else {
        const front = /^[eéií]$/.test(word[u.end] ?? '');
        const c = u.text;
        rendered += c === 'ch' ? 'ch' : c === 'll' ? 'y' : c === 'rr' ? 'rr'
          : c === 'qu' ? 'k' : c === 'gu' ? 'g' : c === 'ñ' ? 'ny'
          : c === 'c' ? front ? 's' : 'k' : c === 'g' ? front ? 'h' : 'g'
          : c === 'j' ? 'h' : c === 'z' ? 's' : c === 'v' ? 'b'
          : c === 'x' ? u.start === 0 ? 's' : 'ks'
          : c === 'r' && (u.start === 0 || /[nls]/.test(word[u.start - 1])) ? 'rr' : c;
      }
    }
    say.push(s === stressed ? rendered.toUpperCase() : rendered);
    const spelling = word.slice(start, end);
    syllables.push(s === stressed ? spelling.toUpperCase() : spelling);
  }
  return { say: say.join('-'), syllables: syllables.join('-') };
}

export function spanishPronunciation(text: string): { respelling: string; syllables: string; tips: string[] } {
  const normalized = text.normalize('NFC');
  const tips: string[] = [];
  if (/[hH]/.test(normalized)) tips.push('h is silent (except in ch).');
  if (/[cC][eéií]|[zZ]/u.test(normalized)) tips.push('c before e/i, and z, sound like s in this Latin American guide.');
  if (/[gG][eéií]|[jJ]/u.test(normalized)) tips.push('j and g before e/i use a breathy h sound, never the English j.');
  if (/[gG](?![eéií])/u.test(normalized)) tips.push('g elsewhere is hard, as in go; u is silent in gue/gui, but pronounced in güe/güi.');
  if (/[qQ]u[eéií]/u.test(normalized)) tips.push('qu sounds like k; the u is silent.');
  if (/[ñÑ]/.test(normalized)) tips.push('ny means the ñ sound in canyon.');
  if (/[rR]/.test(normalized)) tips.push('r is a quick tongue tap; rr is rolled. Avoid the English r.');
  if (/[vV]/.test(normalized)) tips.push('v uses the Spanish b sound.');
  const words = /[\p{L}\p{M}]+/gu;
  let skipped = false;
  const respelling = normalized.replace(words, word => {
    const guide = wordGuide(word);
    if (!guide) { skipped = true; return `${word} (listen)`; }
    return guide.say;
  });
  const syllables = normalized.replace(words, word => wordGuide(word)?.syllables ?? word);
  if (skipped) tips.push('Use Listen for names, acronyms, and foreign words without a guide.');
  return { respelling, syllables, tips };
}
