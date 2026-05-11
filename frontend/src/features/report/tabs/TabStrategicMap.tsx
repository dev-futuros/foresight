import { useTranslation } from 'react-i18next';
import type { StrategicPriority } from '../../../lib/aiClient';
import type { ResultData } from '../ReportContent';

type Horizon = 'H1' | 'H2' | 'H3';
const HORIZONS: Horizon[] = ['H1', 'H2', 'H3'];

/**
 * Mapa estratégico tab — port of the demo's tab-str content.
 *
 * <p>Renders one horizon band per H1 / H2 / H3, each with a coloured
 * `.h-badge` + horizon label + timeframe pill on the right, followed by
 * the stacked `.action-card`s for that horizon. Each action card carries
 * a title + impact tag and a list of concrete actions.
 *
 * <p>The backend produces 2 priorities per horizon (6 total) but the
 * renderer tolerates any subset gracefully — bands with no entries
 * simply don't appear.
 */
export default function TabStrategicMap({ result }: { result: ResultData }) {
  const { t } = useTranslation();
  const priorities = result.strategicMap ?? [];
  if (priorities.length === 0) {
    return <p className="empty-state">{t('report.results.empty')}</p>;
  }

  const byHorizon = groupByHorizon(priorities);

  return (
    <>
      {HORIZONS.map((h) => {
        const items = byHorizon[h];
        if (items.length === 0) return null;
        const timeframe = items[0]?.timeframe ?? '';
        return (
          <section key={h} className="horizon-section">
            <div className="horizon-label">
              <span className={`h-badge ${h.toLowerCase()}`}>{h}</span>
              <span className="horizon-label-text">
                {t(`report.results.str.${h.toLowerCase()}` as const)}
              </span>
              {timeframe && <span className="h-time">{timeframe}</span>}
            </div>
            {items.map((p, i) => (
              <article key={i} className="action-card">
                <div className="action-head">
                  <div className="action-title">{p.title}</div>
                  <span className={`impact-tag imp-${normalizeImpact(p.impact)}`}>
                    {t(`report.results.impact.${normalizeImpact(p.impact)}` as const, {
                      defaultValue: p.impact,
                    })}
                  </span>
                </div>
                {p.actions && p.actions.length > 0 && (
                  <ul className="action-list">
                    {p.actions.map((a, j) => (
                      <li key={j}>{a}</li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
          </section>
        );
      })}
    </>
  );
}

function groupByHorizon(list: StrategicPriority[]): Record<Horizon, StrategicPriority[]> {
  const buckets: Record<Horizon, StrategicPriority[]> = { H1: [], H2: [], H3: [] };
  for (const p of list) {
    // Tolerate "h1" / "H1" / "h-1" variants — the prompt fixes the format but
    // legacy reports or model drift could shift it.
    const h = (p.horizon ?? '').toUpperCase().replace(/[^H1-3]/g, '');
    if (h === 'H1' || h === 'H2' || h === 'H3') buckets[h].push(p);
  }
  return buckets;
}

function normalizeImpact(value: string): 'low' | 'medium' | 'high' {
  const v = (value ?? '').toLowerCase();
  if (v === 'high') return 'high';
  if (v === 'low') return 'low';
  return 'medium';
}
