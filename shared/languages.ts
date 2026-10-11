export const LANGUAGES = {
  es: { name: 'Spanish', greeting: '¡Hola! Vamos a practicar español.', region: 'Latin American Spanish', repeat: '¿Puedes repetir?', slower: 'Más despacio, por favor', openings: {
    cafe: 'Soy la camarera. ¿Qué te gustaría tomar?', friends: '¿Qué te gusta hacer en tu tiempo libre?', travel: 'Tenemos un día libre. ¿Qué te gustaría visitar?',
  } },
  fr: { name: 'French', greeting: 'Bonjour ! Pratiquons le français.', region: 'French', repeat: 'Tu peux répéter ?', slower: 'Plus lentement, s’il te plaît', openings: {
    cafe: 'Bienvenue au café ! Qu’est-ce que vous voulez commander ?', friends: 'Qu’est-ce que tu aimes faire pendant ton temps libre ?', travel: 'Nous avons une journée libre. Qu’est-ce que tu voudrais visiter ?',
  } },
  fil: { name: 'Tagalog (Filipino)', greeting: 'Kamusta! Magpraktis tayo ng Tagalog.', region: 'Natural Tagalog (Filipino); avoid unnecessary English code-switching', repeat: 'Puwede mo bang ulitin?', slower: 'Mas mabagal, pakiusap', openings: {
    cafe: 'Maligayang pagdating! Ano ang gusto mong inumin?', friends: 'Ano ang gusto mong gawin sa libreng oras mo?', travel: 'May libre tayong araw. Saan mo gustong pumunta?',
  } },
} as const;
export type Language = keyof typeof LANGUAGES;
export const isLanguage = (value: unknown): value is Language => typeof value === 'string' && Object.hasOwn(LANGUAGES, value);
export const languageName = (value: Language) => LANGUAGES[value].name;
