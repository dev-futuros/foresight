import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useReport, useUpdateReport } from '../../hooks/useReports';
import { useCurrentUser } from '../../hooks/useAuth';
import { analyze } from '../../lib/aiClient';
import { extractApiErrorMessage } from '../../lib/apiError';
import { exportReportPdf } from '../../lib/exportPdf';
import { exportReportPpt } from '../../lib/exportPpt';
import LoadingOverlay from '../../components/LoadingOverlay';
import '../../components/modal.css';
import type { ReportStatus } from '../../types/api';
import './report.css';

type Tab = 'inputs' | 'resultados';

type InputData = {
  companyProfile?: { name?: string; sector?: string; horizon?: string; challenge?: string };
  steep?: Record<string, string>;
  horizon?: Record<string, string>;
};

type ResultData = {
  scenarios?: { type: string; title: string; description: string }[];
  weakSignals?: string[];
  wildcards?: string[];
  keyUncertainties?: string[];
};

type T = ReturnType<typeof useTranslation>['t'];

export default function ReportPage() {
  const { t, i18n } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { data: report, isLoading, isError, refetch } = useReport(id!);
  const { data: user } = useCurrentUser();
  const updateReport = useUpdateReport();
  const [tab, setTab] = useState<Tab>('inputs');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<'pdf' | 'ppt' | null>(null);

  function runExport(kind: 'pdf' | 'ppt') {
    if (!report) return;
    setExporting(kind);
    // jspdf and pptxgenjs work synchronously and block the main thread.
    // setTimeout(0) yields to React so the overlay paints before the work
    // begins; otherwise the user sees nothing until export completes.
    setTimeout(() => {
      try {
        if (kind === 'pdf') exportReportPdf(report);
        else exportReportPpt(report);
      } finally {
        setExporting(null);
      }
    }, 0);
  }

  if (isLoading) {
    return <div className="loading-screen">{t('report.loading')}</div>;
  }
  if (isError || !report) {
    return (
      <div className="report-page">
        <div className="report-main">
          <div className="err-box" style={{ margin: '64px auto 0' }}>
            {isError ? t('report.errorLoading') : t('report.notFound')}
          </div>
          {isError && (
            <div style={{ textAlign: 'center', marginTop: 14 }}>
              <button type="button" className="btn" onClick={() => refetch()}>
                {t('common.retry')}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const input = report.inputData as InputData;

  const formattedDate = new Date(report.createdAt).toLocaleDateString(
    i18n.language === 'en' ? 'en-GB' : 'es-ES',
    { day: '2-digit', month: 'short', year: 'numeric' },
  );

  const language: 'es' | 'en' =
    user?.language === 'en' || i18n.language === 'en' ? 'en' : 'es';

  async function handleAnalyze() {
    if (!report) return;
    setIsAnalyzing(true);
    setAnalyzeError(null);
    try {
      const inputs = report.inputData as {
        companyProfile?: unknown;
        steep?: unknown;
        horizon?: unknown;
      };
      const result = await analyze({
        companyProfile: inputs.companyProfile ?? {},
        steep: inputs.steep ?? {},
        horizon: inputs.horizon ?? {},
        language,
      });
      await updateReport.mutateAsync({
        id: report.id,
        body: { resultData: result as unknown as Record<string, unknown> },
      });
      setTab('resultados');
    } catch (e) {
      setAnalyzeError(extractApiErrorMessage(e, t('report.results.errorDefault')));
    } finally {
      setIsAnalyzing(false);
    }
  }

  const result = report.resultData as ResultData | null;

  return (
    <div className="report-page">
      <div className="report-main">
        <header className="report-header">
          <div className="report-header-actions">
            <span className={`status-badge ${report.status}`}>
              {t(`report.status.${report.status}` as `report.status.${ReportStatus}`)}
            </span>
            <button
              type="button"
              className="btn-export"
              onClick={() => runExport('pdf')}
              disabled={!report.resultData || exporting !== null}
              title={t('report.export.pdfTitle')}
            >
              PDF
            </button>
            <button
              type="button"
              className="btn-export"
              onClick={() => runExport('ppt')}
              disabled={!report.resultData || exporting !== null}
              title={t('report.export.pptTitle')}
            >
              PPT
            </button>
          </div>
          <p className="report-eyebrow">{t('report.eyebrow')}</p>
          <h1 className="report-main-title">{report.title}</h1>
          <div className="report-meta">
            <span className="report-meta-item">
              {t('report.meta.created', { date: formattedDate })}
            </span>
            {input?.companyProfile?.horizon && (
              <span className="report-meta-item">
                {t('report.meta.horizon', { value: input.companyProfile.horizon })}
              </span>
            )}
            {input?.companyProfile?.sector && (
              <span className="report-meta-item">· {input.companyProfile.sector}</span>
            )}
          </div>
        </header>

        <nav className="tab-row" aria-label="Report sections">
          <button
            type="button"
            className={`tab-btn${tab === 'inputs' ? ' active' : ''}`}
            onClick={() => setTab('inputs')}
          >
            {t('report.tabs.inputs')}
          </button>
          <button
            type="button"
            className={`tab-btn${tab === 'resultados' ? ' active' : ''}`}
            onClick={() => setTab('resultados')}
          >
            {t('report.tabs.results')}
          </button>
        </nav>

        {tab === 'inputs' && <InputsTab input={input} t={t} />}

        {tab === 'resultados' && isAnalyzing && (
          <div className="loading-wrap">
            <div className="spinner" aria-hidden />
            <p className="loading-head">{t('report.results.analyzing')}</p>
          </div>
        )}

        {tab === 'resultados' && !isAnalyzing && !report.resultData && (
          <div className="pending-state">
            <div className="pending-icon">◈</div>
            <h2 className="pending-title">{t('report.results.pendingTitle')}</h2>
            <p className="pending-desc">{t('report.results.pendingDesc')}</p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleAnalyze}
              disabled={isAnalyzing}
            >
              {t('report.results.generateBtn')}
            </button>
            {analyzeError && <div className="err-box">{analyzeError}</div>}
          </div>
        )}

        {tab === 'resultados' && !isAnalyzing && result && (
          <ResultsTab result={result} t={t} />
        )}
      </div>

      <LoadingOverlay
        open={exporting !== null}
        text={exporting === 'pdf' ? t('modals.export.pdf') : t('modals.export.ppt')}
      />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Sub-components — kept inline to keep the feature self-contained.
   Pull out to their own files in a later refactor if they grow.
   ───────────────────────────────────────────────────────────── */

function InputsTab({ input, t }: { input: InputData; t: T }) {
  const cp = input?.companyProfile;
  const steep = input?.steep;
  const horizon = input?.horizon;

  return (
    <div>
      <div className="input-grid">
        <div className="input-card">
          <div className="input-card-label">{t('report.inputs.organization')}</div>
          <div className="input-card-value">{cp?.name || '—'}</div>
        </div>
        <div className="input-card">
          <div className="input-card-label">{t('report.inputs.sector')}</div>
          <div className="input-card-value">{cp?.sector || '—'}</div>
        </div>
        <div className="input-card full">
          <div className="input-card-label">{t('report.inputs.challenge')}</div>
          <div className="input-card-value">{cp?.challenge || '—'}</div>
        </div>
      </div>

      {steep && (
        <>
          <p className="section-label">{t('report.inputs.steep')}</p>
          <div className="input-grid">
            {Object.entries(steep).map(([key, value]) =>
              value ? (
                <div key={key} className="input-card">
                  <div className="input-card-label">
                    {t(`report.steepLabels.${key}`, { defaultValue: key })}
                  </div>
                  <div className="input-card-value">{value}</div>
                </div>
              ) : null,
            )}
          </div>
        </>
      )}

      {horizon && (
        <>
          <p className="section-label">{t('report.inputs.horizon')}</p>
          <div className="input-grid">
            {Object.entries(horizon).map(([key, value]) =>
              value ? (
                <div key={key} className="input-card full">
                  <div className="input-card-label">
                    {t(`report.horizonLabels.${key}`, { defaultValue: key })}
                  </div>
                  <div className="input-card-value">{value}</div>
                </div>
              ) : null,
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ResultsTab({ result, t }: { result: ResultData; t: T }) {
  const hasContent =
    (result.scenarios && result.scenarios.length > 0) ||
    (result.keyUncertainties && result.keyUncertainties.length > 0) ||
    (result.weakSignals && result.weakSignals.length > 0) ||
    (result.wildcards && result.wildcards.length > 0);

  if (!hasContent) return null;

  return (
    <div>
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

      {((result.weakSignals?.length ?? 0) > 0 || (result.wildcards?.length ?? 0) > 0) && (
        <>
          <p className="section-label">
            {t('report.results.weakSignals')} · {t('report.results.wildcards')}
          </p>
          <div className="signals-grid">
            {result.weakSignals && result.weakSignals.length > 0 && (
              <div className={`signals-card${result.wildcards?.length ? '' : ' full'}`}>
                <div className="signals-card-head">{t('report.results.weakSignals')}</div>
                <ul className="signals-list">
                  {result.weakSignals.map((s, i) => (
                    <li key={i} className="signals-item">{s}</li>
                  ))}
                </ul>
              </div>
            )}
            {result.wildcards && result.wildcards.length > 0 && (
              <div className={`signals-card${result.weakSignals?.length ? '' : ' full'}`}>
                <div className="signals-card-head">{t('report.results.wildcards')}</div>
                <ul className="signals-list">
                  {result.wildcards.map((w, i) => (
                    <li key={i} className="signals-item">{w}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
