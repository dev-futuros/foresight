import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { useStopwatch } from '../hooks/useStopwatch';

export type ProgressItemStatus = 'pending' | 'running' | 'done' | 'error';

/**
 * Per-row metric shown to the right of the label. Either or both fields
 * can be populated:
 *
 * <ul>
 *   <li>{@code sources} — unique URLs the model has consulted so far
 *       (rows backed by web_search).</li>
 *   <li>{@code chars} — accumulated character count from streamed text
 *       deltas (any row whose backing call streams generation).</li>
 * </ul>
 *
 * <p>When both are present, the row shows them as "~N sources · ~M chars".
 * This is the natural fit for web_search rows: while Anthropic is
 * mid-search the sources counter ticks, then once the model starts
 * writing the row keeps signalling life via the chars counter instead
 * of "freezing" on its source total.
 */
export interface ProgressMetric {
  sources?: number;
  chars?: number;
}

export interface ProgressItem {
  key: string;
  label: string;
  status: ProgressItemStatus;
  /** Live metric — typically updated from a streaming progress callback. */
  metric?: ProgressMetric;
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
 * running, dotted outline when pending, red when errored) plus a label and
 * an optional live metric (sources consulted and/or characters streamed).
 * The MM:SS clock ticks for as long as {@code running} is true.
 */
export default function LoadingPanel({ title, running, items = [] }: Props) {
  const { t } = useTranslation();
  const elapsed = useStopwatch(running);
  return (
    <div className="loading-wrap">
      <p className="loading-head">{title}</p>
      <div className="stopwatch" aria-live="polite">
        {elapsed}
      </div>
      {items.length > 0 && (
        <div className="progress-list">
          {items.map((it) => (
            <div key={it.key} className={`progress-item ${it.status}`}>
              {/* prog-icon is a circular indicator: empty ring (pending),
                  spinning gold ring (running), filled gold circle (done),
                  filled red circle (error). Pure CSS — no glyph. */}
              <span className="prog-icon" aria-hidden />
              <span className="prog-label">{it.label}</span>
              {it.metric && <span className="prog-tokens">{renderMetric(it.metric, t)}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Renders the metric slot. Returns the joined "~N sources · ~M chars"
 * when both counters are positive, a single counter when only one is
 * populated, or a non-breaking space placeholder otherwise — so the
 * slot keeps its reserved width (see {@code .prog-tokens} in
 * wizard.css) regardless of which counters are active.
 */
function renderMetric(metric: ProgressMetric, t: TFunction): string {
  const parts: string[] = [];
  if ((metric.sources ?? 0) > 0) {
    parts.push(t('loader.metric.sources', { count: metric.sources! }));
  }
  if ((metric.chars ?? 0) > 0) {
    parts.push(t('loader.metric.chars', { count: metric.chars! }));
  }
  // Non-breaking space keeps the reserved slot visible-but-empty until
  // at least one counter ticks above zero.
  if (parts.length === 0) return ' ';
  return parts.join(' · ');
}
