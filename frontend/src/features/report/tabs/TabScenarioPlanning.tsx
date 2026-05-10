import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ResultData } from '../ReportContent';

/**
 * Scenario Planning tab — driving forces, the two critical-uncertainty axes,
 * an interactive impact matrix placing each force in a 2D space, and the
 * narrative logic per scenario.
 *
 * The matrix is rendered as a plain SVG so it scales without a charting
 * library. Hovering a dot reveals the force title in a floating tip.
 */
export default function TabScenarioPlanning({ result }: { result: ResultData }) {
  const { t } = useTranslation();
  const planning = result.scenarioPlanning;
  const [hovered, setHovered] = useState<{ x: number; y: number; text: string } | null>(null);

  if (
    !planning ||
    (!planning.forces?.length && !planning.axes?.length && !planning.narrativeLogics?.length)
  ) {
    return <p className="empty-state">{t('report.results.empty')}</p>;
  }

  const axisX = planning.axes?.[0];
  const axisY = planning.axes?.[1];

  return (
    <div className="sp-tab">
      <p className="sp-intro">{t('report.results.sp.intro')}</p>

      {planning.forces && planning.forces.length > 0 && (
        <>
          <p className="section-label">{t('report.results.sp.forces')}</p>
          <div className="forces-grid">
            {planning.forces.map((f, i) => (
              <div key={i} className="force-card">
                <div className="force-meta">
                  <span className={`force-pill force-pill--impact-${f.impact}`}>
                    {t(`report.results.sp.impact.${f.impact}`)}
                  </span>
                  <span className={`force-pill force-pill--unc-${f.uncertainty}`}>
                    {t(`report.results.sp.unc.${f.uncertainty}`)}
                  </span>
                </div>
                <h4 className="force-title">{f.title}</h4>
                <p className="force-desc">{f.description}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {axisX && axisY && (
        <div className="axes-box">
          <div className="axes-title">{t('report.results.sp.axesTitle')}</div>
          <div className="axes-grid">
            <div className="axis-row">
              <div className="axis-name">X · {axisX.name}</div>
              <div className="axis-poles">
                <span>← {axisX.negative}</span>
                <span>{axisX.positive} →</span>
              </div>
            </div>
            <div className="axis-row">
              <div className="axis-name">Y · {axisY.name}</div>
              <div className="axis-poles">
                <span>↓ {axisY.negative}</span>
                <span>{axisY.positive} ↑</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {planning.impactMatrix && planning.impactMatrix.length > 0 && axisX && axisY && (
        <>
          <p className="section-label">{t('report.results.sp.matrix')}</p>
          <div
            className="impact-matrix"
            onMouseLeave={() => setHovered(null)}
          >
            <svg viewBox="-1.1 -1.1 2.2 2.2" className="matrix-svg" aria-hidden>
              {/* Quadrant lines */}
              <line x1="-1" y1="0" x2="1" y2="0" className="matrix-axis" />
              <line x1="0" y1="-1" x2="0" y2="1" className="matrix-axis" />
              {/* Outer frame */}
              <rect x="-1" y="-1" width="2" height="2" fill="none" className="matrix-frame" />
              {/* Force dots — clamp to the [-1,1] range so a stray model output
                  can't push them off-canvas. y is flipped because SVG y grows
                  downward but our axis convention has positive y up. */}
              {planning.impactMatrix.map((cell, i) => {
                const x = clamp(cell.x);
                const y = -clamp(cell.y);
                return (
                  <g
                    key={i}
                    onMouseEnter={(e) => {
                      const rect = (
                        e.currentTarget.ownerSVGElement as SVGSVGElement
                      )?.getBoundingClientRect();
                      if (!rect) return;
                      const px = ((x + 1.1) / 2.2) * rect.width;
                      const py = ((y + 1.1) / 2.2) * rect.height;
                      setHovered({ x: px, y: py, text: cell.force });
                    }}
                  >
                    <circle cx={x} cy={y} r="0.05" className="matrix-dot" />
                  </g>
                );
              })}
            </svg>
            {hovered && (
              <div
                className="matrix-tip"
                style={{ left: `${hovered.x}px`, top: `${hovered.y}px` }}
              >
                {hovered.text}
              </div>
            )}
          </div>
          <div className="matrix-axis-labels">
            <span className="axis-label-x">{axisX.name}</span>
            <span className="axis-label-y">{axisY.name}</span>
          </div>
        </>
      )}

      {planning.narrativeLogics && planning.narrativeLogics.length > 0 && (
        <>
          <p className="section-label">{t('report.results.sp.logics')}</p>
          <div className="sp-scen-row">
            {planning.narrativeLogics.map((nl) => (
              <div key={nl.scenarioType} className="sp-scen-card">
                <div className="sp-scen-name">{nl.scenarioType}</div>
                <p className="sp-scen-logic">{nl.logic}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function clamp(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < -1) return -1;
  if (n > 1) return 1;
  return n;
}
