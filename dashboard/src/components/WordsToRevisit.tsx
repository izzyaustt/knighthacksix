import { useState } from 'react';
import { api, type RevisitWord } from '../api.ts';

type Props = { words: RevisitWord[] | undefined; onChange: () => void };

export function WordsToRevisit({ words, onChange }: Props) {
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!words?.length) {
    return <p className="empty">Nothing to revisit. Save a phrase in the extension and it will show up here until you master it.</p>;
  }

  const markMastered = async (word: string) => {
    setSaving(word);
    setError(null);
    try {
      await api.setVocabStatus(word, 'known');
      onChange();
    } catch {
      setError(`Couldn't mark “${word}” as mastered. Try again.`);
    } finally {
      setSaving(null);
    }
  };

  return (
    <>
      <ul className="revisit-list">
        {words.map((w) => (
          <li key={w.word}>
            <div className="revisit-text">
              <div className="revisit-word" lang="es">{w.word}</div>
              {w.translation && <div className="revisit-translation">{w.translation}</div>}
              {w.note && <div className="revisit-note">{w.note}</div>}
            </div>
            <button className="round-button quiet" type="button" disabled={saving === w.word} onClick={() => markMastered(w.word)} title="Mark as mastered" aria-label={`Mark ${w.word} as mastered`}>
              <CheckIcon />
            </button>
            {/* Destination not decided yet, so the arrow is shown but does nothing. */}
            <button className="round-button" type="button" aria-disabled="true" title="Coming soon" aria-label={`Study ${w.word} (coming soon)`}>
              <ArrowIcon />
            </button>
          </li>
        ))}
      </ul>
      {error && <p className="revisit-error" role="alert">{error}</p>}
    </>
  );
}

const iconProps = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.5, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;
const ArrowIcon = () => <svg {...iconProps}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
const CheckIcon = () => <svg {...iconProps}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
