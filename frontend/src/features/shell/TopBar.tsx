import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSaveStatus } from './SaveStatusContext';
import { dispatch as dispatchCommand } from '../../lib/commandBus';
import AppUserButton from '../account/AppUserButton';

/**
 * Sticky top bar — brand on the left, action cluster on the right:
 * autosave chip (when a wizard is publishing state) → new-report icon
 * (gold) → dashboard icon → user avatar. The avatar (Clerk's
 * UserButton wrapped via {@link AppUserButton}) opens the modal that
 * carries "My account", the custom "Preferences" page, and sign out —
 * replacing the older hamburger dropdown.
 */
export default function TopBar() {
  const { t } = useTranslation();

  const saveStatus = useSaveStatus();

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
              Smaller than the icon buttons (22×22 vs 32×32) so it reads
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
          {/* User avatar — opens the Clerk modal (My Account, Security,
              custom Preferences page, sign out). Replaces the older
              hamburger dropdown that wrapped the same two destinations. */}
          <div className="topbar-avatar">
            <AppUserButton size={28} />
          </div>
        </div>
      </div>
    </header>
  );
}
