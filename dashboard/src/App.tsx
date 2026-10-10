import { useCallback } from 'react';
import { api, usePolling, type Status } from './api.ts';
import { signOut, type Session } from './auth.ts';
import { Card } from './components/Card.tsx';
import { StatsActivity, HEATMAP_DAYS } from './components/StatsActivity.tsx';
import { TopVideos } from './components/TopVideos.tsx';
import { VocabList } from './components/VocabList.tsx';
import { Resources } from './components/Resources.tsx';
import { ScoreChart, SCORE_DAYS } from './components/ScoreChart.tsx';

// Stats refresh often so extension activity shows up quickly; the video list is heavier and changes slowly.
const STATS_INTERVAL = 5_000;
const VIDEOS_INTERVAL = 30_000;

export function App({ user }: { user: Session['user'] }) {
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
        <h1 className="page-title">Overview</h1>
        <div className="account">
          <span className="account-email" title={user.name ?? undefined}>{user.email}</span>
          <button className="avatar" type="button" onClick={signOut} title="Sign out" aria-label={`Sign out ${user.email}`}>
            <SignOutIcon />
          </button>
        </div>
      </header>

      <nav className="sidebar" aria-label="Main">
        <button className="nav-item" type="button" aria-current="page"><HomeIcon /> Dashboard</button>
        <button className="nav-item" type="button" disabled><StudyIcon /> Study <span className="soon">Soon</span></button>
      </nav>

      <main className="main">
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
      </main>
    </div>
  );
}

const iconProps = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;
const HomeIcon = () => <svg {...iconProps}><path d="M3 11 12 4l9 7" /><path d="M5 10v10h14V10" /></svg>;
const StudyIcon = () => <svg {...iconProps}><path d="M4 5h11a3 3 0 0 1 3 3v12H7a3 3 0 0 1-3-3z" /><path d="M8 9h6M8 13h6" /></svg>;
const SignOutIcon = () => <svg {...iconProps}><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 16l-4-4 4-4M6 12h10" /></svg>;
