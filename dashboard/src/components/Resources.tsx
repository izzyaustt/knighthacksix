import type { Language } from '../../../shared/languages.ts';
const RESOURCES = { es: [
  { name: 'SpanishDict', url: 'https://www.spanishdict.com/', note: 'Dictionary, conjugations, and grammar guides' },
  { name: 'WordReference', url: 'https://www.wordreference.com/es/', note: 'Translations with community forum answers' },
  { name: 'Forvo', url: 'https://forvo.com/languages/es/', note: 'Hear words pronounced by native speakers' },
  { name: 'RAE Dictionary', url: 'https://dle.rae.es/', note: 'The official Spanish-language dictionary' },
], fr: [
  { name: 'TV5MONDE', url: 'https://apprendre.tv5monde.com/en', note: 'French listening exercises from videos' },
  { name: 'Forvo', url: 'https://forvo.com/languages/fr/', note: 'French pronunciation recordings' },
], fil: [
  { name: 'Forvo', url: 'https://forvo.com/languages/tl/', note: 'Tagalog pronunciation recordings' },
] };

export function Resources({ language }: { language: Language }) {
  return (
    <ul className="resource-list">
      {RESOURCES[language].map((r) => (
        <li key={r.name}>
          <a href={r.url} target="_blank" rel="noreferrer"><strong>{r.name}</strong><span>{r.note}</span></a>
        </li>
      ))}
    </ul>
  );
}
