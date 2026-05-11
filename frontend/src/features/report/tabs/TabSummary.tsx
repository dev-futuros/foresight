import { useTranslation } from 'react-i18next';
import type { GlobalSteepDimension } from '../../../lib/aiClient';
import type { InputProjection, ResultData } from '../ReportContent';

/**
 * Summary tab ("Resumen") — executive summary lead paragraph, the
 * key-uncertainty card grid, and the STEEP global/sectorial echo table
 * at the bottom (matches the prototype's `#global-steep-section`).
 *
 * <p>3P scenarios live in their own tab (TabScenarios) and are NOT
 * duplicated here, mirroring the prototype's `#tab-res` content split.
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
  const hasSteep = hasAnySteepValue(input);

  return (
    <>
      {exec && <p className="exec-summary">{exec}</p>}

      {uncertainties.length > 0 && (
        <>
          <p className="section-label">{t('report.results.uncertainties')}</p>
          <div className="uncertainty-grid">
            {uncertainties.map((u, i) => (
              <div key={i} className="unc-card">
                <div className="unc-name">{u.name}</div>
                <p className="unc-desc">{u.description}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {hasSteep && <SteepEcho input={input!} />}
    </>
  );
}

/**
 * Two-column comparison table echoing the Global STEEP (step 2) and
 * Sectorial STEEP (step 3) the user provided as analysis inputs. Each
 * dimension row shows the STEEP icon on the left and the global +
 * sectorial values side by side; empty cells render an em-dash.
 */
function SteepEcho({ input }: { input: InputProjection }) {
  const { t } = useTranslation();
  const g = input.globalSteep ?? {};
  const s = input.sectorialSteep ?? {};
  return (
    <>
      <p className="section-label">{t('report.results.steep.title')}</p>
      <div className="steep-echo">
        <div className="steep-echo-head">
          <div />
          <div className="steep-echo-col-label">{t('report.results.steep.global')}</div>
          <div className="steep-echo-col-label">{t('report.results.steep.sectorial')}</div>
        </div>
        {(['S', 'T', 'E', 'ENV', 'P'] as GlobalSteepDimension[]).map((k) => (
          <div key={k} className={`steep-echo-row steep-echo-row--${k.toLowerCase()}`}>
            <div className="steep-echo-icon" aria-label={t(steepDimensionLabelKey(k))}>
              <svg fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <use href={steepIconHref(k)} />
              </svg>
            </div>
            <div className="steep-echo-cell steep-echo-cell--global">
              {valueOrDash((g as Record<string, string>)[k])}
            </div>
            <div className="steep-echo-cell steep-echo-cell--sectorial">
              {valueOrDash((s as Record<string, string>)[k])}
            </div>
          </div>
        ))}
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
      return 'steep.dimensions.social';
    case 'T':
      return 'steep.dimensions.technological';
    case 'E':
      return 'steep.dimensions.economic';
    case 'ENV':
      return 'steep.dimensions.environmental';
    case 'P':
      return 'steep.dimensions.political';
  }
}

function valueOrDash(v: string | undefined): JSX.Element {
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
