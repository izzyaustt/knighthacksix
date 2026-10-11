import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { LANGUAGES, isLanguage, type Language } from '../../shared/languages.ts';
import { api, usePolling, type Status } from './api.ts';
import { signOut, type Session } from './auth.ts';
import { Study } from './components/Study.tsx';
import { Card } from './components/Card.tsx';
import { StatsActivity, HEATMAP_DAYS } from './components/StatsActivity.tsx';
import { TopVideos } from './components/TopVideos.tsx';
import { WordsToRevisit } from './components/WordsToRevisit.tsx';
import { ImmersionHours, MasteryLevels } from './components/Progress.tsx';

// Stats refresh often so extension activity shows up quickly; the video list is heavier and changes slowly.
const STATS_INTERVAL = 5_000;
const VIDEOS_INTERVAL = 30_000;
const Tutor = lazy(() => import('./components/Tutor.tsx').then(module => ({ default: module.Tutor })));
type Page = 'dashboard' | 'study' | 'tutor';
const parseHash = () => {
  const [path, query = ''] = window.location.hash.split('?');
  return { path, word: new URLSearchParams(query).get('word') };
};
const currentPage = (): Page => {
  const { path } = parseHash();
  return path === '#study/tutor' ? 'tutor' : path === '#study' ? 'study' : 'dashboard';
};

export function App({ user, language, onLanguageChange }: { user: Session['user']; language: Language; onLanguageChange: (language: Language) => void }) {
  const [page, setPage] = useState<Page>(currentPage);
  const [focusWord, setFocusWord] = useState<string | null>(() => parseHash().word);
  useEffect(() => {
    const onNavigation = () => { setPage(currentPage()); setFocusWord(parseHash().word); };
    window.addEventListener('hashchange', onNavigation);
    return () => window.removeEventListener('hashchange', onNavigation);
  }, []);
  const activity = usePolling(useCallback((s: AbortSignal) => api.activity(HEATMAP_DAYS, s, language), [language]), STATS_INTERVAL);
  const scores = usePolling(useCallback((s: AbortSignal) => api.scoreTrend(HEATMAP_DAYS, s, language), [language]), STATS_INTERVAL);
  const summary = usePolling(useCallback((s: AbortSignal) => api.summary(s, language), [language]), STATS_INTERVAL);
  const revisit = usePolling(useCallback((s: AbortSignal) => api.revisit(s, language), [language]), STATS_INTERVAL);
  const videos = usePolling(useCallback((s: AbortSignal) => api.videos(s, language), [language]), VIDEOS_INTERVAL);
  // The Study page works from the full saved-word list.
  const vocab = usePolling(useCallback((s: AbortSignal) => api.vocab(s, language), [language]), STATS_INTERVAL);

  const statuses: Status[] = [activity.status, scores.status, summary.status, revisit.status, videos.status];
  // Marking a word mastered changes the revisit list, the mastery counts, and video coverage.
  const onVocabChange = () => { revisit.refresh(); summary.refresh(); videos.refresh(); vocab.refresh(); };
  const offline = statuses.some((s) => s === 'error' || s === 'stale');

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="/" aria-label="langtube home">
          <img src="/logo.png" alt="langtube" />
        </a>
        <h1 className="page-title">{page === 'tutor' ? 'Tutor' : page === 'study' ? 'Study' : 'Overview'}</h1>
        <div className="account">
          <select className="language-select" aria-label="Learning language" value={language} onChange={event => { if (isLanguage(event.target.value)) onLanguageChange(event.target.value); }}>
            {Object.entries(LANGUAGES).map(([code, info]) => <option key={code} value={code}>{info.name}</option>)}
          </select>
          <button className="avatar" type="button" onClick={signOut} title={`Sign out ${user.email}`} aria-label={`Sign out ${user.email}`}>
            <SignOutIcon />
          </button>
        </div>
      </header>

      <nav className="sidebar" aria-label="Main">
        <a className="nav-item" href="#dashboard" aria-current={page === 'dashboard' ? 'page' : undefined}><HomeIcon /> Dashboard</a>
        <a className="nav-item" href="#study" aria-current={page === 'study' ? 'page' : undefined}><StudyIcon /> Study</a>
        <a className="nav-item nav-subitem" href="#study/tutor" aria-current={page === 'tutor' ? 'page' : undefined}><PersonIcon /> Tutor</a>
      </nav>

      <main className="main">
        {page === 'tutor' ? <Suspense fallback={<p role="status">Loading your tutor…</p>}><Tutor language={language} /></Suspense> : page === 'study' ? <Study vocab={vocab} language={language} focusWord={focusWord} onOpenTutor={() => { window.location.hash = 'study/tutor'; }} /> : <>
        {offline && (
          <p className="banner" role="status">
            Can't reach the backend, so some numbers may be out of date. Start it from <code>backend/</code> with{' '}
            <code>npm run start:ollama</code>, and this page will reconnect automatically.
          </p>
        )}

        <div className="grid">
          <StatsActivity className="span-7" activity={activity} scores={scores} summary={summary} />
          <Card className="span-5" title="Top Study Videos" status={videos.status}>
            <TopVideos videos={videos.data} />
          </Card>

          <Card className="span-5" title="Words To Revisit" status={revisit.status}>
            <WordsToRevisit words={revisit.data} language={language} onChange={onVocabChange} />
          </Card>
          <div className="span-7 olive-stack">
            <ImmersionHours summary={summary} />
            <MasteryLevels summary={summary} />
          </div>
        </div>
        </>}
      </main>
    </div>
  );
}

const iconProps = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;
const HomeIcon = () => <svg {...iconProps}><path d="M3 11 12 4l9 7" /><path d="M5 10v10h14V10" /></svg>;
const StudyIcon = () => <svg {...iconProps}><path d="M4 5h11a3 3 0 0 1 3 3v12H7a3 3 0 0 1-3-3z" /><path d="M8 9h6M8 13h6" /></svg>;
const PersonIcon = () => <svg {...iconProps}><circle cx="12" cy="8" r="4" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></svg>;
const SignOutIcon = () => <svg {...iconProps}><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 16l-4-4 4-4M6 12h10" /></svg>;