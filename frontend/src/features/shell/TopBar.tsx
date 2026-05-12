import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { dispatch as dispatchCommand } from '../../lib/commandBus';
import AppUserButton from '../account/AppUserButton';

/**
 * Sticky top bar — brand on the left, action cluster on the right:
 * new-report icon (gold) → dashboard icon → user avatar. The avatar
 * (Clerk's UserButton wrapped via {@link AppUserButton}) opens the modal
 * that carries "My account", the custom "Preferences" page, and sign
 * out — replacing the older hamburger dropdown.
 *
 * <p>The autosave chip used to live here, but it now sits inline above
 * the wizard's input form (see {@code wizard-save-row} in
 * {@code NewReportPage}) so the "I'm typing — am I saved?" relationship
 * reads spatially next to the fields the user is actually editing.
 */
export default function TopBar() {
  const { t } = useTranslation();

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
          {/* New report — gold-accented icon. Always visible. Routes
              through the command bus so the page-scoped override on
              NewReportPage (which clears every wizard slice in place)
              wins when the user is already on /reports/new; on every
              other route the shell-level fallback navigates. Same
              affordance the chat assistant uses, single source of truth. */}
          <button
            type="button"
            className="btn-ghost btn-ghost--icon"
            data-tooltip={t('nav.newReport')}
            data-tooltip-pos="below"
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
            data-tooltip={t('nav.dashboard')}
            data-tooltip-pos="below"
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
