import { type ReactElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
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
 * The minimum payload {@link ShareView} needs to render. Loose on
 * purpose so both {@code PublicShareResponse} (the anonymous share
 * endpoint's response) and the richer {@code ReportResponse} (the
 * authenticated detail endpoint) satisfy it — the standalone HTML
 * exporter passes the latter, the live share page passes the former,
 * and the view doesn't need to care which.
 */
export interface ShareReport {
  title: string;
  createdAt: string;
  inputData: Record<string, unknown>;
  resultData: Record<string, unknown> | null;
}

interface Props {
  report: ShareReport;
  /**
   * Optional slot rendered inside the report-meta row, typically a
   * language-switcher pill. Passed in by {@link PublicSharePage} when
   * the share carries cached translations; the standalone snapshot
   * entry leaves it undefined (the snapshot is single-language by
   * construction — the export bakes in one chosen language).
   */
  languageSwitcher?: ReactNode;
}

/**
 * Pure presentational projection of {@link PublicSharePage}'s body —
 * the Futuros chrome (top bar + footer) wrapping the report's header
 * and the live {@link ReportContent} tab strip. Takes the resolved
 * report as a prop so the same render path can be reused by:
 *
 * <ul>
 *   <li>{@link PublicSharePage}, which fetches via {@code usePublicShare}
 *       and passes the result here;</li>
 *   <li>The standalone HTML snapshot entry
 *       ({@code src/share-snapshot.tsx}), which reads the data from
 *       {@code window.__REPORT__} at mount and renders the exact same
 *       view — used by the HTML export to bake a pixel-identical copy
 *       of the share page into a single file.</li>
 * </ul>
 */
export default function ShareView({ report, languageSwitcher }: Props): ReactElement {
  const { t, i18n } = useTranslation();
  const formattedDate = new Date(report.createdAt).toLocaleDateString(
    i18n.language === 'en' ? 'en-GB' : 'es-ES',
    { day: '2-digit', month: 'short', year: 'numeric' },
  );
  const input = (report.inputData ?? {}) as InputData;
  const cp = input.companyProfile ?? {};
  return (
    <div className="public-share">
      <header className="public-share-topbar">
        <div className="public-share-brand">
          <span className="public-share-brand-name">Futuros</span>
          <span className="public-share-brand-tag">{t('share.public.header')}</span>
        </div>
      </header>

      <main className="public-share-main report-page">
        <div className="report-main">
          {/* .report-heading wrapper matches ReportPage's structure so
              .report-header's flex children stack vertically inside it
              rather than space-between'ing horizontally. The share view
              has no .report-actions sibling, but the wrapper still
              earns the same vertical-stack layout. */}
          <header className="report-header">
            <div className="report-heading">
              <p className="report-eyebrow">{t('share.public.eyebrow')}</p>
              <h1 className="report-main-title">{report.title}</h1>
              <div className="report-meta">
                <span className="report-meta-item">
                  {t('report.meta.created', { date: formattedDate })}
                </span>
                {cp.horizon && (
                  <span className="report-meta-item">
                    {t('report.meta.horizon', { value: cp.horizon })}
                  </span>
                )}
                {cp.sector && (
                  <span className="report-meta-item">· {cp.sector}</span>
                )}
                {/* (Language switcher used to live here. It now feeds
                    into ReportContent's rightSlot so it pins with the
                    sticky tab row, mirroring the in-app viewer's
                    layout — see below.) */}
              </div>
            </div>
          </header>
          {report.resultData && (
            <ReportContent
              result={report.resultData as ResultData}
              input={{
                globalSteep: input.globalSteep as InputProjection['globalSteep'],
                sectorialSteep: input.steep as InputProjection['sectorialSteep'],
              }}
              rightSlot={languageSwitcher}
            />
          )}
        </div>
      </main>

      <footer className="public-share-footer">
        <span>FUTUROS · Foresight Strategy</span>
      </footer>
    </div>
  );
}
