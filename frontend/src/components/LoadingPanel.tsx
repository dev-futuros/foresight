import { useStopwatch } from '../hooks/useStopwatch';

export type ProgressItemStatus = 'pending' | 'running' | 'done' | 'error';

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
 * Mirrors the staging demo's stopwatch + checklist pattern 1:1: each item
 * row carries a circular indicator (filled when done, spinning ring when
 * running, dotted outline when pending, red when errored) plus a label.
 * The MM:SS clock ticks for as long as {@code running} is true.
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
              {/* prog-icon is a circular indicator: empty ring (pending),
                  spinning gold ring (running), filled gold circle (done),
                  filled red circle (error). Pure CSS — no glyph. */}
              <span className="prog-icon" aria-hidden />
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
