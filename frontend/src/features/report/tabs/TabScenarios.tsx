import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Scenario } from '../../../types/api';
import type { ResultData } from '../ReportContent';
import InfoTooltip from '../../../components/InfoTooltip';

/**
 * Escenarios 3P tab — explorer layout.
 *
 * <p>Top row: a compact comparison strip with all three scenarios as
 * mini-cards (stripe + type/probability + name + 2-line abstract).
 * Clicking a card selects it.
 *
 * <p>Below: a single wide detail panel showing the selected scenario in
 * a two-column layout — full description + first-move on the left, the
 * three action lists (opportunities / threats / success factors) stacked
 * on the right. Probability gets a small visual meter next to the
 * heading so the relative likelihood of the three reads at a glance.
 *
 * <p>This replaces the previous "three crowded cards side-by-side"
 * pattern: comparison and deep dive each get their own optimised view,
 * so scanning across scenarios and reading any one of them in full are
 * both first-class flows.
 */
export default function TabScenarios({ result }: { result: ResultData }) {
  const { t } = useTranslation();
  const scenarios = result.scenarios ?? [];
  const [selectedIdx, setSelectedIdx] = useState(0);
  if (scenarios.length === 0) return null;

  const selected = scenarios[Math.min(selectedIdx, scenarios.length - 1)];
  const opps = selected.opportunities ?? [];
  const threats = selected.threats ?? [];
  const success = selected.successFactors ?? [];

  return (
    <div className="scenarios-explorer">
      {/* Comparison strip — mini-cards for at-a-glance scan + selection */}
      <div className="scen-compare-row" role="tablist">
        {scenarios.map((s, i) => (
          <button
            key={s.type ?? i}
            type="button"
            role="tab"
            aria-selected={i === selectedIdx}
            className={`scen-compare-card ${scenarioModifier(s)}${
              i === selectedIdx ? ' active' : ''
            }`}
            onClick={() => setSelectedIdx(i)}
          >
            <div className="scen-compare-stripe" aria-hidden />
            <div className="scen-compare-meta">
              <span className="scen-compare-type">{s.type}</span>
              {s.probability && (
                <span
                  className="scen-compare-prob"
                  title={t('report.results.scen.probabilityHint')}
                >
                  {s.probability}
                </span>
              )}
            </div>
            <div className="scen-compare-name">{s.name ?? s.title}</div>
            <div className="scen-compare-abstract">{firstSentence(s.description)}</div>
          </button>
        ))}
      </div>

      {/* Detail panel for the currently-selected scenario. Keyed on
          selection so React remounts a fresh subtree per click,
          restarting the fade-in animation cleanly. */}
      <article key={selectedIdx} className={`scen-detail ${scenarioModifier(selected)}`}>
        <div className="scen-detail-stripe" aria-hidden />

        <header className="scen-detail-head">
          <div className="scen-detail-head-text">
            <span className="scen-detail-type">{selected.type}</span>
            <h2 className="scen-detail-name">{selected.name ?? selected.title}</h2>
          </div>
          {selected.probability && <ProbabilityMeter value={selected.probability} t={t} />}
        </header>

        <div className="scen-detail-body">
          <div className="scen-detail-left">
            <p className="scen-detail-desc">{selected.description}</p>

            {selected.firstMove && (
              <div className="scen-firstmove">
                <div className="scen-firstmove-label">{t('report.results.scen.firstmove')}</div>
                <div className="scen-firstmove-text">{selected.firstMove}</div>
              </div>
            )}
          </div>

          <aside className="scen-detail-right">
            <ActionList
              variant="opps"
              label={t('report.results.scen.opps')}
              items={opps}
              dotColor="var(--green)"
            />
            <ActionList
              variant="threats"
              label={t('report.results.scen.threats')}
              items={threats}
              dotColor="var(--red)"
            />
            <ActionList
              variant="success"
              label={t('report.results.scen.success')}
              items={success}
              dotColor="var(--gold)"
            />
          </aside>
        </div>
      </article>
    </div>
  );
}

/**
 * Small horizontal probability meter next to the scenario name. Parses
 * the percentage string ("72%", "21.5%") into a number — falls back to
 * 0 if the format is unexpected (the prompt pins it to "XX%" so this
 * should rarely fire, but the parser is defensive).
 */
function ProbabilityMeter({
  value,
  t,
}: {
  value: string;
  t: ReturnType<typeof useTranslation>['t'];
}) {
  const pct = clampPct(parsePercent(value));
  return (
    <div
      className="scen-detail-prob"
      aria-label={`${t('report.results.scen.probability')}: ${value}`}
    >
      <span className="scen-detail-prob-label">
        {t('report.results.scen.probability')}
        <InfoTooltip text={t('report.results.scen.probabilityHint')} />
      </span>
      <div className="scen-detail-prob-meter" aria-hidden>
        <div className="scen-detail-prob-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="scen-detail-prob-value">{value}</span>
    </div>
  );
}

function ActionList({
  variant,
  label,
  items,
  dotColor,
}: {
  variant: 'opps' | 'threats' | 'success';
  label: string;
  items: string[];
  dotColor: string;
}) {
  return (
    <div className={`scen-action-card scen-action-card--${variant}`}>
      <div className="scen-action-head">
        <span className="scen-action-dot" style={{ background: dotColor }} aria-hidden />
        <span className="scen-action-label">{label}</span>
        <span className="scen-action-count">{items.length}</span>
      </div>
      {items.length > 0 ? (
        <ul className="scen-action-list">
          {items.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ul>
      ) : (
        <p className="scen-action-empty">—</p>
      )}
    </div>
  );
}

/**
 * First-sentence preview for the comparison strip's abstract. Splits on
 * the first sentence terminator that looks like a real one (period
 * followed by space + capital, or a paragraph break). Falls back to
 * the first ~140 chars to avoid pathologically long abstracts.
 */
function firstSentence(text: string): string {
  if (!text) return '';
  // Paragraph break takes precedence — model uses \n\n for explicit splits.
  const para = text.indexOf('\n\n');
  if (para !== -1 && para < 200) return text.slice(0, para).trim();
  // Sentence boundary heuristic.
  const m = /^[\s\S]+?[.!?](?=\s+[A-ZÁÉÍÓÚÑ]|$)/.exec(text);
  if (m) return m[0].trim();
  return text.length > 140 ? text.slice(0, 140).trim() + '…' : text;
}

function parsePercent(s: string): number {
  const m = /-?\d+(?:[.,]\d+)?/.exec(s);
  if (!m) return 0;
  return Number(m[0].replace(',', '.'));
}
function clampPct(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

function scenarioModifier(s: Scenario): string {
  const t = (s.type ?? '').toLowerCase();
  if (t === 'probable') return 'scen-card--probable';
  if (t === 'plausible') return 'scen-card--plausible';
  if (t === 'posible' || t === 'possible') return 'scen-card--possible';
  return '';
}
