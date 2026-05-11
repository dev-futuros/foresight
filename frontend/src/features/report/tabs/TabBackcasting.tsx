import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BackcastingEntry } from '../../../lib/aiClient';
import type { ResultData } from '../ReportContent';

/**
 * Backcasting tab — port of the demo's tab-bc content.
 *
 * <p>Top-row pill selector switches between the three scenarios. Each
 * panel shows the vision statement at the top (with a scenario-coloured
 * stripe), then the milestone timeline (gold dot + connecting line),
 * then the "starting point" card describing today's situation.
 */
export default function TabBackcasting({ result }: { result: ResultData }) {
  const { t } = useTranslation();
  const entries = result.backcasting ?? [];
  const [activeIdx, setActiveIdx] = useState(0);

  if (entries.length === 0) {
    return <p className="empty-state">{t('report.results.empty')}</p>;
  }

  const active = entries[Math.min(activeIdx, entries.length - 1)];

  return (
    <div className="bc-tab">
      <p className="bc-intro-txt">{t('report.results.bc.intro')}</p>

      <div className="bc-selector" role="tablist">
        {entries.map((p, i) => (
          <button
            key={`${p.scenarioType}-${i}`}
            type="button"
            role="tab"
            className={`bc-tab-btn${i === activeIdx ? ' active' : ''}`}
            aria-selected={i === activeIdx}
            onClick={() => setActiveIdx(i)}
          >
            {p.scenarioType}: {p.scenarioName}
          </button>
        ))}
      </div>

      <div className={`bc-vision ${visionModifier(active)}`}>
        <div className="bc-vision-stripe" aria-hidden />
        <div className="bc-vision-label">
          {t('report.results.bc.vision')} {active.scenarioType}
        </div>
        <p className="bc-vision-text">{active.visionStatement}</p>
      </div>

      {active.milestones && active.milestones.length > 0 && (
        <div className="bc-timeline">
          {active.milestones.map((m, i) => (
            <div key={i} className="bc-milestone">
              <div className="bc-m-time">{m.year}</div>
              <div className="bc-m-title">{m.title}</div>
              <p className="bc-m-desc">{m.description}</p>
              {m.actions && m.actions.length > 0 && (
                <ul className="bc-m-actions">
                  {m.actions.map((a, j) => (
                    <li key={j} className="bc-action">{a}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {active.startingPoint && (
        <div className="bc-now">
          <div className="bc-now-label">{t('report.results.bc.start')}</div>
          <p className="bc-now-text">{active.startingPoint}</p>
        </div>
      )}
    </div>
  );
}

/**
 * Map a backcasting entry to the `bc-vision--*` modifier that colours the
 * top stripe according to scenario type (green / blue / orange). Falls
 * back to the default gold stripe when the type token doesn't match.
 */
function visionModifier(bc: BackcastingEntry): string {
  const tType = (bc.scenarioType ?? '').toLowerCase();
  if (tType === 'probable') return 'bc-vision--probable';
  if (tType === 'plausible') return 'bc-vision--plausible';
  if (tType === 'posible' || tType === 'possible') return 'bc-vision--possible';
  return '';
}
