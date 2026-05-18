import { useTranslation } from 'react-i18next';

export interface DashboardStatsProps {
  total: number;
  completed: number;
  inProgress: number;
  failed: number;
}

/** Four-stat strip rendered above the dashboard's saved-reports grid. */
export default function DashboardStats({
  total,
  completed,
  inProgress,
  failed,
}: DashboardStatsProps) {
  const { t } = useTranslation();
  return (
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
  );
}
