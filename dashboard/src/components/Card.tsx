import type { ReactNode } from 'react';
import type { Status } from '../api.ts';

type Props = {
  title: string;
  className?: string;
  /** Data status; while loading (or failed with no data yet) the card shows that instead of its content. */
  status?: Status;
  action?: ReactNode;
  children: ReactNode;
};

export function Card({ title, className = '', status, action, children }: Props) {
  return (
    <section className={`section ${className}`} aria-label={title}>
      <div className="section-head">
        <h2 className="section-title">{title}</h2>
        {action}
      </div>
      <div className="card">
        {status === 'loading' ? <p className="empty">Loading…</p>
          : status === 'error' ? <p className="empty">Couldn't load this yet.</p>
          : children}
      </div>
    </section>
  );
}
