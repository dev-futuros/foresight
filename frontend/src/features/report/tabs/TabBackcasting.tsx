import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ResultData } from '../ReportContent';

/**
 * Backcasting tab — one panel per scenario with a vision, a timeline of
 * milestones from now to horizon, and the immediate next move. The user
 * picks a scenario via the top selector; only one panel is visible at a time
 * to keep the timeline readable.
 */
export default function TabBackcasting({ result }: { result: ResultData }) {
  const { t } = useTranslation();
  const panels = result.backcasting?.panels ?? [];
  const [activeIdx, setActiveIdx] = useState(0);

  if (panels.length === 0) {
    return <p className="empty-state">{t('report.results.empty')}</p>;
  }

  const active = panels[Math.min(activeIdx, panels.length - 1)];

  return (
    <div className="bc-tab">
      <p className="bc-intro-txt">{t('report.results.bc.intro')}</p>

      <div className="bc-selector" role="tablist">
        {panels.map((p, i) => (
          <button
            key={p.scenarioType}
            type="button"
            role="tab"
            className={`bc-tab-btn${i === activeIdx ? ' active' : ''}`}
            aria-selected={i === activeIdx}
            onClick={() => setActiveIdx(i)}
          >
            {p.scenarioType}
          </button>
        ))}
      </div>

      <div className="bc-panel active">
        <div className="bc-vision">
          <div className="bc-vision-stripe" aria-hidden />
          <div className="bc-vision-label">{t('report.results.bc.vision')}</div>
          <p className="bc-vision-text">{active.vision}</p>
        </div>

        {active.milestones && active.milestones.length > 0 && (
          <div className="bc-timeline">
            {active.milestones.map((m, i) => (
              <div key={i} className="bc-milestone">
                <div className="bc-m-time">{m.timeframe}</div>
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

        {active.now && (
          <div className="bc-now">
            <div className="bc-now-label">{t('report.results.bc.now')}</div>
            <p className="bc-now-text">{active.now}</p>
          </div>
        )}
      </div>
    </div>
  );
}
