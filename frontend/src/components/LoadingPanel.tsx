import { useStopwatch } from '../hooks/useStopwatch';

export type ProgressItemStatus = 'pending' | 'running' | 'done';

export interface ProgressItem {
  key: string;
  label: string;
  status: ProgressItemStatus;
  /** Optional token count to display next to the label (matches the demo's
   *  `prog-tokens` slot). When the loader is driven by simulated timing
   *  rather than real backend events, leave undefined. */
  tokens?: number;
}

interface Props {
  /** Italic serif headline shown above the stopwatch. */
  title: string;
  /** Drives the stopwatch (resets to 00:00 when this flips false → true). */
  running: boolean;
  /** Progress checklist. Pass [] to hide the list and show only the headline. */
  items?: ProgressItem[];
}

/**
 * Loading screen used by long AI-driven flows (Global STEEP, full analysis).
 *
 * Replaces the old spinner-only loading with the demo's stopwatch + checklist
 * pattern: each `item` represents a sub-section of the overall job and toggles
 * between pending / running / done as the work progresses. The MM:SS clock
 * ticks for as long as `running` is true.
 */
export default function LoadingPanel({ title, running, items = [] }: Props) {
  const elapsed = useStopwatch(running);
  return (
    <div className="loading-wrap">
      <p className="loading-head">{title}</p>
      <div className="stopwatch" aria-live="polite">{elapsed}</div>
      {items.length > 0 && (
        <div className="progress-list">
          {items.map((it) => (
            <div key={it.key} className={`progress-item ${it.status}`}>
              <span className="progress-mark" aria-hidden>
                {it.status === 'done' ? '✓' : it.status === 'running' ? '◐' : '·'}
              </span>
              <span className="prog-label">{it.label}</span>
              {typeof it.tokens === 'number' && (
                <span className="prog-tokens">{it.tokens.toLocaleString()} tok</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
