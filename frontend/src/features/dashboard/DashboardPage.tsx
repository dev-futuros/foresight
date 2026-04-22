import { Link } from 'react-router-dom';
import { useReports, useDeleteReport } from '../../hooks/useReports';
import { useCurrentUser, useLogout } from '../../hooks/useAuth';
import type { ReportStatus } from '../../types/api';
import './dashboard.css';

const STATUS_LABEL: Record<ReportStatus, string> = {
  DRAFT: 'Borrador',
  PROCESSING: 'Procesando',
  COMPLETED: 'Completado',
  FAILED: 'Error',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function DashboardPage() {
  const { data: user } = useCurrentUser();
  const { data, isLoading, isError } = useReports();
  const deleteReport = useDeleteReport();
  const logout = useLogout();

  function handleDelete(e: React.MouseEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    if (confirm('¿Eliminar este informe? Esta acción no se puede deshacer.')) {
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
          {user && (
            <span className="nav-user">{user.name || user.email}</span>
          )}
          <Link to="/account" className="nav-logout">Mi cuenta</Link>
          <button className="nav-logout" onClick={logout}>
            Cerrar sesión
          </button>
        </div>
      </nav>

      <main className="dashboard-main">
        <div className="dashboard-header">
          <div>
            <h1 className="dashboard-title">Mis informes</h1>
            <p className="dashboard-subtitle">
              {data ? `${data.totalElements} informe${data.totalElements !== 1 ? 's' : ''}` : ' '}
            </p>
          </div>
          <Link to="/reports/new" className="btn-new-report">
            ✦ Nuevo informe
          </Link>
        </div>

        {isLoading && (
          <div className="dashboard-loading">Cargando informes...</div>
        )}

        {isError && (
          <div className="dashboard-error">Error al cargar los informes.</div>
        )}

        {!isLoading && !isError && data && data.content.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">◈</div>
            <h2 className="empty-state-title">Sin informes todavía</h2>
            <p className="empty-state-desc">
              Crea tu primer análisis de foresight estratégico.
            </p>
            <Link to="/reports/new" className="btn-new-report" style={{ display: 'inline-flex' }}>
              ✦ Crear primer informe
            </Link>
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
                    {STATUS_LABEL[report.status]}
                  </span>
                  <button
                    className="btn-delete"
                    onClick={(e) => handleDelete(e, report.id)}
                    aria-label="Eliminar informe"
                    title="Eliminar"
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
