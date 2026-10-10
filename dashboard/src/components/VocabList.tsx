import type { VocabWord } from '../api.ts';
import { timeAgo } from '../dates.ts';

export function VocabList({ words }: { words: VocabWord[] | undefined }) {
  if (!words?.length) {
    return <p className="empty">No saved phrases yet. Click a phrase in the extension and choose Save phrase to start your list.</p>;
  }
  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead><tr><th>Spanish</th><th>English</th><th>Status</th><th>Saved</th></tr></thead>
        <tbody>
          {words.map((w) => (
            <tr key={w.word}>
              <td className="vocab-word">
                {w.video_id ? (
                  <a href={`https://www.youtube.com/watch?v=${w.video_id}${w.video_ts ? `&t=${Math.floor(w.video_ts)}s` : ''}`} target="_blank" rel="noreferrer" title="Open where you saved it">
                    {w.word}
                  </a>
                ) : w.word}
              </td>
              <td>{w.translation ?? <span className="muted">–</span>}</td>
              <td><span className="pill">{w.status}</span></td>
              <td className="muted">{timeAgo(w.saved_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
