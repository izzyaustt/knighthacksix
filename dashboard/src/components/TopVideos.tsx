import { useEffect, useState } from 'react';
import type { VideoStat } from '../api.ts';
import { timeAgo } from '../dates.ts';

// YouTube's oEmbed endpoint gives titles without an API key and allows cross-origin requests.
const titleCache = new Map<string, Promise<string | null>>();
function fetchTitle(id: string): Promise<string | null> {
  if (!titleCache.has(id)) {
    const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`;
    titleCache.set(id, fetch(url).then((r) => (r.ok ? r.json() : null)).then((j) => j?.title ?? null).catch(() => null));
  }
  return titleCache.get(id)!;
}

export function TopVideos({ videos }: { videos: VideoStat[] | undefined }) {
  const [titles, setTitles] = useState<Record<string, string | null>>({});
  useEffect(() => {
    let cancelled = false;
    for (const v of videos ?? []) {
      fetchTitle(v.video_id).then((title) => { if (!cancelled) setTitles((t) => (t[v.video_id] === title ? t : { ...t, [v.video_id]: title })); });
    }
    return () => { cancelled = true; };
  }, [videos]);

  if (!videos?.length) return <p className="empty">Videos you study with the extension will show up here.</p>;

  return (
    <ul className="video-list">
      {videos.map((v) => (
        <li key={v.video_id}>
          <a className="video" href={`https://www.youtube.com/watch?v=${v.video_id}`} target="_blank" rel="noreferrer">
            <p className="video-known">
              {v.known_pct === null ? 'Keep watching to see how much you know' : `You know ${Math.round(v.known_pct * 100)}% of this video`}
            </p>
            <img src={`https://i.ytimg.com/vi/${v.video_id}/mqdefault.jpg`} alt="" loading="lazy" />
            <div>
              <div className="video-title">{titles[v.video_id] ?? `YouTube video ${v.video_id}`}</div>
              <div className="video-meta">{v.events} {v.events === 1 ? 'activity' : 'activities'} · {timeAgo(v.last_time)}</div>
            </div>
          </a>
        </li>
      ))}
    </ul>
  );
}
