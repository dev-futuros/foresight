import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { StrategicPriority } from '../../../types/api';
import type { ResultData } from '../ReportContent';

type Horizon = 'H1' | 'H2' | 'H3';
const HORIZONS: Horizon[] = ['H1', 'H2', 'H3'];

/**
 * Mapa estratégico tab — port of the demo's tab-str content with
 * collapsible horizon bands. H1 is open by default (the most actionable
 * near-term priorities); H2 and H3 start collapsed so the page lands
 * scannable. Each band header carries a chevron + a "N priorities"
 * count badge so the user can see scope at a glance without opening it.
 */
export default function TabStrategicMap({ result }: { result: ResultData }) {
  const { t } = useTranslation();
  const priorities = result.strategicMap ?? [];
  // H1 defaults open. H2 / H3 start collapsed so the page loads compact.
  // Selection persists for the lifetime of the tab mount — a user who
  // opens H3 then switches tabs and back gets a fresh default.
  const [openBands, setOpenBands] = useState<Record<Horizon, boolean>>({
    H1: true,
    H2: false,
    H3: false,
  });

  if (priorities.length === 0) {
    return <p className="empty-state">{t('report.results.empty')}</p>;
  }

  const byHorizon = groupByHorizon(priorities);

  return (
    <>
      {HORIZONS.map((h) => {
        const items = byHorizon[h];
        if (items.length === 0) return null;
        const open = openBands[h];
        const timeframe = items[0]?.timeframe ?? '';
        return (
          <section key={h} className={`horizon-section${open ? ' open' : ''}`}>
            <button
              type="button"
              className="horizon-label"
              onClick={() => setOpenBands((prev) => ({ ...prev, [h]: !prev[h] }))}
              aria-expanded={open}
              aria-controls={`horizon-body-${h}`}
            >
              <span className={`h-badge ${h.toLowerCase()}`}>{h}</span>
              <span className="horizon-label-text">
                {t(`report.results.str.${h.toLowerCase()}` as const)}
              </span>
              {timeframe && <span className="h-time">{timeframe}</span>}
              <span className="horizon-count">
                {t('report.results.str.priorityCount', { count: items.length })}
              </span>
              <svg
                className={`horizon-chevron${open ? ' horizon-chevron--up' : ''}`}
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.6}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M3 4.5 L6 7.5 L9 4.5" />
              </svg>
            </button>
            {open && (
              <div className="horizon-body" id={`horizon-body-${h}`}>
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
              </div>
            )}
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
