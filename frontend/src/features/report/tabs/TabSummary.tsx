import { useTranslation } from 'react-i18next';
import type { ResultData } from '../ReportContent';

/** Resumen tab: 3P scenarios overview + key uncertainties. Same content the
 *  legacy single-page renderer surfaced first; under tabs it becomes the
 *  default landing view. */
export default function TabSummary({ result }: { result: ResultData }) {
  const { t } = useTranslation();
  return (
    <>
      {result.scenarios && result.scenarios.length > 0 && (
        <>
          <p className="section-label">{t('report.results.scenarios')}</p>
          <div className="scenarios-grid">
            {result.scenarios.map((s) => (
              <article key={s.type} className="scen-card">
                <div className="scen-stripe" aria-hidden />
                <div className="scen-type-badge">{s.type}</div>
                <h3 className="scen-name">{s.title}</h3>
                <p className="scen-desc">{s.description}</p>
              </article>
            ))}
          </div>
        </>
      )}

      {result.keyUncertainties && result.keyUncertainties.length > 0 && (
        <>
          <p className="section-label">{t('report.results.uncertainties')}</p>
          <div className="uncertainty-grid">
            {result.keyUncertainties.map((u, i) => (
              <div key={i} className="unc-card">
                <p className="unc-text">{u}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
