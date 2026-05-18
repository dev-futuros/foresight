import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { GlobalSteepDimension, KeyUncertainty } from '../../../types/api';
import type { InputProjection, ResultData } from '../ReportContent';

/**
 * Summary tab ("Resumen") — hero panel + STEEP echo.
 *
 * <p>Hero panel mirrors the Scenarios explorer detail panel: a wide
 * panel with a gold top stripe and a two-column body — executive
 * summary as the lead narrative on the left, key uncertainties as a
 * numbered card list on the right.
 *
 * <p>The two columns auto-collapse: with only one side present (exec
 * but no uncertainties, or vice versa), the body switches to a single
 * full-width column. When neither is present the hero is suppressed
 * entirely and only the STEEP echo (if any) renders.
 *
 * <p>3P scenarios are NOT duplicated on this tab — they live on their
 * own (TabScenarios), matching the prototype's `#tab-res` content split.
 */
export default function TabSummary({
  result,
  input,
}: {
  result: ResultData;
  input?: InputProjection;
}) {
  const { t } = useTranslation();
  const exec = result.executiveSummary?.trim();
  const uncertainties = result.keyUncertainties ?? [];
  const hasExec = !!exec;
  const hasUnc = uncertainties.length > 0;
  const hasSteep = hasAnySteepValue(input);

  // Split exec into paragraphs on \n\n so we render proper <p> tags
  // (better typography control than one pre-line block) — the model
  // emits \n\n for explicit paragraph breaks per the analyze-summary
  // prompt. Fallback to a single paragraph if no breaks present.
  const execParagraphs = exec
    ? exec
        .split(/\n\n+/)
        .map((p) => p.trim())
        .filter(Boolean)
    : [];

  return (
    <>
      {(hasExec || hasUnc) && (
        <article className="summary-hero">
          <div className="summary-hero-stripe" aria-hidden />
          <div
            className={`summary-hero-body${
              !hasExec || !hasUnc ? ' summary-hero-body--single' : ''
            }`}
          >
            {hasExec && (
              <div className="summary-hero-left">
                <div className="summary-hero-eyebrow">{t('report.results.summary.execTitle')}</div>
                <div className="summary-exec">
                  {execParagraphs.map((p, i) => (
                    <p
                      key={i}
                      className={`summary-exec-para${i === 0 ? ' summary-exec-para--lead' : ''}`}
                    >
                      {p}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {hasUnc && (
              <aside className="summary-hero-right">
                <div className="summary-unc-head">
                  <span className="summary-unc-title">{t('report.results.uncertainties')}</span>
                  <span className="summary-unc-count">{uncertainties.length}</span>
                </div>
                <UncertaintyExplorer items={uncertainties} />
              </aside>
            )}
          </div>
        </article>
      )}

      {hasSteep && <SteepEcho input={input!} />}
    </>
  );
}

/**
 * Key-uncertainty explorer — single-selected pattern.
 *
 * <p>The right column has two parts: a tight stack of clickable name
 * rows (one selected) and a fixed-bounds detail panel below showing the
 * selected uncertainty's description. This keeps the column at a
 * predictable height regardless of how many uncertainties or how long
 * any single description is, so the STEEP echo stays anchored just
 * below the hero. Mirrors the Scenarios tab's comparison-strip +
 * detail-panel pattern for internal consistency.
 */
function UncertaintyExplorer({ items }: { items: KeyUncertainty[] }) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const safeIdx = Math.min(selectedIdx, items.length - 1);
  const selected = items[safeIdx];
  return (
    <div className="summary-unc-explorer">
      <ol className="summary-unc-list" role="tablist">
        {items.map((u, i) => (
          <li key={i}>
            <button
              type="button"
              role="tab"
              aria-selected={i === safeIdx}
              className={`summary-unc-row${i === safeIdx ? ' summary-unc-row--active' : ''}`}
              onClick={() => setSelectedIdx(i)}
            >
              <span className="summary-unc-idx" aria-hidden>
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="summary-unc-name">{u.name}</span>
            </button>
          </li>
        ))}
      </ol>
      <div key={safeIdx} className="summary-unc-detail">
        <h4 className="summary-unc-detail-title">{selected.name}</h4>
        <p className="summary-unc-desc">{selected.description}</p>
      </div>
    </div>
  );
}

/**
 * STEEP echo — five collapsible per-dimension sections. Each row
 * collapses to a single icon + name + chevron line by default; click
 * to slide open the global + sectorial cells side-by-side. Mirrors
 * the strategic-map collapsible band pattern so all the page's
 * progressive-disclosure controls feel consistent.
 *
 * <p>"Expand all / Collapse all" toggle in the section header lets the
 * user flip the whole stack in one click — useful when reviewing the
 * full STEEP input verbatim before re-reading the analysis.
 */
function SteepEcho({ input }: { input: InputProjection }) {
  const { t } = useTranslation();
  const g = input.globalSteep ?? {};
  const s = input.sectorialSteep ?? {};
  const dims: GlobalSteepDimension[] = ['S', 'T', 'E', 'ENV', 'P'];
  const [openDims, setOpenDims] = useState<Record<GlobalSteepDimension, boolean>>({
    S: true,
    T: false,
    E: false,
    ENV: false,
    P: false,
  });
  const allOpen = dims.every((k) => openDims[k]);

  function toggleAll() {
    const next = !allOpen;
    setOpenDims({ S: next, T: next, E: next, ENV: next, P: next });
  }

  return (
    <>
      <div className="steep-echo-section-head">
        <span className="section-label steep-echo-section-label">
          {t('report.results.steep.title')}
        </span>
        <button type="button" className="steep-echo-toggle-all" onClick={toggleAll}>
          {allOpen ? t('common.collapseAll') : t('common.expandAll')}
        </button>
      </div>
      <div className="steep-echo">
        {dims.map((k) => {
          const open = openDims[k];
          const globalVal = (g as Record<string, string>)[k] ?? '';
          const sectorialVal = (s as Record<string, string>)[k] ?? '';
          return (
            <div
              key={k}
              className={`steep-echo-row steep-echo-row--${k.toLowerCase()}${
                open ? ' steep-echo-row--open' : ''
              }`}
            >
              <button
                type="button"
                className="steep-echo-trigger"
                onClick={() => setOpenDims((p) => ({ ...p, [k]: !p[k] }))}
                aria-expanded={open}
              >
                <span className="steep-echo-icon" aria-hidden>
                  <svg
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <use href={steepIconHref(k)} />
                  </svg>
                </span>
                <span className="steep-echo-name">{t(steepDimensionLabelKey(k))}</span>
                <svg
                  className={`steep-echo-chevron${open ? ' steep-echo-chevron--up' : ''}`}
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
                <div className="steep-echo-body">
                  <div className="steep-echo-cell steep-echo-cell--global">
                    <div className="steep-echo-cell-label">{t('report.results.steep.global')}</div>
                    {valueOrDash(globalVal)}
                  </div>
                  <div className="steep-echo-cell steep-echo-cell--sectorial">
                    <div className="steep-echo-cell-label">
                      {t('report.results.steep.sectorial')}
                    </div>
                    {valueOrDash(sectorialVal)}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

function steepIconHref(k: GlobalSteepDimension): string {
  switch (k) {
    case 'S':
      return '#i-s';
    case 'T':
      return '#i-t';
    case 'E':
      return '#i-e';
    case 'ENV':
      return '#i-env';
    case 'P':
      return '#i-p';
  }
}

/**
 * Map a STEEP dimension key to the i18n key holding its localized label.
 * Re-uses the labels already shipped under `steep.dimensions.*` for the
 * wizard's sectorial step so the echo block stays in sync with the
 * dimension names the user saw while filling the form.
 */
function steepDimensionLabelKey(k: GlobalSteepDimension): string {
  switch (k) {
    case 'S':
      return 'wizard.steep.dimensions.social';
    case 'T':
      return 'wizard.steep.dimensions.technological';
    case 'E':
      return 'wizard.steep.dimensions.economic';
    case 'ENV':
      return 'wizard.steep.dimensions.environmental';
    case 'P':
      return 'wizard.steep.dimensions.political';
  }
}

function valueOrDash(v: string | undefined): ReactElement {
  const text = (v ?? '').trim();
  if (!text) return <span className="steep-echo-empty">—</span>;
  return <>{text}</>;
}

function hasAnySteepValue(input: InputProjection | undefined): boolean {
  if (!input) return false;
  const g = input.globalSteep ?? {};
  const s = input.sectorialSteep ?? {};
  return (['S', 'T', 'E', 'ENV', 'P'] as const).some(
    (k) =>
      ((g as Record<string, string>)[k] ?? '').trim().length > 0 ||
      ((s as Record<string, string>)[k] ?? '').trim().length > 0,
  );
}
