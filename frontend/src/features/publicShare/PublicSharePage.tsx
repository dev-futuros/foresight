import { useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePublicShare } from '../../hooks/useShare';
import ReportContent, {
  type InputProjection,
  type ResultData,
} from '../report/ReportContent';
import '../report/report.css';
import './publicShare.css';

type InputData = {
  companyProfile?: { name?: string; sector?: string; horizon?: string; challenge?: string };
  globalSteep?: Record<string, string>;
  steep?: Record<string, string>;
};

/**
 * Anonymous, read-only view of a shared report. Reachable at {@code /share/:token}
 * and bypasses Clerk / ProtectedRoute entirely so the recipient never has to
 * log in.
 *
 * The page intentionally drops the authenticated app shell (sidebar, stepper,
 * topbar) and replaces it with a minimal Futuros-branded chrome — the recipient
 * is here to read the analysis, not navigate the app.
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
  //
  // Effect deps are reduced to the lang query value: i18n is a stable
  // singleton but its hook-returned reference flips on every render,
  // and including it here caused this effect to re-fire on every mouse
  // event — fighting `useLanguageSync` for any signed-in owner viewing
  // their own EN share. That re-render storm is what blacked out the
  // backdrop-filtered sticky tab-row.
  const langParam = searchParams.get('lang');
  useEffect(() => {
    if (langParam && (langParam === 'es' || langParam === 'en') && langParam !== i18n.language) {
      void i18n.changeLanguage(langParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [langParam]);

  const formattedDate = data
    ? new Date(data.createdAt).toLocaleDateString(
        i18n.language === 'en' ? 'en-GB' : 'es-ES',
        { day: '2-digit', month: 'short', year: 'numeric' },
      )
    : '';

  return (
    <div className="public-share">
      <header className="public-share-topbar">
        <div className="public-share-brand">
          <span className="public-share-brand-name">Futuros</span>
          <span className="public-share-brand-tag">{t('share.public.header')}</span>
        </div>
      </header>

      <main className="public-share-main report-page">
        {isLoading && (
          <div className="public-share-state">{t('share.public.loading')}</div>
        )}

        {isError && (
          <div className="public-share-state public-share-state--error">
            <h2>{t('share.public.expired')}</h2>
            <p>{t('share.public.expiredHelp')}</p>
          </div>
        )}

        {data && (
          <div className="report-main">
            <header className="report-header">
              <p className="report-eyebrow">{t('share.public.eyebrow')}</p>
              <h1 className="report-main-title">{data.title}</h1>
              <div className="report-meta">
                <span className="report-meta-item">
                  {t('report.meta.created', { date: formattedDate })}
                </span>
                {(data.inputData as InputData)?.companyProfile?.horizon && (
                  <span className="report-meta-item">
                    {t('report.meta.horizon', {
                      value: (data.inputData as InputData).companyProfile!.horizon,
                    })}
                  </span>
                )}
                {(data.inputData as InputData)?.companyProfile?.sector && (
                  <span className="report-meta-item">
                    · {(data.inputData as InputData).companyProfile!.sector}
                  </span>
                )}
              </div>
            </header>
            {data.resultData && (
              <ReportContent
                result={data.resultData as ResultData}
                input={{
                  globalSteep: (data.inputData as InputData)?.globalSteep,
                  sectorialSteep: (data.inputData as InputData)?.steep,
                }}
              />
            )}
          </div>
        )}
      </main>

      <footer className="public-share-footer">
        <span>FUTUROS · Foresight Strategy</span>
      </footer>
    </div>
  );
}
