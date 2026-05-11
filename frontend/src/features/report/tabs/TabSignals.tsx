import { useTranslation } from 'react-i18next';
import type { ResultData } from '../ReportContent';

/**
 * Signals & wildcards tab — port of the demo's tab-sig content.
 *
 * <p>Weak signals render as a 2-column grid of `.sig-card`s — each with a
 * STEEP-coloured icon square + a stacked title / dimension label / desc.
 * Wildcards render below as a stack of purple-striped `.wild-item` rows
 * with a flag-prefixed title and description.
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
          <div className="signals-grid">
            {weak.map((s, i) => {
              const color = dimensionColor(s.dimension);
              const iconHref = dimensionIcon(s.dimension);
              return (
                <div key={i} className="sig-card">
                  <div
                    className="sig-icon"
                    style={{
                      // 22 in hex ≈ 13% alpha, so the icon tint matches the demo's `<color>22` swatch.
                      background: `${color}22`,
                      color,
                    }}
                  >
                    <svg fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                      <use href={iconHref} />
                    </svg>
                  </div>
                  <div>
                    <div className="sig-title">{s.title}</div>
                    <div className="sig-dim" style={{ color }}>{s.dimension}</div>
                    <div className="sig-desc">{s.description}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {wild.length > 0 && (
        <>
          <p className="section-label">{t('report.results.sig.wildcards')}</p>
          <div className="wild-list">
            {wild.map((w, i) => (
              <div key={i} className="wild-item">
                <div className="wild-title">{w.title}</div>
                <p className="wild-desc">{w.description}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </>
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
      // Light green — matches the demo's #86efac STEEP-env accent.
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
 * Map a STEEP dimension label to the matching IconSprite symbol id. Same
 * accept-both-languages contract as {@link dimensionColor}.
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
