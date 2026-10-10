const RESOURCES = [
  { name: 'SpanishDict', url: 'https://www.spanishdict.com/', note: 'Dictionary, conjugations, and grammar guides' },
  { name: 'WordReference', url: 'https://www.wordreference.com/es/', note: 'Translations with community forum answers' },
  { name: 'Forvo', url: 'https://forvo.com/languages/es/', note: 'Hear words pronounced by native speakers' },
  { name: 'RAE Dictionary', url: 'https://dle.rae.es/', note: 'The official Spanish-language dictionary' },
];

export function Resources() {
  return (
    <ul className="resource-list">
      {RESOURCES.map((r) => (
        <li key={r.name}>
          <a href={r.url} target="_blank" rel="noreferrer"><strong>{r.name}</strong><span>{r.note}</span></a>
        </li>
      ))}
    </ul>
  );
}
