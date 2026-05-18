import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BackcastingEntry } from '../../../types/api';
import type { ResultData } from '../ReportContent';

/**
 * Backcasting tab — horizontal milestone strip + slide-open detail panel.
 *
 * <p>Top: pill selector for the three 3P scenarios. Below: vision card
 * with a scenario-coloured stripe. Then a horizontal strip of milestone
 * cards (year + title), connected by a thin gold line. Clicking a card
 * selects it; the description + actions for the selected milestone slide
 * open into a single panel below the strip. Bottom: starting-point card.
 *
 * <p>This replaces the old vertical timeline — it surfaces all the years
 * at a glance and limits the visible prose to one milestone at a time,
 * which is the friendlier reading mode on a wide screen.
 */
export default function TabBackcasting({ result }: { result: ResultData }) {
  const { t } = useTranslation();
  const entries = result.backcasting ?? [];
  const [activeIdx, setActiveIdx] = useState(0);
  const [selectedMilestoneIdx, setSelectedMilestoneIdx] = useState(0);

  // Reset milestone selection alongside scenario switch so the detail
  // panel doesn't briefly read from the previous scenario. Wraps the
  // setter so the two state updates batch into a single render and we
  // avoid the "setState in effect" anti-pattern.
  const switchScenario = (i: number) => {
    setActiveIdx(i);
    setSelectedMilestoneIdx(0);
  };

  if (entries.length === 0) {
    return <p className="empty-state">{t('report.results.empty')}</p>;
  }

  const active = entries[Math.min(activeIdx, entries.length - 1)];
  const milestones = active.milestones ?? [];
  const selected = milestones[Math.min(selectedMilestoneIdx, milestones.length - 1)];

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
            onClick={() => switchScenario(i)}
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

      {milestones.length > 0 && (
        <>
          {/* Horizontal milestone strip — cards laid out in a flex row
              with a faint horizontal connector behind the dots so the
              reading direction is unambiguous. Scrolls horizontally
              when the row outgrows the viewport. */}
          <div className="bc-strip" role="tablist" aria-label={t('report.results.bc.intro')}>
            <div className="bc-strip-track" aria-hidden />
            {milestones.map((m, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={i === selectedMilestoneIdx}
                className={`bc-strip-card${i === selectedMilestoneIdx ? ' active' : ''}`}
                onClick={() => setSelectedMilestoneIdx(i)}
              >
                <span className="bc-strip-dot" aria-hidden />
                <span className="bc-strip-year">{m.year}</span>
                <span className="bc-strip-title">{m.title}</span>
              </button>
            ))}
          </div>

          {/* Detail panel — slides open with the selected milestone's
              description + actions. Keyed on selection so React mounts a
              fresh subtree per click, which restarts the slide-in
              animation cleanly. */}
          {selected && (
            <div className="bc-detail" key={`m-${activeIdx}-${selectedMilestoneIdx}`}>
              <div className="bc-detail-head">
                <span className="bc-m-time">{selected.year}</span>
                <span className="bc-m-title">{selected.title}</span>
              </div>
              <p className="bc-m-desc">{selected.description}</p>
              {selected.actions && selected.actions.length > 0 && (
                <ul className="bc-m-actions">
                  {selected.actions.map((a, j) => (
                    <li key={j} className="bc-action">
                      {a}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
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

function visionModifier(bc: BackcastingEntry): string {
  const tType = (bc.scenarioType ?? '').toLowerCase();
  if (tType === 'probable') return 'bc-vision--probable';
  if (tType === 'plausible') return 'bc-vision--plausible';
  if (tType === 'posible' || tType === 'possible') return 'bc-vision--possible';
  return '';
}
