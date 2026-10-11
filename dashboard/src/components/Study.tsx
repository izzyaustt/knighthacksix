import { languageName, type Language } from '../../../shared/languages.ts';
export function Study({ onOpenTutor, language }: { onOpenTutor: () => void; language: Language }) {
  return <section className="study-page" aria-label="Study">
    <div className="study-intro">
      <span className="study-eyebrow">YOUR PRACTICE SPACE</span>
      <h2>Make your {languageName(language)} part of the conversation.</h2>
      <p>Choose how you want to practice today.</p>
    </div>
    <div className="study-tutor-card">
      <span className="study-eyebrow">SPEAKING PRACTICE</span>
      <h3>Tutor</h3>
      <p>Talk with Luna, your {languageName(language)} tutor. Pick an everyday scenario, practice at your level, and get gentle corrections with English help whenever you need it.</p>
      <button className="study-primary" type="button" onClick={onOpenTutor}>Open Tutor →</button>
    </div>
  </section>;
}
