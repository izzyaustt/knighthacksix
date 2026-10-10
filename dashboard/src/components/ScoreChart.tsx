import { useMemo, useState, type MouseEvent } from 'react';
import type { ScoreDay } from '../api.ts';
import { addDays, formatDay, today } from '../dates.ts';

export const SCORE_DAYS = 30;

const W = 600;
const H = 220;
const M = { left: 36, right: 44, top: 12, bottom: 24 };
const PLOT_W = W - M.left - M.right;
const PLOT_H = H - M.top - M.bottom;
const Y_TICKS = [0, 0.25, 0.5, 0.75, 1];

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function ScoreChart({ points }: { points: ScoreDay[] | undefined }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const end = today();
  const start = addDays(end, -(SCORE_DAYS - 1));
  const dayIndex = (day: string) => Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000);
  const x = (day: string) => M.left + (dayIndex(day) / (SCORE_DAYS - 1)) * PLOT_W;
  const y = (score: number) => M.top + (1 - score) * PLOT_H;

  const shown = useMemo(
    () => (points ?? []).filter((p) => p.day >= start && p.day <= end && p.attempts > 0).sort((a, b) => a.day.localeCompare(b.day)),
    [points, start, end],
  );

  if (shown.length === 0) {
    return <p className="empty">Record yourself practicing a phrase in the extension to see your score over time.</p>;
  }

  const line = shown.map((p, i) => `${i ? 'L' : 'M'}${x(p.day)},${y(p.avg_score)}`).join(' ');
  const area = `${line} L${x(shown.at(-1)!.day)},${y(0)} L${x(shown[0].day)},${y(0)} Z`;
  const last = shown.at(-1)!;
  const xTicks = [0, 7, 14, 21, 29].map((d) => addDays(start, d));
  const hovered = hoverIndex === null ? null : shown[hoverIndex];

  // Snap the crosshair to the nearest day that has a score.
  const onMove = (event: MouseEvent<SVGRectElement>) => {
    const box = event.currentTarget.ownerSVGElement!.getBoundingClientRect();
    const px = ((event.clientX - box.left) / box.width) * W;
    let best = 0;
    shown.forEach((p, i) => { if (Math.abs(x(p.day) - px) < Math.abs(x(shown[best].day) - px)) best = i; });
    setHoverIndex(best);
  };

  return (
    <div className="chart" style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Daily average intelligibility score, last ${SCORE_DAYS} days. Latest ${pct(last.avg_score)} on ${formatDay(last.day)}.`}>
        {Y_TICKS.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={M.left + PLOT_W} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
            <text className="axis-text" x={M.left - 6} y={y(t) + 3} textAnchor="end">{pct(t)}</text>
          </g>
        ))}
        {xTicks.map((d) => (
          <text key={d} className="axis-text" x={x(d)} y={H - 6} textAnchor="middle">{formatDay(d)}</text>
        ))}

        <path d={area} fill="var(--score-line)" opacity={0.1} />
        <path d={line} fill="none" stroke="var(--score-line)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {/* End marker and label: the latest value (also the only mark when there's a single day) */}
        <circle cx={x(last.day)} cy={y(last.avg_score)} r={4} fill="var(--score-line)" stroke="var(--surface)" strokeWidth={2} />
        <text x={x(last.day) + 8} y={y(last.avg_score) + 4} fontSize={12} fontWeight={700} fill="var(--ink)">{pct(last.avg_score)}</text>

        {hovered && (
          <g pointerEvents="none">
            <line x1={x(hovered.day)} x2={x(hovered.day)} y1={M.top} y2={M.top + PLOT_H} stroke="var(--ink-3)" strokeWidth={1} />
            <circle cx={x(hovered.day)} cy={y(hovered.avg_score)} r={5} fill="var(--score-line)" stroke="var(--surface)" strokeWidth={2} />
          </g>
        )}
        <rect x={M.left} y={M.top} width={PLOT_W} height={PLOT_H} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHoverIndex(null)} />
      </svg>

      {hovered && (
        <div className="tooltip" style={{ left: `${(x(hovered.day) / W) * 100}%`, top: `${(y(hovered.avg_score) / H) * 100}%` }}>
          <strong>{formatDay(hovered.day, { weekday: 'short', month: 'short', day: 'numeric' })}</strong>
          {pct(hovered.avg_score)} average · {hovered.attempts} {hovered.attempts === 1 ? 'attempt' : 'attempts'}
        </div>
      )}

      <p className="chart-note">
        Daily average of how much of each practiced phrase was recognized, last {SCORE_DAYS} days.
        {shown.length === 1 && ' Practice on more days to see a trend.'}
      </p>
    </div>
  );
}
