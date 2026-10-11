import { useEffect, useState } from 'react';
import type { Language } from '../../../shared/languages.ts';
import { api, type Polled, type VocabWord } from '../api.ts';
import { Flashcard } from './Flashcard.tsx';
import { SayIt } from './SayIt.tsx';

type Grade = 'right' | 'wrong';

export function Study({ vocab, language, focusWord, onChange }: { vocab: Polled<VocabWord[]>; language: Language; focusWord?: string | null; onChange: () => void }) {  const words = vocab.data ?? [];
  // The flashcards are the main content, so the word list starts collapsed.
  const [drawerOpen, setDrawerOpen] = useState(false);
  // The list re-polls every few seconds, so the current card is tracked by word rather than position.
  const [current, setCurrent] = useState<string | null>(focusWord ?? null);  const [flipped, setFlipped] = useState(false);
  const found = words.findIndex((w) => w.word === current);
  const index = found < 0 ? 0 : found;
  const word = words[index];
  // Self-graded results for this visit, by word. A miss also sends the word to Words To Revisit.
  const [grades, setGrades] = useState<Record<string, Grade>>({});
  const [error, setError] = useState<string | null>(null);
  // Counts saved misses, so each one shows the toast afresh.
  const [toast, setToast] = useState(0);
  const right = words.filter((w) => grades[w.word] === 'right').length;
  const wrong = words.filter((w) => grades[w.word] === 'wrong').length;

  const show = (i: number) => {
    if (!words.length) return;
    setCurrent(words[(i + words.length) % words.length].word);
    setFlipped(false);
  };

  const grade = (result: Grade) => {
    if (!word || !flipped) return;
    setGrades((g) => ({ ...g, [word.word]: result }));
    setError(null);
    show(index + 1);
    if (result === 'right') return;
    api.setVocabStatus(word.word, 'learning', language).then(() => { setToast((n) => n + 1); onChange(); },
      () => setError(`Couldn't add “${word.word}” to Words To Revisit. Try again.`));
  };

  useEffect(() => { setGrades({}); setError(null); }, [language]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(0), 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
  if (focusWord) { setCurrent(focusWord); setFlipped(false); }
}, [focusWord]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || (event.target as HTMLElement).closest('input, textarea, select')) return;
      if (event.key === 'ArrowLeft') show(index - 1);
      if (event.key === 'ArrowRight') show(index + 1);
      if (event.key === '1') grade('wrong');
      if (event.key === '2') grade('right');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <section className="study-page" aria-label="Study">
      <div className={`study-deck${drawerOpen ? '' : ' drawer-closed'}`}>
        <aside className="vocab-drawer" aria-label="Your vocabulary">
          <div className="vocab-drawer-head">
            {drawerOpen && <h2 className="section-title">Saved Vocabulary <span className="muted">· {words.length}</span></h2>}
            <button className="vocab-drawer-toggle" type="button" onClick={() => setDrawerOpen((open) => !open)} aria-expanded={drawerOpen}
              aria-controls="vocab-drawer-list" title={drawerOpen ? 'Hide vocab list' : undefined}>
              {drawerOpen ? <span className="visually-hidden">Hide vocab list</span> : <span>Show vocab list <span className="muted">· {words.length}</span></span>}
              <ChevronIcon open={drawerOpen} />
            </button>
          </div>
          <ul id="vocab-drawer-list" className="vocab-drawer-list" hidden={!drawerOpen}>
            {words.map((w, i) => (
              <li key={w.word}>
                <button type="button" onClick={() => show(i)} aria-current={i === index ? 'true' : undefined}>
                  <strong lang={language}>{w.word}</strong>
                  {w.translation && <span>{w.translation}</span>}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <div className="deck-main">
          {vocab.status === 'loading' ? <p className="empty">Loading your words…</p>
            : vocab.status === 'error' ? <p className="empty">Couldn't load your words. Check that the backend is running.</p>
            : !word ? <p className="empty">No saved words yet. Click a word in the extension and choose Save to start your deck.</p>
            : <>
              <div className="deck-stage">
                <button className="deck-arrow" type="button" onClick={() => show(index - 1)} aria-label="Previous word" disabled={words.length < 2}><ArrowIcon d="M15 5l-7 7 7 7" /></button>
                <Flashcard word={word} language={language} flipped={flipped} onFlip={() => setFlipped((f) => !f)} />
                <button className="deck-arrow" type="button" onClick={() => show(index + 1)} aria-label="Next word" disabled={words.length < 2}><ArrowIcon d="M9 5l7 7-7 7" /></button>
              </div>
              {flipped && <div className="deck-grade">
                <button className="deck-grade-button wrong" type="button" onClick={() => grade('wrong')} title="Missed it (1)" aria-label={`Missed ${word.word}. Add it to Words To Revisit`}><GradeIcon d="M6 6l12 12M18 6L6 18" /></button>
                <button className="deck-grade-button right" type="button" onClick={() => grade('right')} title="Got it (2)" aria-label={`Got ${word.word} right`}><GradeIcon d="M5 12.5l4.5 4.5L19 7.5" /></button>
              </div>}
              <p className="deck-hint">{flipped ? 'Did you get it right?' : 'Click to view definition'} · {index + 1} of {words.length}{right + wrong > 0 && ` · ${right} correct · ${wrong} to revisit`}</p>
              {error && <p className="deck-error" role="alert">{error}</p>}
              <SayIt key={`${language}:${word.word}`} word={word} language={language} />
            </>}
        </div>

      </div>
      <div className="toast-region" role="status" aria-live="polite">
        {toast > 0 && <div className="toast" key={toast}>Added to Words To Revisit</div>}
      </div>
    </section>
  );
}

const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={open ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} />
  </svg>
);
const ArrowIcon = ({ d }: { d: string }) => (
  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);
const GradeIcon = ({ d }: { d: string }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);
