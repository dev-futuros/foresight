import { useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePublicShare } from '../../hooks/useShare';
import ShareView from './ShareView';
import '../report/report.css';
import './publicShare.css';

/**
 * Anonymous, read-only view of a shared report. Reachable at {@code /share/:token}
 * and bypasses Clerk / ProtectedRoute entirely so the recipient never has to
 * log in.
 *
 * <p>Owns data-fetching + loading/error states; the actual chrome and report
 * body live in {@link ShareView} so the same render path is reused by the
 * standalone HTML snapshot entry.
 */
export default function PublicSharePage() {
  const { t, i18n } = useTranslation();
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const { data, isLoading, isError } = usePublicShare(token ?? '');

  // The share URL may carry ?lang=es|en (set when the owner created the
  // share in a non-primary language). Switch the public UI to that
  // language so the chrome around the report content (section labels,
  // tab titles, etc.) matches what the recipient is reading.
  useEffect(() => {
    const lang = searchParams.get('lang');
    if (lang && (lang === 'es' || lang === 'en' || lang === 'ca') && lang !== i18n.language) {
      void i18n.changeLanguage(lang);
    }
  }, [searchParams, i18n]);

  if (isLoading) {
    return (
      <div className="public-share">
        <header className="public-share-topbar">
          <div className="public-share-brand">
            <span className="public-share-brand-name">Futuros</span>
            <span className="public-share-brand-tag">{t('share.public.header')}</span>
          </div>
        </header>
        <main className="public-share-main report-page">
          <div className="public-share-state">{t('share.public.loading')}</div>
        </main>
        <footer className="public-share-footer">
          <span>FUTUROS · Foresight Strategy</span>
        </footer>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="public-share">
        <header className="public-share-topbar">
          <div className="public-share-brand">
            <span className="public-share-brand-name">Futuros</span>
            <span className="public-share-brand-tag">{t('share.public.header')}</span>
          </div>
        </header>
        <main className="public-share-main report-page">
          <div className="public-share-state public-share-state--error">
            <h2>{t('share.public.expired')}</h2>
            <p>{t('share.public.expiredHelp')}</p>
          </div>
        </main>
        <footer className="public-share-footer">
          <span>FUTUROS · Foresight Strategy</span>
        </footer>
      </div>
    );
  }

  return <ShareView report={data} />;
}
