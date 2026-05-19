import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { dispatch as dispatchCommand } from '../../lib/commandBus';
import AccountMenu from '../account/AccountMenu';
import { useIsDev } from '../account/api';

interface TopBarProps {
  /**
   * Opens the account modal overlay. Wired by {@link AppShell}, which owns
   * the modal's open state. Kept as a prop (instead of an internal click
   * handler that opens a modal here) so the modal can sit alongside the
   * shell's other floating UI — chat assistant, footer — without nesting
   * portals inside the topbar.
   */
  onOpenAccount: () => void;
}

/**
 * Sticky top bar — brand on the left, action cluster on the right:
 * new-report icon (gold) → dashboard icon → account avatar menu. The avatar
 * opens a small dropdown with "Profile" (which opens the {@link AccountModal}
 * overlay mounted in {@link AppShell}) and "Logout" (which delegates to
 * Kinde's hosted logout flow).
 *
 * <p>The autosave chip used to live here, but it now sits inline above
 * the wizard's input form (see {@code wizard-save-row} in
 * {@code NewReportPage}) so the "I'm typing — am I saved?" relationship
 * reads spatially next to the fields the user is actually editing.
 */
export default function TopBar({ onOpenAccount }: Readonly<TopBarProps>) {
  const { t } = useTranslation();
  const isDev = useIsDev();

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
          {/* DEV-only Sentry smoke-test button. Throws synchronously from
              the click handler so the error escapes React's event delegation
              and reaches window.onerror — which Sentry's GlobalHandlers
              integration listens to. If Sentry is wired correctly the event
              shows up in the Sentry dashboard within a few seconds, with
              the source-mapped stack trace pointing back to this file.
              Hidden from non-DEV users (the backend also has no equivalent
              endpoint, so this is purely a UI test affordance). */}
          {isDev && (
            <button
              type="button"
              className="btn-ghost btn-ghost--icon"
              data-tooltip={t('nav.devThrow')}
              data-tooltip-pos="below"
              aria-label={t('nav.devThrow')}
              onClick={() => {
                throw new Error('Sentry smoke test — thrown from TopBar dev button');
              }}
            >
              <svg className="btn-ghost-ico" aria-hidden>
                <use href="#i-bug" />
              </svg>
            </button>
          )}
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
          {/* Account — avatar trigger that opens a small dropdown with
              Profile (which itself opens the AccountModal overlay mounted in
              AppShell) and Logout. Replaces the previous bare icon button
              so the affordance matches mainstream SaaS account menus. */}
          <AccountMenu onProfileClick={onOpenAccount} />
        </div>
      </div>
    </header>
  );
}
