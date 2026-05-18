import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DrivingForce, ScenarioLogic, UncertaintyAxis } from '../../../lib/aiClient';
import type { ResultData } from '../ReportContent';
import ImpactMatrix from './ImpactMatrix';
import InfoTooltip from '../../../components/InfoTooltip';

/**
 * Scenario Planning tab.
 *
 * <p>Three progressive-disclosure blocks — driving forces, axes, and
 * scenario logics — each pair a compact selectable strip with a single
 * detail panel, so the whole tab stays scannable and fits without
 * runaway vertical growth.
 */
export default function TabScenarioPlanning({ result }: { result: ResultData }) {
  const { t } = useTranslation();
  const planning = result.scenarioPlanning;
  if (
    !planning ||
    (!planning.drivingForces?.length && !planning.axes?.length && !planning.scenarioLogics?.length)
  ) {
    return <p className="empty-state">{t('report.results.empty')}</p>;
  }

  return (
    <div className="sp-tab">
      {planning.intro && <p className="sp-intro">{planning.intro}</p>}

      {planning.drivingForces && planning.drivingForces.length > 0 && (
        <>
          <p className="section-label">{t('report.results.sp.forces')}</p>
          <DrivingForcesExplorer forces={planning.drivingForces} />
        </>
      )}

      {planning.axes && planning.axes.length > 0 && (
        <div className="axes-box">
          <div className="axes-title">{t('report.results.sp.axesTitle')}</div>
          <div className="axes-grid">
            {planning.axes.map((ax, i) => (
              <AxisCard key={i} axis={ax} />
            ))}
          </div>
        </div>
      )}

      {planning.drivingForces &&
        planning.drivingForces.length >= 2 &&
        planning.axes &&
        planning.axes.length >= 1 && (
          <ImpactMatrix forces={planning.drivingForces} axes={planning.axes} />
        )}

      {planning.scenarioLogics && planning.scenarioLogics.length > 0 && (
        <>
          <p className="section-label">{t('report.results.sp.logics')}</p>
          <ScenarioLogicsExplorer logics={planning.scenarioLogics} />
        </>
      )}
    </div>
  );
}

/**
 * Driving-forces explorer — ranked-row list on the left, detail panel
 * on the right. The list compacts the 4 forces into rank + title +
 * score-bar; clicking a row reveals the full description in the panel.
 * Keeps the section short instead of stacking 4 description blocks.
 */
function DrivingForcesExplorer({ forces }: { forces: DrivingForce[] }) {
  const { t } = useTranslation();
  const sorted = [...forces].sort((a, b) => a.rank - b.rank);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const safeIdx = Math.min(selectedIdx, sorted.length - 1);
  const selected = sorted[safeIdx];

  return (
    <div className="forces-explorer">
      <ol className="forces-list" role="tablist">
        {sorted.map((f, i) => {
          const score = clampScore(f.impactScore);
          const active = i === safeIdx;
          return (
            <li key={f.rank}>
              <button
                type="button"
                role="tab"
                aria-selected={active}
                className={`forces-row${active ? ' forces-row--active' : ''}`}
                onClick={() => setSelectedIdx(i)}
              >
                <span className="force-rank" aria-hidden>
                  #{f.rank}
                </span>
                <span className="forces-row-title">{f.title}</span>
                <span className="forces-row-meter" aria-hidden>
                  <span className="forces-row-bar-bg">
                    <span className="forces-row-bar-fill" style={{ width: `${score}%` }} />
                  </span>
                </span>
                <span className="forces-row-score">{score}%</span>
              </button>
            </li>
          );
        })}
      </ol>
      <div key={safeIdx} className="forces-detail">
        <div className="forces-detail-head">
          <span className="force-rank">#{selected.rank}</span>
          <h4 className="forces-detail-title">{selected.title}</h4>
          <span className="forces-detail-score">
            {clampScore(selected.impactScore)}%
            <InfoTooltip text={t('report.results.sp.impactScoreHint')} />
          </span>
        </div>
        <p className="forces-detail-desc">{selected.description}</p>
      </div>
    </div>
  );
}

/**
 * Single axis card — poles always visible, rationale tucked behind a
 * small inline toggle so the two axis cards stay compact side-by-side.
 */
function AxisCard({ axis }: { axis: UncertaintyAxis }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <div className="axis-card">
      <div className="axis-label">{axis.label}</div>
      <div className="axis-bar" aria-hidden />
      <div className="axis-pole-row">
        <span className="axis-pole-tag low">−</span>
        <span className="axis-pole">{axis.poleLow}</span>
      </div>
      <div className="axis-pole-row">
        <span className="axis-pole-tag high">+</span>
        <span className="axis-pole">{axis.poleHigh}</span>
      </div>
      {axis.rationale && (
        <>
          <button
            type="button"
            className={`axis-rationale-toggle${open ? ' axis-rationale-toggle--open' : ''}`}
            onClick={() => setOpen((p) => !p)}
            aria-expanded={open}
          >
            <span>{t('report.results.sp.rationale')}</span>
            <svg
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
          {open && <div className="axis-rationale">{axis.rationale}</div>}
        </>
      )}
    </div>
  );
}

/**
 * Scenario-logics explorer — comparison strip of 3 colour-coded
 * mini-cards on top, single detail panel below. Mirrors the Scenarios
 * tab pattern so picking and reading a scenario logic feels the same
 * across the report.
 */
function ScenarioLogicsExplorer({ logics }: { logics: ScenarioLogic[] }) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const safeIdx = Math.min(selectedIdx, logics.length - 1);
  const selected = logics[safeIdx];
  const accentClass = (i: number): string =>
    i % 3 === 0 ? 'sp-logic--green' : i % 3 === 1 ? 'sp-logic--blue' : 'sp-logic--orange';

  return (
    <div className="sp-logics-explorer">
      <div className="sp-logics-strip" role="tablist">
        {logics.map((sl, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={i === safeIdx}
            className={`sp-logic-card ${accentClass(i)}${i === safeIdx ? ' active' : ''}`}
            onClick={() => setSelectedIdx(i)}
          >
            <span className="sp-logic-stripe" aria-hidden />
            <span className="sp-logic-name">{sl.name}</span>
          </button>
        ))}
      </div>
      <article key={safeIdx} className={`sp-logic-detail ${accentClass(safeIdx)}`}>
        <span className="sp-logic-detail-stripe" aria-hidden />
        <h4 className="sp-logic-detail-name">{selected.name}</h4>
        <p className="sp-logic-detail-text">{selected.logic}</p>
      </article>
    </div>
  );
}

function clampScore(n: number | undefined): number {
  if (typeof n !== 'number' || Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return Math.round(n);
}
