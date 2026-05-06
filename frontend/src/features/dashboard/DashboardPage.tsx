import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useReports, useDeleteReport } from '../../hooks/useReports';
import ConfirmDialog from '../../components/ConfirmDialog';
import '../../components/modal.css';
import type { ReportStatus } from '../../types/api';
import './dashboard.css';

export default function DashboardPage() {
  const { t, i18n } = useTranslation();
  const { data, isLoading, isError, refetch } = useReports();
  const deleteReport = useDeleteReport();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

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
            {reports.map((report) => (
              <Link
                key={report.id}
                to={`/reports/${report.id}`}
                className="db-report-card"
              >
                <div className={`db-r-status ${report.status}`}>
                  {t(`dashboard.status.${report.status}` as `dashboard.status.${ReportStatus}`)}
                </div>
                <div className="db-r-name">{report.title}</div>
                <div className="db-r-date">{formatDate(report.createdAt)}</div>
                <div className="db-r-actions">
                  <span className="db-r-btn">{t('dashboard.actions.view')}</span>
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
            ))}
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
    </div>
  );
}
