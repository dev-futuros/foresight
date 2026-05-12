import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useReport, useTranslateReport } from '../../hooks/useReports';
import { useDemoteExample, useTranslateExample } from '../../hooks/useExamples';
import { useIsDev } from '../../hooks/useAuth';
import { useSetStepper } from '../shell/StepperContext';
import { useCommands } from '../../lib/useCommands';
import { useSetAssistantContext } from '../chat/AssistantContextProvider';
import { exportReportPdf } from '../../lib/exportPdf';
import { exportReportPpt } from '../../lib/exportPpt';
import ExportModal, {
  type ExportFormat,
  type ExportLanguage,
} from '../../components/ExportModal';
import LoadingOverlay from '../../components/LoadingOverlay';
import ShareModal from '../../components/ShareModal';
import PromoteToExampleModal from '../../components/PromoteToExampleModal';
import ConfirmDialog from '../../components/ConfirmDialog';
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
  const translateReport = useTranslateReport();
  const translateExample = useTranslateExample();
  const demoteExample = useDemoteExample();
  const isDev = useIsDev();
  const [exporting, setExporting] = useState<'pdf' | 'ppt' | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [pendingDemote, setPendingDemote] = useState(false);

  const isExample = report?.source === 'example';

  // Surface the wizard's 6-step indicator with step 6 ("Resultados") active.
  // Steps 1–4 navigate back into the wizard in edit mode so the user can
  // tweak inputs and regenerate. Step 5 is the analysis loading marker —
  // marked clickable:false because there's no real page behind it.
  //
  // For examples the stepper is the same — the wizard route loads the
  // example via the useReport fallback and renders the inputs in
  // read-only-ish mode (changes don't persist back to the example).
  // This lets users explore an example's inputs the same way they'd
  // explore their own report's inputs.
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
        { n: 6, label: t('wizard.steps.results') },
      ],
      current: 6,
      maxReached: 6,
      onSelect: handleStepperSelect,
    }),
    [t, handleStepperSelect],
  );
  useSetStepper(stepperState);

  // Publish "currently-open report" to the assistant snapshot so the chat
  // knows about it even when the user navigated here through the UI (not
  // via an assistant command). Without this the snapshot defaults to
  // "step 1, empty form" and the assistant tells the user no report is
  // open. Cleared only on unmount (separate effect below) — clearing on
  // every dep change instead caused a brief undefined-context render
  // sandwiched between the old and new publish.
  const setAssistantContext = useSetAssistantContext();
  useEffect(() => {
    if (!report || !id) return;
    setAssistantContext({
      currentStep: 6,
      viewingReport: {
        id,
        title: report.title,
        status: report.status,
        primaryLanguage: report.primaryLanguage,
        availableLanguages: report.availableLanguages ?? [report.primaryLanguage],
        mode: 'viewer',
      },
    });
  }, [setAssistantContext, id, report]);
  useEffect(() => {
    return () => setAssistantContext(undefined);
  }, [setAssistantContext]);

  function runExport(kind: ExportFormat, language: ExportLanguage) {
    if (!report) return;
    setExporting(kind);
    // Yield to React so the overlay paints before the work begins. PDF
    // export awaits font loading (brand TTFs registered with jsPDF).
    setTimeout(async () => {
      try {
        const exportReport = await resolveReportForLanguage(report, language);
        if (kind === 'pdf') await exportReportPdf(exportReport, language);
        else exportReportPpt(exportReport);
      } finally {
        setExporting(null);
      }
    }, 0);
  }

  // Page-scoped overrides for the share/export commands. The shell-level
  // versions fall back to "open the report viewer first" — once we're on
  // that viewer these versions take over and open the actual modals.
  useCommands(() => [
    {
      name: 'shareReport',
      mode: 'auto',
      handler: () => {
        setShareOpen(true);
        return 'Opened the share dialog.';
      },
    },
    {
      // Always opens the picker — assistant doesn't pre-pick format or
      // language. The user has full control of both selections in the
      // dialog. Mirrors the header's Export button exactly.
      name: 'exportReport',
      mode: 'auto',
      handler: () => {
        if (!report) {
          throw new Error('Report not loaded yet — try again in a moment.');
        }
        setExportOpen(true);
        return 'Opened the export dialog.';
      },
    },
  ]);

  /**
   * Swap the report's payload to the cached translation for the picked
   * language, when it differs from the primary language. The export
   * picker only exposes already-materialised languages, so this call is
   * a guaranteed cache hit — no Anthropic round-trip needed. Hits
   * {@code /api/examples/.../translate} or {@code /api/reports/.../translate}
   * depending on the source.
   */
  async function resolveReportForLanguage(
    base: ReportResponse,
    language: ExportLanguage,
  ): Promise<ReportResponse> {
    if (language === base.primaryLanguage) return base;
    const translated = isExample
      ? await translateExample.mutateAsync({ id: base.id, targetLanguage: language })
      : await translateReport.mutateAsync({ id: base.id, targetLanguage: language });
    return {
      ...base,
      inputData: translated.inputData as Record<string, unknown>,
      resultData: translated.resultData as Record<string, unknown> | null,
    };
  }

  async function confirmDemote() {
    if (!id) return;
    setPendingDemote(false);
    try {
      await demoteExample.mutateAsync(id);
      // The example was deleted, a new report (same UUID) was created
      // under the calling DEV's ownership. The cached query was
      // invalidated; refetching transparently flips `source` to
      // `'report'` and the page re-renders with the report affordances.
      // No navigation needed — same URL, new shape.
      await refetch();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[report] demote failed', err);
    }
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
            <p className="report-eyebrow">
              {isExample
                ? t('example.eyebrow', { defaultValue: 'Example' })
                : t('report.eyebrow')}
            </p>
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
            {/* Promote: DEV only, real reports only. Hidden for examples
                (which are already promoted) and for non-DEVs (gated at
                the backend too). */}
            {isDev && !isExample && (
              <button
                type="button"
                className="btn"
                onClick={() => setPromoteOpen(true)}
                disabled={!report.resultData}
                title={t('dashboard.actions.promote', { defaultValue: 'Promote to example' })}
              >
                ★ {t('dashboard.actions.promote', { defaultValue: 'Example' })}
              </button>
            )}
            {/* Demote: DEV only, examples only. Converts back to a
                private report owned by the calling DEV. Same URL keeps
                working (the new report inherits the example's UUID).
                Button label is the destination ("Report") so it pairs
                visually with the Promote button's "Example" label. */}
            {isDev && isExample && (
              <button
                type="button"
                className="btn"
                onClick={() => setPendingDemote(true)}
                title={t('dashboard.actions.demote', { defaultValue: 'Convert back to a private report' })}
              >
                ↩ {t('dashboard.actions.demote', { defaultValue: 'Report' })}
              </button>
            )}
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
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setExportOpen(true)}
              disabled={exporting !== null || !report.resultData}
              title={t('dashboard.actions.export')}
            >
              <svg className="db-r-btn-ico" aria-hidden>
                <use href="#i-dl" />
              </svg>
              {exporting !== null ? '…' : t('dashboard.actions.export')}
            </button>
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
        text={exporting === 'pdf' ? t('modals.export.pdf') : t('modals.export.ppt')}
      />
      <ShareModal
        open={shareOpen}
        reportId={id!}
        kind={isExample ? 'example' : 'report'}
        onClose={() => setShareOpen(false)}
      />
      <ExportModal
        open={exportOpen}
        reportId={id!}
        kind={isExample ? 'example' : 'report'}
        onClose={() => setExportOpen(false)}
        onExport={(format, language) => runExport(format, language)}
      />
      <PromoteToExampleModal
        open={promoteOpen}
        reportId={id!}
        onClose={() => setPromoteOpen(false)}
      />
      <ConfirmDialog
        open={pendingDemote}
        title={t('modals.demoteExample.title', { defaultValue: 'Demote example?' })}
        description={t('modals.demoteExample.description', {
          defaultValue:
            'This converts the example into a private report owned by you. The example will be removed for every user, and any share links pointing at it will stop working.',
        })}
        confirmLabel={t('modals.demoteExample.confirm', { defaultValue: 'Demote' })}
        onConfirm={() => void confirmDemote()}
        onCancel={() => setPendingDemote(false)}
      />
    </div>
  );
}

