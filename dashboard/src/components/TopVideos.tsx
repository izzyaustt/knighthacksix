import { useEffect, useMemo, useState } from 'react';
import type { RecentEvent } from '../api.ts';
import { timeAgo } from '../dates.ts';

const SHOW = 3;

type VideoSummary = { id: string; events: number; lastTime: string; lastTs: number | null };

// YouTube's oEmbed endpoint gives titles without an API key and allows cross-origin requests.
const titleCache = new Map<string, Promise<string | null>>();
function fetchTitle(id: string): Promise<string | null> {
  if (!titleCache.has(id)) {
    const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`;
    titleCache.set(id, fetch(url).then((r) => (r.ok ? r.json() : null)).then((j) => j?.title ?? null).catch(() => null));
  }
  return titleCache.get(id)!;
}

export function TopVideos({ events }: { events: RecentEvent[] | undefined }) {
  const videos = useMemo(() => {
    const byId = new Map<string, VideoSummary>();
    for (const e of events ?? []) {
      if (!e.video_id) continue;
      const v = byId.get(e.video_id);
      // Events arrive newest first, so the first one seen per video is the latest.
      if (v) v.events++;
      else byId.set(e.video_id, { id: e.video_id, events: 1, lastTime: e.time, lastTs: e.video_ts });
    }
    return [...byId.values()].sort((a, b) => b.events - a.events || b.lastTime.localeCompare(a.lastTime)).slice(0, SHOW);
  }, [events]);

  const [titles, setTitles] = useState<Record<string, string | null>>({});
  useEffect(() => {
    let cancelled = false;
    for (const v of videos) {
      fetchTitle(v.id).then((title) => { if (!cancelled) setTitles((t) => (t[v.id] === title ? t : { ...t, [v.id]: title })); });
    }
    return () => { cancelled = true; };
  }, [videos]);

  if (videos.length === 0) return <p className="empty">Videos you study with the extension will show up here.</p>;

  return (
    <ul className="video-list">
      {videos.map((v) => {
        const link = `https://www.youtube.com/watch?v=${v.id}${v.lastTs ? `&t=${Math.floor(v.lastTs)}s` : ''}`;
        return (
          <li key={v.id}>
            <a className="video" href={link} target="_blank" rel="noreferrer">
              <img src={`https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`} alt="" loading="lazy" />
              <div>
                <div className="video-title">{titles[v.id] ?? `YouTube video ${v.id}`}</div>
                <div className="video-meta">{v.events} {v.events === 1 ? 'activity' : 'activities'} · {timeAgo(v.lastTime)}</div>
              </div>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
