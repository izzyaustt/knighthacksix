import { useMemo, useRef, useState, type FocusEvent, type MouseEvent } from 'react';
import type { ActivityDay, Polled, ScoreDay, Summary } from '../api.ts';
import { addDays, formatDay, today, weekday } from '../dates.ts';
import { Card } from './Card.tsx';

const WEEKS = 20;
export const HEATMAP_DAYS = WEEKS * 7;

const CELL = 14;
const GAP = 3;
const STEP = CELL + GAP;
const TOP = 16;
const LEVELS = ['var(--heat-0)', 'var(--heat-1)', 'var(--heat-2)', 'var(--heat-3)', 'var(--heat-4)'];

type Props = {
  className?: string;
  activity: Polled<ActivityDay[]>;
  scores: Polled<ScoreDay[]>;
  summary: Polled<Summary>;
};

type Cell = { day: string; col: number; row: number; actions: number; stats?: ActivityDay };
type Hover = { cell: Cell; x: number; y: number };

const actionsOf = (d: ActivityDay) => d.shadow_attempts + d.lookups + d.vocab_saved;
const isActive = (d: ActivityDay | undefined) => !!d && (actionsOf(d) > 0 || d.watched_minutes > 0);

export function StatsActivity({ className, activity, scores, summary }: Props) {
  const [showTable, setShowTable] = useState(false);
  const [hover, setHover] = useState<Hover | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const byDay = useMemo(() => new Map((activity.data ?? []).map((d) => [d.day, d])), [activity.data]);

  const cells = useMemo(() => {
    const end = today();
    const start = addDays(end, -(WEEKS - 1) * 7 - weekday(end));
    const out: Cell[] = [];
    for (let day = start, i = 0; day <= end; day = addDays(day, 1), i++) {
      const stats = byDay.get(day);
      out.push({ day, col: Math.floor(i / 7), row: i % 7, actions: stats ? actionsOf(stats) : 0, stats });
    }
    return out;
  }, [byDay]);

  const max = Math.max(1, ...cells.map((c) => c.actions));
  const level = (c: Cell) => (c.actions > 0 ? Math.min(4, Math.ceil((c.actions / max) * 4)) : isActive(c.stats) ? 1 : 0);

  // Label a column when its first day starts a new month; drop a label that would collide with the next one.
  const months = cells.filter((c) => c.row === 0)
    .filter((c, i, cols) => i === 0 || c.day.slice(0, 7) !== cols[i - 1].day.slice(0, 7))
    .filter((c, i, labels) => i === labels.length - 1 || labels[i + 1].col - c.col >= 3);

  const totals = useMemo(() => {
    let streak = 0;
    // A streak counts back from today; an inactive today doesn't break yesterday's streak yet.
    for (let day = isActive(byDay.get(today())) ? today() : addDays(today(), -1); isActive(byDay.get(day)); day = addDays(day, -1)) streak++;
    const scored = (scores.data ?? []).reduce((acc, p) => ({ sum: acc.sum + p.avg_score * p.attempts, n: acc.n + p.attempts }), { sum: 0, n: 0 });
    return { avgScore: scored.n ? scored.sum / scored.n : null, streak };
  }, [scores.data, byDay]);

  // [label, value, unit]; per-day attempts, lookups, and minutes live in the heatmap tooltip and table.
  const stats: [string, string, string?][] = [
    ['Words learned', summary.data ? String(summary.data.mastery.mastered) : '–'],
    ['Avg score', totals.avgScore === null ? '–' : `${Math.round(totals.avgScore * 100)}%`],
    ['Streak', String(totals.streak), totals.streak === 1 ? 'day' : 'days'],
  ];

  const showTooltip = (cell: Cell) => (event: MouseEvent<SVGRectElement> | FocusEvent<SVGRectElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const card = cardRef.current!.getBoundingClientRect();
    setHover({ cell, x: box.left + box.width / 2 - card.left, y: box.top - card.top });
  };

  const width = WEEKS * STEP;
  const height = TOP + 7 * STEP;
  const activeDays = (activity.data ?? []).filter(isActive).reverse();

  return (
    <Card
      className={className}
      title="Your Stats and Activity"
      status={activity.status}
      action={<button className="link-button" type="button" onClick={() => setShowTable((v) => !v)}>{showTable ? 'Show chart' : 'See All'}</button>}
    >
      <div ref={cardRef} style={{ position: 'relative' }}>
        <div className="stats-layout">
          <ul className="stat-list" aria-label={`Totals for the last ${WEEKS} weeks`}>
            {stats.map(([label, value, unit]) => (
              <li key={label}>
                <span className="stat-label">{label}</span>
                <span className="stat-value">{value}{unit && <span className="stat-unit"> {unit}</span>}</span>
              </li>
            ))}
          </ul>

          {showTable ? (
            <div className="table-scroll">
              {activeDays.length === 0 ? <p className="empty">No activity yet. Watch a video with the extension to get started.</p> : (
                <table className="data-table">
                  <thead><tr><th>Day</th><th>Attempts</th><th>Lookups</th><th>Saved</th><th>Minutes</th></tr></thead>
                  <tbody>
                    {activeDays.map((d) => (
                      <tr key={d.day}>
                        <td>{formatDay(d.day, { weekday: 'short', month: 'short', day: 'numeric' })}</td>
                        <td>{d.shadow_attempts}</td><td>{d.lookups}</td><td>{d.vocab_saved}</td><td>{d.watched_minutes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ) : (
            <div className="heatmap">
              <svg viewBox={`0 0 ${width} ${height}`} style={{ maxWidth: width }} role="img" aria-label={`Daily activity over the last ${WEEKS} weeks. Use See All for a table.`}>
                {months.map((c) => (
                  <text key={c.day} className="axis-text" x={c.col * STEP} y={10}>{c.day.slice(5, 7)}</text>
                ))}
                {cells.map((c) => (
                  <rect
                    key={c.day}
                    className={level(c) === 0 ? 'heat-empty' : undefined}
                    x={c.col * STEP}
                    y={TOP + c.row * STEP}
                    width={CELL}
                    height={CELL}
                    rx={2}
                    fill={LEVELS[level(c)]}
                    tabIndex={0}
                    aria-label={`${formatDay(c.day)}: ${c.actions} actions, ${c.stats?.watched_minutes ?? 0} minutes watched`}
                    onMouseEnter={showTooltip(c)}
                    onFocus={showTooltip(c)}
                    onMouseLeave={() => setHover(null)}
                    onBlur={() => setHover(null)}
                  />
                ))}
              </svg>
              <div className="heat-legend" aria-hidden="true">
                Less {LEVELS.map((color) => <i key={color} style={{ background: color }} />)} More
              </div>
            </div>
          )}
        </div>

        {hover && !showTable && (
          <div className="tooltip" style={{ left: hover.x, top: hover.y }}>
            <strong>{formatDay(hover.cell.day, { weekday: 'short', month: 'short', day: 'numeric' })}</strong>
            {hover.cell.stats ? (
              <>
                {hover.cell.stats.shadow_attempts} attempts · {hover.cell.stats.lookups} lookups · {hover.cell.stats.vocab_saved} saved
                <br />
                {hover.cell.stats.watched_minutes} minutes watched
              </>
            ) : 'No activity'}
          </div>
        )}
      </div>
    </Card>
  );
}
