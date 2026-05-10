import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useReports, useDeleteReport } from '../../hooks/useReports';
import ConfirmDialog from '../../components/ConfirmDialog';
import ExportMenu from '../../components/ExportMenu';
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
   *  so the result is cached for any subsequent viewer/edit navigation.
   *
   *  <p>Called from the ExportMenu's PDF/PPT picks. The menu itself does
   *  event stopping (preventDefault + stopPropagation inside its item
   *  handlers), so we don't need to receive the event here. */
  async function handleExport(id: string, kind: 'pdf' | 'ppt') {
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
  //
  // The example card is hoisted to the top of the grid regardless of its
  // createdAt date — it's the user's "what does a finished report look
  // like?" anchor and should sit above their own work. The rest of the
  // list keeps the server-side createdAt-desc order.
  const reports = useMemo(() => {
    const all = data?.content ?? [];
    const example = all.filter((r) => r.title === EXAMPLE_REPORT_TITLE);
    const rest = all.filter((r) => r.title !== EXAMPLE_REPORT_TITLE);
    return [...example, ...rest];
  }, [data?.content]);
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
                  {/* onMouseDown stop is belt-and-braces — child buttons each
                      stopPropagation, but the ExportMenu's outside-click
                      listener uses mousedown and we want clicks on action
                      affordances to never bubble up as a card navigation. */}
                  <div
                    className="db-r-actions"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {canExport && (
                      <>
                        <ExportMenu
                          busy={isBusyExporting}
                          onPdf={() => void handleExport(report.id, 'pdf')}
                          onPpt={() => void handleExport(report.id, 'ppt')}
                        />
                        <button
                          className="db-r-btn"
                          type="button"
                          onClick={(e) => handleShare(e, report.id)}
                          title={t('dashboard.actions.share')}
                        >
                          <svg className="db-r-btn-ico" aria-hidden>
                            <use href="#i-share" />
                          </svg>
                          {t('dashboard.actions.share')}
                        </button>
                      </>
                    )}
                    {/* Example card has no delete affordance — it's the
                        built-in demo and deletion would only be confusing.
                        The user can still wipe it manually via the API or
                        the assistant if they really need to. */}
                    {!isExample && (
                      <button
                        className="db-r-btn danger"
                        type="button"
                        onClick={(e) => handleDelete(e, report.id)}
                        title={t('dashboard.deleteTitle')}
                      >
                        <svg className="db-r-btn-ico" aria-hidden>
                          <use href="#i-trash" />
                        </svg>
                        {t('dashboard.actions.delete')}
                      </button>
                    )}
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
    </div>
  );
}
