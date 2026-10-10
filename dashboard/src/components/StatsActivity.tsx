import { useMemo, useRef, useState, type FocusEvent, type MouseEvent } from 'react';
import type { ActivityDay, Polled, ScoreDay, VocabWord } from '../api.ts';
import { addDays, formatDay, today, weekday } from '../dates.ts';
import { Card } from './Card.tsx';

const WEEKS = 26;
export const HEATMAP_DAYS = WEEKS * 7;

const CELL = 14;
const GAP = 3;
const STEP = CELL + GAP;
const LABEL_W = 28;
const TOP = 16;
const LEVELS = ['var(--heat-0)', 'var(--heat-1)', 'var(--heat-2)', 'var(--heat-3)', 'var(--heat-4)'];
const ROW_LABELS: Record<number, string> = { 1: 'Mon', 3: 'Wed', 5: 'Fri' };

type Props = {
  className?: string;
  activity: Polled<ActivityDay[]>;
  scores: Polled<ScoreDay[]>;
  vocab: Polled<VocabWord[]>;
};

type Cell = { day: string; col: number; row: number; actions: number; stats?: ActivityDay };
type Hover = { cell: Cell; x: number; y: number };

const actionsOf = (d: ActivityDay) => d.shadow_attempts + d.lookups + d.vocab_saved;
const isActive = (d: ActivityDay | undefined) => !!d && (actionsOf(d) > 0 || d.watched_minutes > 0);

export function StatsActivity({ className, activity, scores, vocab }: Props) {
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
    const days = activity.data ?? [];
    let streak = 0;
    // A streak counts back from today; an inactive today doesn't break yesterday's streak yet.
    for (let day = isActive(byDay.get(today())) ? today() : addDays(today(), -1); isActive(byDay.get(day)); day = addDays(day, -1)) streak++;
    const scored = (scores.data ?? []).reduce((acc, p) => ({ sum: acc.sum + p.avg_score * p.attempts, n: acc.n + p.attempts }), { sum: 0, n: 0 });
    return {
      attempts: days.reduce((n, d) => n + d.shadow_attempts, 0),
      lookups: days.reduce((n, d) => n + d.lookups, 0),
      minutes: days.reduce((n, d) => n + d.watched_minutes, 0),
      avgScore: scored.n ? scored.sum / scored.n : null,
      streak,
    };
  }, [activity.data, scores.data, byDay]);

  const words = vocab.data?.length;
  const stats: [string, string][] = [
    ['Words saved', words === undefined ? '–' : words >= 200 ? '200+' : String(words)],
    ['Avg score', totals.avgScore === null ? '–' : `${Math.round(totals.avgScore * 100)}%`],
    ['Day streak', `${totals.streak} ${totals.streak === 1 ? 'day' : 'days'}`],
    ['Practice attempts', String(totals.attempts)],
    ['Phrase lookups', String(totals.lookups)],
    ['Minutes watched', String(totals.minutes)],
  ];

  const showTooltip = (cell: Cell) => (event: MouseEvent<SVGRectElement> | FocusEvent<SVGRectElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const card = cardRef.current!.getBoundingClientRect();
    setHover({ cell, x: box.left + box.width / 2 - card.left, y: box.top - card.top });
  };

  const width = LABEL_W + WEEKS * STEP;
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
            {stats.map(([label, value]) => (
              <li key={label}><span className="stat-label">{label}</span><span className="stat-value">{value}</span></li>
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
              <svg width={width} height={height} role="img" aria-label={`Daily activity over the last ${WEEKS} weeks. Use See All for a table.`}>
                {months.map((c) => (
                  <text key={c.day} className="axis-text" x={LABEL_W + c.col * STEP} y={10}>{formatDay(c.day, { month: 'short' })}</text>
                ))}
                {Object.entries(ROW_LABELS).map(([row, label]) => (
                  <text key={row} className="axis-text" x={0} y={TOP + Number(row) * STEP + CELL - 2}>{label}</text>
                ))}
                {cells.map((c) => (
                  <rect
                    key={c.day}
                    x={LABEL_W + c.col * STEP}
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
