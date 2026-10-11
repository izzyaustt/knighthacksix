import { useState, type ReactNode } from 'react';
import type { Polled, Summary } from '../api.ts';

const hoursText = (h: number) => (h < 10 ? String(Math.round(h * 10) / 10) : String(Math.round(h)));

function Olive({ label, summary, children }: { label: string; summary: Polled<Summary>; children: (s: Summary) => ReactNode }) {
  return (
    <section className="olive-card" aria-label={label}>
      <div className="olive-label">{label}</div>
      {summary.data ? children(summary.data)
        : <p className="olive-empty">{summary.status === 'loading' ? 'Loading…' : "Couldn't load this yet."}</p>}
    </section>
  );
}

export function ImmersionHours({ summary }: { summary: Polled<Summary> }) {
  return (
    <Olive label="Immersion Hours" summary={summary}>
      {({ immersion: { hours, goal_hours } }) => (
        <>
          <div className="olive-value">{hoursText(hours)} out of {goal_hours}</div>
          <div className="progress" role="progressbar" aria-label="Immersion hours" aria-valuemin={0} aria-valuemax={goal_hours} aria-valuenow={Math.min(goal_hours, Math.round(hours * 10) / 10)}>
            <div style={{ width: `${Math.min(100, (hours / goal_hours) * 100)}%` }} />
          </div>
        </>
      )}
    </Olive>
  );
}

const R = 62;
const STROKE = 20;
const SIZE = (R + STROKE / 2) * 2;
const CIRCUMFERENCE = 2 * Math.PI * R;
const GAP = 2; // surface gap between the two arcs

export function MasteryLevels({ summary }: { summary: Polled<Summary> }) {
  const [hover, setHover] = useState<string | null>(null);
  return (
    <Olive label="Mastery Levels" summary={summary}>
      {({ mastery }) => {
        const parts = [
          { name: 'Learning', count: mastery.learning, color: 'var(--donut-learning)' },
          { name: 'Mastered', count: mastery.mastered, color: 'var(--donut-mastered)' },
        ];
        const shown = parts.filter((p) => p.count > 0);
        let offset = 0;
        return (
          <div className="mastery">
            <div className="olive-value">{mastery.total} {mastery.total === 1 ? 'Word' : 'Words'} Total</div>
            <div className="donut">
              <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img"
                aria-label={`${mastery.total} saved words: ${mastery.learning} learning, ${mastery.mastered} mastered`}>
                <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="var(--olive-track)" strokeWidth={STROKE} />
                {shown.map((p) => {
                  const length = (p.count / mastery.total) * CIRCUMFERENCE;
                  const gap = shown.length > 1 ? GAP : 0;
                  const arc = (
                    <circle key={p.name} cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke={p.color} strokeWidth={STROKE}
                      strokeDasharray={`${Math.max(0, length - gap)} ${CIRCUMFERENCE}`} strokeDashoffset={-offset}
                      transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
                      onMouseEnter={() => setHover(`${p.name}: ${p.count} of ${mastery.total} (${Math.round((p.count / mastery.total) * 100)}%)`)}
                      onMouseLeave={() => setHover(null)} />
                  );
                  offset += length;
                  return arc;
                })}
                <text className="donut-total" x={SIZE / 2} y={SIZE / 2} textAnchor="middle" dominantBaseline="central">{mastery.total}</text>
              </svg>
              {hover && <div className="tooltip" style={{ left: '50%', top: 0 }}>{hover}</div>}
            </div>
            <ul className="donut-legend">
              {parts.map((p) => (
                <li key={p.name}><i style={{ background: p.color }} />{p.name} <strong>{p.count}</strong></li>
              ))}
            </ul>
          </div>
        );
      }}
    </Olive>
  );
}
