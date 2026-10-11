import { useCallback } from 'react';
import { api, usePolling, type Status } from './api.ts';
import { signOut, type Session } from './auth.ts';
import { Card } from './components/Card.tsx';
import { StatsActivity, HEATMAP_DAYS } from './components/StatsActivity.tsx';
import { TopVideos } from './components/TopVideos.tsx';
import { WordsToRevisit } from './components/WordsToRevisit.tsx';
import { ImmersionHours, MasteryLevels } from './components/Progress.tsx';

// Stats refresh often so extension activity shows up quickly; the video list is heavier and changes slowly.
const STATS_INTERVAL = 5_000;
const VIDEOS_INTERVAL = 30_000;

export function App({ user }: { user: Session['user'] }) {
  const activity = usePolling(useCallback((s: AbortSignal) => api.activity(HEATMAP_DAYS, s), []), STATS_INTERVAL);
  const scores = usePolling(useCallback((s: AbortSignal) => api.scoreTrend(HEATMAP_DAYS, s), []), STATS_INTERVAL);
  const summary = usePolling(api.summary, STATS_INTERVAL);
  const revisit = usePolling(api.revisit, STATS_INTERVAL);
  const videos = usePolling(api.videos, VIDEOS_INTERVAL);

  const statuses: Status[] = [activity.status, scores.status, summary.status, revisit.status, videos.status];
  // Marking a word mastered changes the revisit list, the mastery counts, and video coverage.
  const onVocabChange = () => { revisit.refresh(); summary.refresh(); videos.refresh(); };
  const offline = statuses.some((s) => s === 'error' || s === 'stale');

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="/" aria-label="langtube home">
          <img src="/logo.png" alt="langtube" />
        </a>
        <h1 className="page-title">Overview</h1>
        <div className="account">
          <button className="avatar" type="button" onClick={signOut} title={`Sign out ${user.email}`} aria-label={`Sign out ${user.email}`}>
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
          <StatsActivity className="span-7" activity={activity} scores={scores} summary={summary} />
          <Card className="span-5" title="Top Study Videos" status={videos.status}>
            <TopVideos videos={videos.data} />
          </Card>

          <Card className="span-5" title="Words To Revisit" status={revisit.status}>
            <WordsToRevisit words={revisit.data} onChange={onVocabChange} />
          </Card>
          <div className="span-7 olive-stack">
            <ImmersionHours summary={summary} />
            <MasteryLevels summary={summary} />
          </div>
        </div>
      </main>
    </div>
  );
}

const iconProps = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;
const HomeIcon = () => <svg {...iconProps}><path d="M3 11 12 4l9 7" /><path d="M5 10v10h14V10" /></svg>;
const StudyIcon = () => <svg {...iconProps}><path d="M4 5h11a3 3 0 0 1 3 3v12H7a3 3 0 0 1-3-3z" /><path d="M8 9h6M8 13h6" /></svg>;
const SignOutIcon = () => <svg {...iconProps}><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 16l-4-4 4-4M6 12h10" /></svg>;
