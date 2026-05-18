import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { WeakSignal, Wildcard } from '../../../types/api';
import type { ResultData } from '../ReportContent';

/**
 * Signals & wildcards tab.
 *
 * <p>Weak signals: dimension filter chips on top + a compact list of
 * signal rows (icon + title + dimension tag), with a single detail
 * panel showing the selected signal's description. Wildcards: same
 * list + detail explorer, purple-flagged.
 *
 * <p>Same single-select pattern as the other tabs (Scenarios, Summary
 * uncertainties, Driving forces). Keeps the page short and predictable
 * regardless of how many signals or wildcards the model returns.
 */
export default function TabSignals({ result }: { result: ResultData }) {
  const { t } = useTranslation();
  const weak = result.weakSignals ?? [];
  const wild = result.wildcards ?? [];

  if (weak.length === 0 && wild.length === 0) {
    return <p className="empty-state">{t('report.results.empty')}</p>;
  }

  return (
    <>
      {weak.length > 0 && (
        <>
          <p className="section-label">{t('report.results.sig.signals')}</p>
          <SignalsExplorer signals={weak} />
        </>
      )}

      {wild.length > 0 && (
        <>
          <p className="section-label">{t('report.results.sig.wildcards')}</p>
          <WildcardsExplorer items={wild} />
        </>
      )}
    </>
  );
}

/**
 * Weak-signals explorer. Filter chips at the top let the user narrow by
 * STEEP dimension; the list below is the filtered set; the detail panel
 * shows the full description of the currently-selected signal.
 *
 * <p>The "All" chip is always present and selected by default. Per-
 * dimension chips only appear for dimensions actually represented in
 * the data (no empty filters).
 */
