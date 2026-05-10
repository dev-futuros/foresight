import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useReports, useDeleteReport } from '../../hooks/useReports';
import { useLoadExample } from '../../hooks/useLoadExample';
import ConfirmDialog from '../../components/ConfirmDialog';
import LoadingOverlay from '../../components/LoadingOverlay';
import ShareModal from '../../components/ShareModal';
import '../../components/modal.css';
import api from '../../lib/api';
import { exportReportPdf } from '../../lib/exportPdf';
import { exportReportPpt } from '../../lib/exportPpt';
import { EXAMPLE_REPORT_TITLE } from '../../lib/exampleReport';
import type { ReportResponse, ReportStatus } from '../../types/api';
import './dashboard.css';

/** Action a card might be running. {@code null} when no card is busy. */
type ExportingState = { id: string; kind: 'pdf' | 'ppt' } | null;

export default function DashboardPage() {
  const { t, i18n } = useTranslation();
  const { data, isLoading, isError, refetch } = useReports();
  const deleteReport = useDeleteReport();
  const queryClient = useQueryClient();
  const { loadExample, isLoading: isLoadingExample } = useLoadExample();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [shareTargetId, setShareTargetId] = useState<string | null>(null);
  // Tracks which card (if any) is currently fetching+exporting. We only
  // allow one export at a time so the overlay doesn't get into a tangled
  // race; the UI disables the other export buttons on whichever card is
  // currently working.
  const [exporting, setExporting] = useState<ExportingState>(null);

  const dateLocale = i18n.language === 'en' ? 'en-GB' : 'es-ES';

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString(dateLocale, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  function handleDelete(e: React.MouseEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    setPendingDeleteId(id);
  }

  function handleShare(e: React.MouseEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    setShareTargetId(id);
  }

  /** Fetch the full report (with resultData) and run the export library.
   *  The card-level useReports query only carries summaries, so we have
   *  to fetch the heavy blob on demand. Goes through queryClient.fetchQuery
   *  so the result is cached for any subsequent viewer/edit navigation. */
  async function handleExport(
    e: React.MouseEvent,
    id: string,
    kind: 'pdf' | 'ppt',
  ) {
    e.preventDefault();
    e.stopPropagation();
    if (exporting) return;
    setExporting({ id, kind });
    try {
      const report = await queryClient.fetchQuery<ReportResponse>({
        queryKey: ['reports', id],
        queryFn: async () => {
          const res = await api.get<ReportResponse>(`/reports/${id}`);
          return res.data;
        },
      });
      // jspdf and pptxgenjs block the main thread; defer one tick so the
      // overlay paints before the work begins, matching the ReportPage
      // export pattern.
      await new Promise((r) => setTimeout(r, 0));
      if (kind === 'pdf') exportReportPdf(report);
      else exportReportPpt(report);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[dashboard] export failed', err);
    } finally {
      setExporting(null);
    }
  }

  function confirmDelete() {
    if (pendingDeleteId) deleteReport.mutate(pendingDeleteId);
    setPendingDeleteId(null);
  }

  // Stats are computed from the loaded page (default size 20). The "total" stat
  // uses the server-reported totalElements, but completed/in-progress/failed
  // counts are first-page approximations until pagination is wired up.
  const reports = data?.content ?? [];
  const total = data?.totalElements ?? 0;
  const completed = reports.filter((r) => r.status === 'COMPLETED').length;
  const inProgress = reports.filter((r) => r.status === 'DRAFT' || r.status === 'PROCESSING').length;
  const failed = reports.filter((r) => r.status === 'FAILED').length;

  const hasReports = reports.length > 0;

  return (
    <div className="dashboard">
      <main className="dashboard-main">
        <div className="db-header">
          <div>
            <div className="eyebrow">{t('dashboard.eyebrow')}</div>
            <h1 className="page-title">{t('dashboard.title')}</h1>
          </div>
          <div className="db-actions">
            {/* "Cargar ejemplo" is always available so the user can land on
                a finished report regardless of whether they ever clicked
                the equivalent button in the onboarding dialog. If the
                example already exists in their dashboard, the hook's
                reuse-by-title check navigates to the existing copy instead
                of creating a duplicate. */}
            <button
              type="button"
              className="btn"
              onClick={() => {
                void loadExample();
              }}
              disabled={isLoadingExample}
            >
              {t('dashboard.loadExample')}
            </button>
            <Link to="/reports/new" className="btn btn-primary">
              {t('dashboard.newReport')}
            </Link>
          </div>
        </div>

        {!isLoading && !isError && (
          <div className="db-stats">
            <div className="db-stat">
              <div className="db-stat-n">{total}</div>
              <div className="db-stat-l">{t('dashboard.stat.reports')}</div>
            </div>
            <div className="db-stat">
              <div className="db-stat-n">{completed}</div>
              <div className="db-stat-l">{t('dashboard.stat.completed')}</div>
            </div>
            <div className="db-stat">
              <div className="db-stat-n">{inProgress}</div>
              <div className="db-stat-l">{t('dashboard.stat.inProgress')}</div>
            </div>
            <div className="db-stat">
              <div className="db-stat-n">{failed}</div>
              <div className="db-stat-l">{t('dashboard.stat.failed')}</div>
            </div>
          </div>
        )}

        <p className="section-label">{t('dashboard.savedLabel')}</p>

        {isLoading && <div className="db-loading">{t('dashboard.loading')}</div>}

        {isError && (
          <div className="db-error" role="alert">
            <span>{t('dashboard.errorLoading')}</span>
            <button type="button" className="btn-retry" onClick={() => refetch()}>
              {t('common.retry')}
            </button>
          </div>
        )}

        {!isLoading && !isError && !hasReports && (
          <div className="db-empty">
            <div className="db-empty-icon">◈</div>
            <h2 className="db-empty-title">{t('dashboard.emptyTitle')}</h2>
            <p className="db-empty-desc">{t('dashboard.emptyDesc')}</p>
          </div>
        )}

        {!isLoading && !isError && hasReports && (
          <div className="db-reports-grid">
            {reports.map((report) => {
              const isDraft = report.status === 'DRAFT';
              const isExample = report.title === EXAMPLE_REPORT_TITLE;
              // Drafts open the wizard in edit mode so the user lands back
              // on the step they left off. Completed reports go straight to
              // the viewer. The example is always a completed report (we
              // POST inputData + PATCH resultData on creation), so it
              // follows the COMPLETED path.
              const target = isDraft ? `/reports/${report.id}/edit` : `/reports/${report.id}`;
              // Share/export only make sense on reports that have a result.
              // Drafts are a wizard-in-progress; nothing to share yet.
              const canExport = !isDraft && report.status !== 'FAILED';
              const isBusyExporting = exporting?.id === report.id;
              return (
                <Link
                  key={report.id}
                  to={target}
                  className={`db-report-card${isExample ? ' db-r-example' : ''}`}
                >
                  <div className={`db-r-status ${report.status}`}>
                    {t(`dashboard.status.${report.status}` as `dashboard.status.${ReportStatus}`)}
                  </div>
                  <div className="db-r-name">
                    {report.title}
                    {isExample && (
                      <span className="db-r-badge">{t('dashboard.exampleBadge')}</span>
                    )}
                  </div>
                  <div className="db-r-date">{formatDate(report.createdAt)}</div>
                  <div className="db-r-actions">
                    {canExport && (
                      <>
                        <button
                          className="db-r-btn"
                          type="button"
                          onClick={(e) => handleShare(e, report.id)}
                          aria-label={t('dashboard.actions.share')}
                        >
                          {t('dashboard.actions.share')}
                        </button>
                        <button
                          className="db-r-btn"
                          type="button"
                          onClick={(e) => handleExport(e, report.id, 'pdf')}
                          disabled={!!exporting}
                          aria-label={t('dashboard.actions.pdf')}
                        >
                          {isBusyExporting && exporting?.kind === 'pdf'
                            ? '…'
                            : t('dashboard.actions.pdf')}
                        </button>
                        <button
                          className="db-r-btn"
                          type="button"
                          onClick={(e) => handleExport(e, report.id, 'ppt')}
                          disabled={!!exporting}
                          aria-label={t('dashboard.actions.ppt')}
                        >
                          {isBusyExporting && exporting?.kind === 'ppt'
                            ? '…'
                            : t('dashboard.actions.ppt')}
                        </button>
                      </>
                    )}
                    <span className="db-r-btn">
                      {isDraft ? t('dashboard.actions.resume') : t('dashboard.actions.view')}
                    </span>
                    <button
                      className="db-r-btn danger"
                      type="button"
                      onClick={(e) => handleDelete(e, report.id)}
                      aria-label={t('dashboard.deleteLabel')}
                      title={t('dashboard.deleteTitle')}
                    >
                      {t('dashboard.actions.delete')}
                    </button>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>

      <ConfirmDialog
        open={pendingDeleteId !== null}
        title={t('modals.deleteReport.title')}
        description={t('modals.deleteReport.description')}
        confirmLabel={t('modals.deleteReport.confirm')}
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setPendingDeleteId(null)}
      />
      <ShareModal
        open={shareTargetId !== null}
        reportId={shareTargetId ?? ''}
        onClose={() => setShareTargetId(null)}
      />
      <LoadingOverlay
        open={exporting !== null}
        text={
          exporting?.kind === 'pdf'
            ? t('modals.export.pdf')
            : exporting?.kind === 'ppt'
              ? t('modals.export.ppt')
              : t('dashboard.exporting')
        }
      />
      <LoadingOverlay open={isLoadingExample} text={t('modals.loadExample')} />
    </div>
  );
}
