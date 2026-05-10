import { useTranslation } from 'react-i18next';
import type { ResultData } from '../ReportContent';

/** Fuentes tab — public web references the model used to ground the analysis.
 *  Links open in a new tab with `noopener noreferrer` for safety. */
export default function TabSources({ result }: { result: ResultData }) {
  const { t } = useTranslation();
  const sources = result.sources?.sources ?? [];

  if (sources.length === 0) {
    return <p className="empty-state">{t('report.results.empty')}</p>;
  }

  return (
    <>
      <p className="bc-intro-txt">{t('report.results.sources.intro')}</p>
      <ul className="sources-list">
        {sources.map((s, i) => (
          <li key={i} className="source-item">
            <a
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="source-link"
            >
              {s.title}
            </a>
            <p className="source-desc">{s.description}</p>
            <span className="source-url">{shortUrl(s.url)}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '') + (u.pathname === '/' ? '' : u.pathname);
  } catch {
    return url;
  }
}
