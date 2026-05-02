import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useReports, useDeleteReport } from '../../hooks/useReports';
import { useCurrentUser, useLogout } from '../../hooks/useAuth';
import type { ReportStatus } from '../../types/api';
import './dashboard.css';

export default function DashboardPage() {
  const { t, i18n } = useTranslation();
  const { data: user } = useCurrentUser();
  const { data, isLoading, isError, refetch } = useReports();
  const deleteReport = useDeleteReport();
  const logout = useLogout();

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
    if (confirm(t('dashboard.deleteConfirm'))) {
      deleteReport.mutate(id);
    }
  }

  return (
    <div className="dashboard">
      <nav className="dashboard-nav">
        <div className="nav-logo">
          <div className="nav-logo-mark">F</div>
          <span className="nav-logo-text">Futuros</span>
        </div>
        <div className="nav-actions">
          {user?.name && (
            <span className="nav-user">{user.name}</span>
          )}
          <Link to="/account" className="nav-logout">{t('nav.myAccount')}</Link>
          <button className="nav-logout" onClick={logout}>
            {t('nav.logout')}
          </button>
        </div>
      </nav>

      <main className="dashboard-main">
        <div className="dashboard-header">
          <div>
            <h1 className="dashboard-title">{t('dashboard.title')}</h1>
            <p className="dashboard-subtitle">
              {data ? t('dashboard.reports', { count: data.totalElements }) : ' '}
            </p>
          </div>
          <Link to="/reports/new" className="btn-new-report">
            ✦ {t('dashboard.newReport')}
          </Link>
        </div>

        {isLoading && (
          <div className="dashboard-loading">{t('dashboard.loading')}</div>
        )}

        {isError && (
          <div className="dashboard-error" role="alert">
            <span>{t('dashboard.errorLoading')}</span>
            <button
              type="button"
              className="btn-retry"
              onClick={() => refetch()}
            >
              {t('common.retry')}
            </button>
          </div>
        )}

        {!isLoading && !isError && data && data.content.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">◈</div>
            <h2 className="empty-state-title">{t('dashboard.emptyTitle')}</h2>
            <p className="empty-state-desc">{t('dashboard.emptyDesc')}</p>
          </div>
        )}

        {!isLoading && !isError && data && data.content.length > 0 && (
          <div className="reports-list">
            {data.content.map((report) => (
              <Link
                key={report.id}
                to={`/reports/${report.id}`}
                className="report-card"
              >
                <div className="report-card-info">
                  <div className="report-card-title">{report.title}</div>
                  <div className="report-card-meta">
                    {formatDate(report.createdAt)}
                  </div>
                </div>
                <div className="report-card-actions">
                  <span className={`status-badge ${report.status}`}>
                    {t(`dashboard.status.${report.status}` as `dashboard.status.${ReportStatus}`)}
                  </span>
                  <button
                    className="btn-delete"
                    onClick={(e) => handleDelete(e, report.id)}
                    aria-label={t('dashboard.deleteLabel')}
                    title={t('dashboard.deleteTitle')}
                  >
                    ✕
                  </button>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
