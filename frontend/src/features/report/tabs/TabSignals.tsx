import { useTranslation } from 'react-i18next';
import type { ResultData } from '../ReportContent';

/** Signals & wildcards tab — weak signals (early indicators) and wildcards
 *  (low-probability, high-impact events). Two side-by-side columns when both
 *  are present, single full-width column otherwise. */
export default function TabSignals({ result }: { result: ResultData }) {
  const { t } = useTranslation();
  const hasWeak = (result.weakSignals?.length ?? 0) > 0;
  const hasWild = (result.wildcards?.length ?? 0) > 0;

  if (!hasWeak && !hasWild) {
    return <p className="empty-state">{t('report.results.empty')}</p>;
  }

  return (
    <>
      <p className="section-label">
        {t('report.results.weakSignals')} · {t('report.results.wildcards')}
      </p>
      <div className="signals-grid">
        {hasWeak && (
          <div className={`signals-card${hasWild ? '' : ' full'}`}>
            <div className="signals-card-head">{t('report.results.weakSignals')}</div>
            <ul className="signals-list">
              {result.weakSignals!.map((s, i) => (
                <li key={i} className="signals-item">{s}</li>
              ))}
            </ul>
          </div>
        )}
        {hasWild && (
          <div className={`signals-card${hasWeak ? '' : ' full'}`}>
            <div className="signals-card-head">{t('report.results.wildcards')}</div>
            <ul className="signals-list">
              {result.wildcards!.map((w, i) => (
                <li key={i} className="signals-item">{w}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}
