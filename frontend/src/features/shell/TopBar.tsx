import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLogout } from '../../hooks/useAuth';

/**
 * Sticky top bar — brand on the left, dashboard shortcut + hamburger menu
 * on the right. Account and Logout collapse into the hamburger dropdown
 * to keep the visible action area compact; the dashboard stays inline
 * with an icon since it's the most-used destination.
 */
export default function TopBar() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const logout = useLogout();

  const onDashboard = location.pathname === '/dashboard';

  // Hamburger dropdown state. Closes on outside click, Escape, route
  // change, and after picking a menu item.
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(e: MouseEvent) {
      const node = menuRef.current;
      if (node && !node.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  // Close the menu whenever the route changes — picking any item that
  // navigates needs the menu closed afterward.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  function handleAccount() {
    setMenuOpen(false);
    navigate('/account');
  }
  function handleLogout() {
    setMenuOpen(false);
    logout();
  }

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link to="/reports/new" className="brand" title={t('nav.brandTitle')}>
          <div className="brand-text">
            <span className="brand-name">Futuros</span>
            <span className="brand-tag">{t('nav.brandTag')}</span>
          </div>
        </Link>
        <div className="topbar-spacer" />
        <div className="topbar-actions">
          {!onDashboard && (
            <Link to="/dashboard" className="btn-ghost" title={t('nav.dashboard')}>
              <svg className="btn-ghost-ico" aria-hidden>
                <use href="#i-grid" />
              </svg>
              {t('nav.dashboard')}
            </Link>
          )}
          <div className="topbar-menu" ref={menuRef}>
            <button
              type="button"
              className="btn-ghost btn-ghost--icon"
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label={t('nav.menu')}
              title={t('nav.menu')}
            >
              <svg className="btn-ghost-ico" aria-hidden>
                <use href="#i-menu" />
              </svg>
            </button>
            {menuOpen && (
              <div className="topbar-menu-dropdown" role="menu">
                <button
                  type="button"
                  className="topbar-menu-item"
                  role="menuitem"
                  onClick={handleAccount}
                >
                  <svg className="topbar-menu-ico" aria-hidden>
                    <use href="#i-user" />
                  </svg>
                  {t('nav.myAccount')}
                </button>
                <button
                  type="button"
                  className="topbar-menu-item"
                  role="menuitem"
                  onClick={handleLogout}
                >
                  <svg className="topbar-menu-ico" aria-hidden>
                    <use href="#i-signout" />
                  </svg>
                  {t('nav.logout')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
