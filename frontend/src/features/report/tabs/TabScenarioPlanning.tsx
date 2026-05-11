import { useTranslation } from 'react-i18next';
import type { ResultData } from '../ReportContent';
import ImpactMatrix from './ImpactMatrix';

/**
 * Scenario Planning tab — port of the demo's tab-sp content.
 *
 * <p>Renders (in order):
 * <ul>
 *   <li>An intro paragraph from `scenarioPlanning.intro`</li>
 *   <li>The 4 ranked driving forces in a 2-column grid (rank badge,
 *       title, description, score bar + numeric score)</li>
 *   <li>The "Ejes de incertidumbre crítica" panel containing two axis
 *       cards (axis label, centred bar, low/high pole rows, rationale)</li>
 *   <li>The 4-quadrant Impact × Uncertainty matrix SVG (positions derived
 *       client-side from impactScore + the two axes — see
 *       {@link ImpactMatrix})</li>
 *   <li>The 3 colour-coded scenario-logic cards (green/blue/orange) at
 *       the bottom</li>
 * </ul>
 */
export default function TabScenarioPlanning({ result }: { result: ResultData }) {
  const { t } = useTranslation();
  const planning = result.scenarioPlanning;
  if (
    !planning ||
    (!planning.drivingForces?.length &&
      !planning.axes?.length &&
      !planning.scenarioLogics?.length)
  ) {
    return <p className="empty-state">{t('report.results.empty')}</p>;
  }

  return (
    <div className="sp-tab">
      {planning.intro && <p className="sp-intro">{planning.intro}</p>}

      {planning.drivingForces && planning.drivingForces.length > 0 && (
        <>
          <p className="section-label">{t('report.results.sp.forces')}</p>
          <div className="forces-grid">
            {planning.drivingForces.map((f) => (
              <div key={f.rank} className="force-card">
                <div className="force-head">
                  <span className="force-rank">#{f.rank}</span>
                  <span className="force-title">{f.title}</span>
                </div>
                <p className="force-desc">{f.description}</p>
                <div className="force-meter">
                  <div className="force-bar-bg">
                    <div
                      className="force-bar-fill"
                      style={{ width: `${clampScore(f.impactScore)}%` }}
                    />
                  </div>
                  <span className="force-score">{clampScore(f.impactScore)}/100</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {planning.axes && planning.axes.length > 0 && (
        <div className="axes-box">
          <div className="axes-title">{t('report.results.sp.axesTitle')}</div>
          <div className="axes-grid">
            {planning.axes.map((ax, i) => (
              <div key={i} className="axis-card">
                <div className="axis-label">{ax.label}</div>
                <div className="axis-bar" aria-hidden />
                <div className="axis-pole-row">
                  <span className="axis-pole-tag low">−</span>
                  <span className="axis-pole">{ax.poleLow}</span>
                </div>
                <div className="axis-pole-row">
                  <span className="axis-pole-tag high">+</span>
                  <span className="axis-pole">{ax.poleHigh}</span>
                </div>
                {ax.rationale && (
                  <div className="axis-rationale">{ax.rationale}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {planning.drivingForces && planning.drivingForces.length >= 2 &&
        planning.axes && planning.axes.length >= 1 && (
          <>
            <p className="section-label">{t('report.results.sp.matrix')}</p>
            <ImpactMatrix forces={planning.drivingForces} axes={planning.axes} />
          </>
        )}

      {planning.scenarioLogics && planning.scenarioLogics.length > 0 && (
        <>
          <p className="section-label">{t('report.results.sp.logics')}</p>
          <div className="sp-scen-row">
            {planning.scenarioLogics.map((sl, i) => (
              <div key={i} className="sp-scen-card">
                <div className="sp-scen-name">{sl.name}</div>
                <p className="sp-scen-logic">{sl.logic}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function clampScore(n: number | undefined): number {
  if (typeof n !== 'number' || Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return Math.round(n);
}
