import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { api, usePolling, type Status } from './api.ts';
import { signOut, type Session } from './auth.ts';
import { Study } from './components/Study.tsx';
import { Card } from './components/Card.tsx';
import { StatsActivity, HEATMAP_DAYS } from './components/StatsActivity.tsx';
import { TopVideos } from './components/TopVideos.tsx';
import { VocabList } from './components/VocabList.tsx';
import { Resources } from './components/Resources.tsx';
import { ScoreChart, SCORE_DAYS } from './components/ScoreChart.tsx';

// Stats refresh often so extension activity shows up quickly; the video list is heavier and changes slowly.
const STATS_INTERVAL = 5_000;
const VIDEOS_INTERVAL = 30_000;
const Tutor = lazy(() => import('./components/Tutor.tsx').then(module => ({ default: module.Tutor })));
type Page = 'dashboard' | 'study' | 'tutor';
const currentPage = (): Page => window.location.hash === '#study/tutor' ? 'tutor' : window.location.hash === '#study' ? 'study' : 'dashboard';

export function App({ user }: { user: Session['user'] }) {
  const [page, setPage] = useState<Page>(currentPage);
  useEffect(() => {
    const onNavigation = () => setPage(currentPage());
    window.addEventListener('hashchange', onNavigation);
    return () => window.removeEventListener('hashchange', onNavigation);
  }, []);
  const activity = usePolling(useCallback((s: AbortSignal) => api.activity(HEATMAP_DAYS, s), []), STATS_INTERVAL);
  const scores = usePolling(useCallback((s: AbortSignal) => api.scoreTrend(Math.max(HEATMAP_DAYS, SCORE_DAYS), s), []), STATS_INTERVAL);
  const vocab = usePolling(api.vocab, STATS_INTERVAL);
  const recent = usePolling(api.recent, VIDEOS_INTERVAL);

  const statuses: Status[] = [activity.status, scores.status, vocab.status, recent.status];
  const offline = statuses.some((s) => s === 'error' || s === 'stale');

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="/" aria-label="langtube home">
          <img src="/logo.png" alt="langtube" />
        </a>
        <h1 className="page-title">{page === 'tutor' ? 'Tutor' : page === 'study' ? 'Study' : 'Overview'}</h1>
        <div className="account">
          <span className="account-email" title={user.name ?? undefined}>{user.email}</span>
          <button className="avatar" type="button" onClick={signOut} title="Sign out" aria-label={`Sign out ${user.email}`}>
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
        {page === 'tutor' ? <Suspense fallback={<p role="status">Loading your tutor…</p>}><Tutor /></Suspense> : page === 'study' ? <Study onOpenTutor={() => { window.location.hash = 'study/tutor'; }} /> : <>
        {offline && (
          <p className="banner" role="status">
            Can't reach the backend, so some numbers may be out of date. Start it from <code>backend/</code> with{' '}
            <code>npm run start:ollama</code>, and this page will reconnect automatically.
          </p>
        )}

        <div className="grid">
          <StatsActivity className="span-8" activity={activity} scores={scores} vocab={vocab} />
          <Card className="span-4" title="Top Study Videos" status={recent.status}>
            <TopVideos events={recent.data} />
          </Card>

          <Card className="span-8" title="Vocab Lists" status={vocab.status}>
            <VocabList words={vocab.data} />
          </Card>
          <Card className="span-4" title="User Leaderboard">
            <p className="empty">Leaderboards are coming once accounts are added.</p>
          </Card>

          <Card className="span-5" title="More Resources">
            <Resources />
          </Card>
          <Card className="span-7" title="Intelligibility Score" status={scores.status}>
            <ScoreChart points={scores.data} />
          </Card>
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
