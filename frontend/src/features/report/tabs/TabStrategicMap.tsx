import { useTranslation } from 'react-i18next';
import type { ResultData } from '../ReportContent';

/** Mapa estratégico tab — strategic priorities organised by horizon.
 *  H1 = present-extended (0-2y), H2 = emerging (2-5y), H3 = transformative (5+y). */
export default function TabStrategicMap({ result }: { result: ResultData }) {
  const { t } = useTranslation();
  const map = result.strategicMap;
  const h1 = map?.h1 ?? [];
  const h2 = map?.h2 ?? [];
  const h3 = map?.h3 ?? [];

  if (h1.length + h2.length + h3.length === 0) {
    return <p className="empty-state">{t('report.results.empty')}</p>;
  }

  const columns: { key: 'h1' | 'h2' | 'h3'; entries: typeof h1 }[] = [
    { key: 'h1', entries: h1 },
    { key: 'h2', entries: h2 },
    { key: 'h3', entries: h3 },
  ];

  return (
    <div className="strategic-map">
      {columns.map((c) => (
        <section key={c.key} className={`str-col str-col--${c.key}`}>
          <header className="str-col-head">
            <span className="str-col-tag">{c.key.toUpperCase()}</span>
            <span className="str-col-label">{t(`report.results.str.${c.key}`)}</span>
          </header>
          {c.entries.length === 0 ? (
            <div className="str-empty">—</div>
          ) : (
            <ul className="str-list">
              {c.entries.map((e, i) => (
                <li key={i} className="str-item">
                  <h4 className="str-title">{e.title}</h4>
                  <p className="str-desc">{e.description}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
