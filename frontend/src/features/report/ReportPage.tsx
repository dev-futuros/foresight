import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useReport } from '../../hooks/useReports';
import { useSetStepper } from '../shell/StepperContext';
import { exportReportPdf } from '../../lib/exportPdf';
import { exportReportPpt } from '../../lib/exportPpt';
import LoadingOverlay from '../../components/LoadingOverlay';
import '../../components/modal.css';
import type { ReportStatus } from '../../types/api';
import './report.css';

type InputData = {
  companyProfile?: { name?: string; sector?: string; horizon?: string; challenge?: string };
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
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { data: report, isLoading, isError, refetch } = useReport(id!);
  const [exporting, setExporting] = useState<'pdf' | 'ppt' | null>(null);

  // Surface the wizard's 6-step indicator with step 6 ("Resultados") active.
  // Steps 1–4 navigate back into the wizard in edit mode so the user can
  // tweak inputs and regenerate. Step 5 is the analysis loading marker —
  // marked clickable:false because there's no real page behind it.
  const handleStepperSelect = useCallback(
    (n: number) => {
      if (n < 1 || n > 4) return;
      navigate(`/reports/${id}/edit?step=${n}`);
    },
    [id, navigate],
  );
  const stepperState = useMemo(
    () => ({
      steps: [
        { n: 1, label: t('wizard.steps.empresa') },
        { n: 2, label: t('wizard.steps.global') },
        { n: 3, label: t('wizard.steps.steep') },
        { n: 4, label: t('wizard.steps.horizon') },
        { n: 5, label: t('wizard.steps.analysis'), clickable: false },
        { n: 6, label: t('wizard.steps.results') },
      ],
      current: 6,
      maxReached: 6,
      onSelect: handleStepperSelect,
    }),
    [t, handleStepperSelect],
  );
  useSetStepper(stepperState);

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
  const result = report.resultData as ResultData | null;

  const formattedDate = new Date(report.createdAt).toLocaleDateString(
    i18n.language === 'en' ? 'en-GB' : 'es-ES',
    { day: '2-digit', month: 'short', year: 'numeric' },
  );

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

        {result ? (
          <Results result={result} t={t} />
        ) : (
          // Legacy fallback: reports created with the old wizard flow may
          // still exist as DRAFT (no resultData). New flow always generates
          // before navigating, so this branch is for old data only.
          <div className="pending-state">
            <div className="pending-icon">◈</div>
            <h2 className="pending-title">{t('report.results.pendingTitle')}</h2>
            <p className="pending-desc">{t('report.results.pendingDesc')}</p>
          </div>
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
   Results renderer — inline since this is the only consumer.
   ───────────────────────────────────────────────────────────── */

function Results({ result, t }: { result: ResultData; t: T }) {
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
