import test from 'node:test';
import assert from 'node:assert/strict';
import { spanishPronunciation as guide } from '../src/spanish-pronunciation.ts';

// Regression cases across the sound/stress rules, not just the reported word.
const cases = {
  hice: 'EE-seh', hacer: 'ah-SEHR', hace: 'AH-seh', hecho: 'EH-choh', ahora: 'ah-OH-rah',
  hola: 'OH-lah', hijo: 'EE-hoh', hablar: 'ah-BLAHR',
  gracias: 'GRAH-syahs', minutos: 'mee-NOO-tohs', gente: 'HEHN-teh', gigante: 'hee-GAHN-teh',
  queso: 'KEH-soh', quiero: 'KYEH-roh', guerra: 'GEH-rrah', guitarra: 'gee-TAH-rrah',
  pingüino: 'peen-GWEE-noh', vergüenza: 'behr-GWEHN-sah',
  niño: 'NEE-nyoh', mañana: 'mah-NYAH-nah', año: 'AH-nyoh',
  perro: 'PEH-rroh', pero: 'PEH-roh', ropa: 'RROH-pah',
  ciudad: 'syoo-DAHD', buenos: 'BWEH-nohs', huevo: 'WEH-boh', agua: 'AH-gwah',
  país: 'pah-EES', día: 'DEE-ah', había: 'ah-BEE-ah', frío: 'FREE-oh',
  canción: 'kahn-SYOHN', español: 'ehs-pah-NYOHL', café: 'kah-FEH',
  fácil: 'FAH-seel', rápidamente: 'RRAH-pee-dah-MEHN-teh', felizmente: 'feh-LEES-MEHN-teh',
  hoy: 'OY', muy: 'MOOY', sí: 'SEE', que: 'KEH',
};
test('Spanish sounds, syllables and stress remain consistent across representative words', () => {
  for (const [word, expected] of Object.entries(cases)) assert.equal(guide(word).respelling, expected, word);
  assert.equal(guide('hice').syllables, 'HI-ce');
  assert.equal(guide('país').syllables, 'pa-ÍS');
});
test('sentences keep every word, punctuation and Unicode accents', () => {
  assert.equal(guide('¡Hice una canción!').respelling, '¡EE-seh OO-nah kahn-SYOHN!');
  assert.deepEqual(guide('mañana'), guide('mañana'.normalize('NFD')));
  assert.equal(guide('hice hice').respelling, 'EE-seh EE-seh');
});
test('sound tips explain silent letters; exceptional names and acronyms request audio', () => {
  assert.match(guide('hice').tips.join(' '), /h is silent/);
  assert.match(guide('niño').tips.join(' '), /ñ/);
  assert.equal(guide('México API software').respelling, 'México (listen) API (listen) software (listen)');
});
