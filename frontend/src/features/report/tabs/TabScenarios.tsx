import { useTranslation } from 'react-i18next';
import type { Scenario } from '../../../lib/aiClient';
import type { ResultData } from '../ReportContent';

/**
 * Escenarios 3P tab — the full prototype card for each 3P scenario:
 * coloured stripe, type badge, evocative name, probability pill,
 * narrative description (which may break into two paragraphs via `\n\n`),
 * coloured opportunity / threat / success-factor lists, and the
 * gold-bg "primer movimiento" footer.
 *
 * <p>The 11-row subgrid declared in `report.css#scenarios-grid` keeps the
 * same section aligned horizontally across all three cards regardless of
 * content length, so the visual rhythm of the demo is preserved even
 * when the model produces uneven content.
 */
export default function TabScenarios({ result }: { result: ResultData }) {
  const { t } = useTranslation();
  const scenarios = result.scenarios ?? [];
  if (scenarios.length === 0) return null;

  return (
    <div className="scenarios-grid">
      {scenarios.map((s, i) => (
        <article key={s.type ?? i} className={`scen-card ${scenarioModifier(s)}`}>
          <div className="scen-stripe" aria-hidden />
          <div className="scen-type-badge">{s.type}</div>
          <h3 className="scen-name">{s.name ?? s.title}</h3>
          {s.probability ? (
            <div className="prob-pill">P: {s.probability}</div>
          ) : (
            <div className="prob-pill" aria-hidden />
          )}
          <p className="scen-desc">{s.description}</p>

          <div className="scen-section-label">{t('report.results.scen.opps')}</div>
          <div className="scen-items">
            {(s.opportunities ?? []).map((o, j) => (
              <div key={j} className="scen-item">
                <div className="scen-dot" style={{ background: 'var(--green)' }} />
                <span>{o}</span>
              </div>
            ))}
          </div>

          <div className="scen-section-label">{t('report.results.scen.threats')}</div>
          <div className="scen-items">
            {(s.threats ?? []).map((th, j) => (
              <div key={j} className="scen-item">
                <div className="scen-dot" style={{ background: 'var(--red)' }} />
                <span>{th}</span>
              </div>
            ))}
          </div>

          <div className="scen-section-label">{t('report.results.scen.success')}</div>
          <div className="scen-items">
            {(s.successFactors ?? []).map((f, j) => (
              <div key={j} className="scen-item">
                <div className="scen-dot" style={{ background: 'var(--gold)' }} />
                <span>{f}</span>
              </div>
            ))}
          </div>

          <div className="scen-firstmove">
            <div className="scen-firstmove-label">{t('report.results.scen.firstmove')}</div>
            <div className="scen-firstmove-text">{s.firstMove ?? '—'}</div>
          </div>
        </article>
      ))}
    </div>
  );
}

/**
 * Maps a scenario's `type` token to the matching `scen-card--*` modifier so
 * the coloured stripe + badge follow the scenario semantically (rather than
 * by ordinal position). Falls back to no modifier if the type doesn't
 * match a known token — the nth-child fallback in CSS still colour-codes
 * by position.
 */
function scenarioModifier(s: Scenario): string {
  const t = (s.type ?? '').toLowerCase();
  if (t === 'probable') return 'scen-card--probable';
  if (t === 'plausible') return 'scen-card--plausible';
  // Demo Spanish uses "Posible" (one 's'); English uses "Possible".
  if (t === 'posible' || t === 'possible') return 'scen-card--possible';
  return '';
}
