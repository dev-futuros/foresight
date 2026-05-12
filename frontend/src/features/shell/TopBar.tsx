import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLogout } from '../../hooks/useAuth';
import { useSaveStatus } from './SaveStatusContext';
import { dispatch as dispatchCommand } from '../../lib/commandBus';

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

  const saveStatus = useSaveStatus();

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
          {/* Autosave chip + new-report button form a paired cluster: the
              chip sits right next to the new-doc icon so the "you are
              writing, and it's being saved" relationship reads spatially.
              Smaller than the icon buttons (24×24 vs 32×32) so it reads
              as a status indicator rather than another action.
              Only rendered while a wizard page is mounted and publishing
              state. */}
          {saveStatus && (
            <div
              className={`topbar-save-status topbar-save-status--${saveStatus.status}`}
              role="status"
              aria-live="polite"
              title={saveStatus.label}
            >
              {saveStatus.status === 'saving' ? (
                <span className="topbar-save-spinner" aria-hidden />
              ) : (
                <svg className="topbar-save-ico" aria-hidden>
                  <use
                    href={
                      saveStatus.status === 'saved'
                        ? '#i-check'
                        : saveStatus.status === 'error'
                          ? '#i-alert'
                          : '#i-edit'
                    }
                  />
                </svg>
              )}
              <span className="visually-hidden">{saveStatus.label}</span>
            </div>
          )}
          {/* New report — gold-accented icon. Always visible. Routes
              through the command bus so the page-scoped override on
              NewReportPage (which clears every wizard slice in place)
              wins when the user is already on /reports/new; on every
              other route the shell-level fallback navigates. Same
              affordance the chat assistant uses, single source of truth. */}
          <button
            type="button"
            className="btn-ghost btn-ghost--icon btn-ghost--gold"
            title={t('nav.newReport')}
            aria-label={t('nav.newReport')}
            onClick={() => {
              void dispatchCommand('newReport', {});
            }}
          >
            <svg className="btn-ghost-ico" aria-hidden>
              <use href="#i-newdoc" />
            </svg>
          </button>
          {/* Dashboard — always visible. */}
          <Link
            to="/dashboard"
            className="btn-ghost btn-ghost--icon"
            title={t('nav.dashboard')}
            aria-label={t('nav.dashboard')}
          >
            <svg className="btn-ghost-ico" aria-hidden>
              <use href="#i-grid" />
            </svg>
          </Link>
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
