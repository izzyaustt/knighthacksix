// Models sometimes put JSON field labels into prose. Also clean older saved reviews.
export function cleanTutorText(text: string): string {
  return text
    .replace(/(?:^|[\s,;]+)["']?(?:better_reply|turn_index|user_reply|already_suggested)["']?\s*[:=]?\s*.*$/isu, '')
    .replace(/^\s*["']?(?:reason|summary|feedback)["']?\s*[:=]\s*/iu, '')
    .trim();
}

export function wordTip(word: string, reply: string, reason: string): string {
  if (word.trim().toLocaleLowerCase() === 'me' && /^me\s+gustan?\b/iu.test(reply.trim())) {
    return 'Use “me” when saying what you like.';
  }
  return cleanTutorText(reason);
}

const grammarWords: Record<string, Set<string>> = {
  es: new Set('yo tú tu él el ella ello usted ustedes nosotros nosotras vosotros vosotras ellos ellas me te se nos os mi mis ti su sus lo la los las le les un una unos unas a de del al y o que qué'.split(' ')),
  fr: new Set('je tu il elle on nous vous ils elles me te se moi toi lui leur le la les un une des de du au aux et ou'.split(' ')),
  fil: new Set('ako ikaw ka siya tayo kami kayo sila ko mo niya natin namin ninyo nila ang ng sa'.split(' ')),
};
export function isReviewVocabulary(word: string, lang: string): boolean {
  return !grammarWords[lang]?.has(word.trim().normalize('NFKC').toLocaleLowerCase());
}
