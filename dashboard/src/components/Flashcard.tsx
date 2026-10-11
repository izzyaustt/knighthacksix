import { useEffect, useState, type MouseEvent } from 'react';
import type { VocabWord } from '../api.ts';
import { explain, type Explanation } from '../practice-api.ts';
import type { Language } from '../../../shared/languages.ts';
import { spanishPronunciation } from '../../../shared/spanish-pronunciation.ts';

type Loaded = { word: string; data?: Explanation; error?: string };

/** Front: the Spanish word. Back: what the extension's word lookup shows, minus the video clip. */
export function Flashcard({ word, language, flipped, onFlip }: { word: VocabWord; language: Language; flipped: boolean; onFlip: () => void }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [retry, setRetry] = useState(0);
  // The explanation is an AI call, so it waits until the card is first turned over.
  useEffect(() => {
    if (!flipped) return;
    let current = true;
    explain(word.word, word.translation, language).then(
      (data) => { if (current) setLoaded({ word: word.word, data }); },
      (error: Error) => { if (current) setLoaded({ word: word.word, error: error.message }); },
    );
    return () => { current = false; };
  }, [flipped, word.word, word.translation, language, retry]);
  const result = loaded?.word === word.word ? loaded : null;
  // The respelling guide only covers Spanish; other languages rely on Listen.
  const guide = language === 'es' ? spanishPronunciation(word.word) : null;
  const size = word.word.length > 28 ? ' long' : word.word.length > 12 ? ' medium' : '';
  // Clicking the back's text turns it over too, except on its links and buttons.
  const flipFromBack = (event: MouseEvent) => { if (!(event.target as HTMLElement).closest('a, button')) onFlip(); };

  return (
    <div className={`flashcard${flipped ? ' flipped' : ''}`}>
      <button className="flashcard-face flashcard-front" type="button" onClick={onFlip} inert={flipped}
        aria-label={`${word.word}. Show the definition`}>
        <span className={`flashcard-word${size}`} lang={language}>{word.word}</span>
      </button>

      <div className="flashcard-face flashcard-back" onClick={flipFromBack} inert={!flipped}>
        <div className="flashcard-back-head">
          <div>
            <h3 className={`flashcard-back-word${size}`} lang={language}>{word.word}</h3>
            <p className="flashcard-gloss">{word.translation ?? result?.data?.gloss ?? ''}</p>
          </div>
          <button className="link-button" type="button" onClick={onFlip}>Show word</button>
        </div>

        <p className="flashcard-grammar" role="status">
          {result?.data ? [result.data.gloss, result.data.grammar_note].filter(Boolean).join(' — ')
            : result?.error ? <>Explanation unavailable: {result.error}{' '}
              <button className="link-button" type="button" onClick={() => { setLoaded(null); setRetry((n) => n + 1); }}>Retry</button></>
            : 'Loading explanation…'}
        </p>

        {guide && <div className="flashcard-pron">
          <p><strong>Say it:</strong> {guide.respelling}</p>
          <p className="muted">Syllables: {guide.syllables}</p>
          <p className="muted">Latin American Spanish · CAPS mark stress. Short vowels: ah / eh / ee / oh / oo.</p>
          {guide.tips.length > 0 && <p className="muted">{guide.tips.join(' ')}</p>}
        </div>}

        {result?.data && <dl className="flashcard-details">
          {result.data.why_here && <><dt>When to use it</dt><dd>{result.data.why_here}</dd></>}
          {result.data.example && <><dt>Example</dt><dd>{result.data.example}</dd></>}
          {result.data.formality && <><dt>Tone and usage</dt><dd>{result.data.formality}</dd></>}
        </dl>}

        {word.video_id && (
          <a className="flashcard-source" target="_blank" rel="noreferrer"
            href={`https://www.youtube.com/watch?v=${word.video_id}${word.video_ts ? `&t=${Math.floor(word.video_ts)}s` : ''}`}>
            Open the clip where you saved it ↗
          </a>
        )}
      </div>
    </div>
  );
}
