import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  translateReportStream,
  useReport,
  type TranslateProgress,
} from '../../hooks/useReports';
import { useSetStepper } from '../shell/StepperContext';
import { exportReportPdf } from '../../lib/exportPdf';
import { exportReportPpt } from '../../lib/exportPpt';
import ExportMenu, { type ExportLanguage } from '../../components/ExportMenu';
import LoadingOverlay from '../../components/LoadingOverlay';
import ShareModal from '../../components/ShareModal';
import ReportContent, { type InputProjection, type ResultData } from './ReportContent';
import '../../components/modal.css';
import type { ReportResponse, ReportStatus } from '../../types/api';
import './report.css';

type InputData = {
  companyProfile?: { name?: string; sector?: string; horizon?: string; challenge?: string };
  globalSteep?: Record<string, string>;
  steep?: Record<string, string>;
};

export default function ReportPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { data: report, isLoading, isError, refetch } = useReport(id!);
  const [exporting, setExporting] = useState<'pdf' | 'ppt' | null>(null);
  const [translating, setTranslating] = useState(false);
  const [translateProgress, setTranslateProgress] = useState<TranslateProgress | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

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
  // Same step list as NewReportPage — the transient "Analysis" loader (n=5)
  // is omitted from the stepper. n values stay 1-6 so the routing handlers
  // in handleStepperSelect can keep their 1-4 / 6 checks unchanged.
  const stepperState = useMemo(
    () => ({
      steps: [
        { n: 1, label: t('wizard.steps.empresa') },
        { n: 2, label: t('wizard.steps.global') },
        { n: 3, label: t('wizard.steps.steep') },
        { n: 4, label: t('wizard.steps.horizon') },
        { n: 6, label: t('wizard.steps.results') },
      ],
      current: 6,
      maxReached: 6,
      onSelect: handleStepperSelect,
    }),
    [t, handleStepperSelect],
  );
  useSetStepper(stepperState);

  function runExport(kind: 'pdf' | 'ppt', language: ExportLanguage) {
    if (!report) return;
    setExporting(kind);
    // Yield to React so the overlay paints before the work begins. PDF
    // export awaits font loading (brand TTFs registered with jsPDF) and
    // may translate the report payload first when the user picked a
    // language different from the report's primary one.
    setTimeout(async () => {
      try {
        const exportReport = await resolveReportForLanguage(report, language);
        if (kind === 'pdf') await exportReportPdf(exportReport, language);
        else exportReportPpt(exportReport);
      } finally {
        setExporting(null);
        setTranslating(false);
        setTranslateProgress(null);
      }
    }, 0);
  }

  /**
   * If the requested export language matches the report's primary
   * language, the original payload is fine. Otherwise we stream the
   * backend translate endpoint (cached per report × language). The
   * progress events feed {@code translateProgress} so the
   * LoadingOverlay shows a determinate bar — the translated envelope is
   * roughly the same length as the source, so {@code outputChars / inputChars}
   * is a usable percentage.
   */
  async function resolveReportForLanguage(
    base: ReportResponse,
    language: ExportLanguage,
  ): Promise<ReportResponse> {
    if (language === base.primaryLanguage) return base;
    setTranslating(true);
    setTranslateProgress(null);
    const translated = await translateReportStream({
      id: base.id,
      targetLanguage: language,
      onProgress: (p) => setTranslateProgress(p),
    });
    return {
      ...base,
      inputData: translated.inputData as Record<string, unknown>,
      resultData: translated.resultData as Record<string, unknown> | null,
    };
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
  // `inputData.steep` is the sectorial STEEP captured in step 3 (the
  // wizard stores it under the bare `steep` key, not `sectorialSteep`).
  // Surface it to ReportContent under the demo-aligned name so the
  // Summary tab's STEEP echo block reads from a single typed projection.
  const inputProjection: InputProjection = {
    globalSteep: input?.globalSteep,
    sectorialSteep: input?.steep,
  };

  const formattedDate = new Date(report.createdAt).toLocaleDateString(
    i18n.language === 'en' ? 'en-GB' : 'es-ES',
    { day: '2-digit', month: 'short', year: 'numeric' },
  );

  return (
    <div className="report-page">
      <div className="report-main">
        <header className="report-header">
          <div className="report-heading">
            <p className="report-eyebrow">{t('report.eyebrow')}</p>
            <h1 className="report-main-title">{report.title}</h1>
            <div className="report-meta">
              <span className={`status-badge ${report.status}`}>
                {t(`report.status.${report.status}` as `report.status.${ReportStatus}`)}
              </span>
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
          </div>
          <div className="report-actions">
            <button
              type="button"
              className="btn"
              onClick={() => setShareOpen(true)}
              disabled={!report.resultData}
              title={t('share.triggerBtn')}
            >
              <svg className="db-r-btn-ico" aria-hidden>
                <use href="#i-share" />
              </svg>
              {t('share.triggerBtn')}
            </button>
            <ExportMenu
              busy={exporting !== null}
              onPdf={(lang) => runExport('pdf', lang)}
              onPpt={(lang) => runExport('ppt', lang)}
              triggerClassName="btn btn-primary"
              primaryLanguage={(report.primaryLanguage as ExportLanguage) ?? 'es'}
            />
          </div>
        </header>

        {result ? (
          <ReportContent result={result} input={inputProjection} />
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
        text={
          translating
            ? t('share.translating', {
                defaultValue: 'Translating report…',
              })
            : exporting === 'pdf'
              ? t('modals.export.pdf')
              : t('modals.export.ppt')
        }
        progressPct={
          translating && translateProgress && translateProgress.inputChars > 0
            ? Math.max(
                2,
                Math.min(
                  99,
                  Math.round(
                    (translateProgress.outputChars / translateProgress.inputChars) * 100,
                  ),
                ),
              )
            : null
        }
        detail={
          translating && translateProgress && translateProgress.inputChars > 0
            ? `${translateProgress.outputChars.toLocaleString()} / ${translateProgress.inputChars.toLocaleString()} ${t(
                'share.chars',
                { defaultValue: 'chars' },
              )}`
            : null
        }
      />
      <ShareModal
        open={shareOpen}
        reportId={id!}
        onClose={() => setShareOpen(false)}
      />
    </div>
  );
}

