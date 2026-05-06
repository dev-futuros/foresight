import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLogout } from '../../hooks/useAuth';

/**
 * Sticky top bar — brand on the left, ghost-button actions on the right.
 * Mirrors the prototype's `.topbar` markup so shell.css applies 1:1.
 */
export default function TopBar() {
  const { t } = useTranslation();
  const location = useLocation();
  const logout = useLogout();

  const onDashboard = location.pathname === '/dashboard';

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link to="/dashboard" className="brand" title={t('nav.dashboard')}>
          <div className="brand-text">
            <span className="brand-name">Futuros</span>
            <span className="brand-tag">{t('nav.brandTag')}</span>
          </div>
        </Link>
        <div className="topbar-spacer" />
        <div className="topbar-actions">
          {!onDashboard && (
            <Link to="/dashboard" className="btn-ghost">
              {t('nav.dashboard')}
            </Link>
          )}
          <Link to="/account" className="btn-ghost">
            {t('nav.myAccount')}
          </Link>
          <button type="button" className="btn-ghost" onClick={logout}>
            {t('nav.logout')}
          </button>
        </div>
      </div>
    </header>
  );
}