function SignalsExplorer({ signals }: { signals: WeakSignal[] }) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<string>('__all__');
  const [selectedIdx, setSelectedIdx] = useState(0);

  // Build the chip list from the actual data so we don't show empty
  // filters. Preserve first-seen order so chips align with the list.
  const dimensions = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const s of signals) {
      const key = (s.dimension ?? '').trim();
      if (key && !seen.has(key)) {
        seen.add(key);
        out.push(key);
      }
    }
    return out;
  }, [signals]);

  const filtered = useMemo(() => {
    if (filter === '__all__') return signals;
    return signals.filter((s) => (s.dimension ?? '').trim() === filter);
  }, [filter, signals]);

  // When the filter changes the safe index resets to 0, but we don't
  // explicitly reset state — clamp on read so the UI stays in sync.
  const safeIdx = Math.min(selectedIdx, filtered.length - 1);
  const selected = filtered[safeIdx];

  function selectFilter(next: string) {
    setFilter(next);
    setSelectedIdx(0);
  }

  return (
    <div className="signals-explorer">
      {dimensions.length > 1 && (
        <div className="signals-filter" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={filter === '__all__'}
            className={`signals-chip${filter === '__all__' ? ' signals-chip--active' : ''}`}
            onClick={() => selectFilter('__all__')}
          >
            {t('common.all', { defaultValue: 'All' })}
            <span className="signals-chip-count">{signals.length}</span>
          </button>
          {dimensions.map((d) => {
            const count = signals.filter((s) => (s.dimension ?? '').trim() === d).length;
            const color = dimensionColor(d);
            const active = filter === d;
            return (
              <button
                key={d}
                type="button"
                role="tab"
                aria-selected={active}
                className={`signals-chip${active ? ' signals-chip--active' : ''}`}
                style={active ? { borderColor: color, color } : undefined}
                onClick={() => selectFilter(d)}
              >
                <span className="signals-chip-dot" style={{ background: color }} aria-hidden />
                {d}
                <span className="signals-chip-count">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      <ol className="signals-list" role="tablist">
        {filtered.map((s, i) => {
          const color = dimensionColor(s.dimension);
          const iconHref = dimensionIcon(s.dimension);
          const active = i === safeIdx;
          return (
            <li key={i}>
              <button
                type="button"
                role="tab"
                aria-selected={active}
                className={`signals-row${active ? ' signals-row--active' : ''}`}
                style={active ? { borderLeftColor: color } : undefined}
                onClick={() => setSelectedIdx(i)}
              >
                <span
                  className="signals-row-icon"
                  style={{ background: `${color}22`, color }}
                  aria-hidden
                >
                  <svg
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <use href={iconHref} />
                  </svg>
                </span>
                <span className="signals-row-title">{s.title}</span>
                <span className="signals-row-dim" style={{ color }}>
                  {s.dimension}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {selected && (
        <div key={`${filter}:${safeIdx}`} className="signals-detail">
          <div className="signals-detail-head">
            <span
              className="signals-detail-icon"
              style={{
                background: `${dimensionColor(selected.dimension)}22`,
                color: dimensionColor(selected.dimension),
              }}
              aria-hidden
            >
              <svg
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <use href={dimensionIcon(selected.dimension)} />
              </svg>
            </span>
            <div className="signals-detail-head-text">
              <h4 className="signals-detail-title">{selected.title}</h4>
              <div
                className="signals-detail-dim"
                style={{ color: dimensionColor(selected.dimension) }}
              >
                {selected.dimension}
              </div>
            </div>
          </div>
          <p className="signals-detail-desc">{selected.description}</p>
        </div>
      )}
    </div>
  );
}

/**
 * Wildcards explorer — purple-flagged compact list + single detail
 * panel below. Same explorer rhythm as the rest of the report.
 */
function WildcardsExplorer({ items }: { items: Wildcard[] }) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const safeIdx = Math.min(selectedIdx, items.length - 1);
  const selected = items[safeIdx];
  return (
    <div className="wild-explorer">
      <ol className="wild-list" role="tablist">
        {items.map((w, i) => {
          const active = i === safeIdx;
          return (
            <li key={i}>
              <button
                type="button"
                role="tab"
                aria-selected={active}
                className={`wild-row${active ? ' wild-row--active' : ''}`}
                onClick={() => setSelectedIdx(i)}
              >
                <span className="wild-row-flag" aria-hidden>
                  ⚑
                </span>
                <span className="wild-row-title">{w.title}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <div key={safeIdx} className="wild-detail">
        <div className="wild-detail-head">
          <span className="wild-detail-flag" aria-hidden>
            ⚑
          </span>
          <h4 className="wild-detail-title">{selected.title}</h4>
        </div>
        <p className="wild-detail-desc">{selected.description}</p>
      </div>
    </div>
  );
}

/**
 * Map a localized STEEP dimension label to the token colour used in the
 * design system. Accepts the EN + ES dimension names (the backend emits
 * whichever matches the response language).
 */
function dimensionColor(dim: string | undefined): string {
  switch ((dim ?? '').toLowerCase()) {
    case 'social':
      return 'var(--blue)';
    case 'tecnológico':
    case 'tecnologico':
    case 'technological':
      return 'var(--green)';
    case 'económico':
    case 'economico':
    case 'economic':
      return 'var(--gold)';
    case 'medioambiental':
    case 'environmental':
      return '#86efac';
    case 'político':
    case 'politico':
    case 'political':
      return 'var(--purple)';
    default:
      return 'var(--gold)';
  }
}

/**
 * Map a STEEP dimension label to the matching IconSprite symbol id.
 */
function dimensionIcon(dim: string | undefined): string {
  switch ((dim ?? '').toLowerCase()) {
    case 'social':
      return '#i-s';
    case 'tecnológico':
    case 'tecnologico':
    case 'technological':
      return '#i-t';
    case 'económico':
    case 'economico':
    case 'economic':
      return '#i-e';
    case 'medioambiental':
    case 'environmental':
      return '#i-env';
    case 'político':
    case 'politico':
    case 'political':
      return '#i-p';
    default:
      return '#i-globe';
  }
}
