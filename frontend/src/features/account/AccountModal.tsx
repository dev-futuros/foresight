import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useKindeAuth } from '@kinde-oss/kinde-auth-react';
import { useQueryClient } from '@tanstack/react-query';
import type { PortalPage } from '@kinde/js-utils';
import Modal from '../../components/Modal';
import { useCurrentUser, useUpdateProfile } from './api';
import { useBillingProfile } from '../billing/api';
import api from '../../lib/api';
import { extractApiErrorMessage } from '../../lib/apiError';
import type { BillingProfileResponse } from '../../types/api';
import Avatar from './Avatar';
import './account.css';

const LANGUAGE_OPTIONS = [
  { value: 'es' as const, label: 'Español' },
  { value: 'en' as const, label: 'English' },
  { value: 'ca' as const, label: 'Català' },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

type StatusMsg = { type: 'ok' | 'err'; text: string } | null;

/**
 * Modal overlay version of the account page — opened from the topbar avatar
 * dropdown's "Profile" item. Centered avatar at the top (name surfaces as a
 * CSS-styled tooltip on hover), then two sections:
 *
 * <ol>
 *   <li><b>Preferences</b> — UI language picker. Pushes to Kinde Property
 *       {@code language} via the backend.</li>
 *   <li><b>Billing</b> — read-only plan + per-period usage, plus a "Modify"
 *       button that opens Kinde's customer portal on the plan-details page
 *       (active plans only). A DEV-role-gated "Increase reports" button
 *       triggers a meter push without spending an AI batch — useful for
 *       wiring tests, hidden from regular users.</li>
 * </ol>
 *
 * <p>Sign-out lives in the avatar dropdown menu (see {@link AccountMenu}),
 * not in here. Profile editing (name / email / password / MFA) is no longer
 * surfaced — those are managed entirely through Kinde's hosted portal,
 * which the Billing section's "Modify" button is the only in-app entry to.
 *
 * <p>Built on the generic {@link Modal} primitive so it gets backdrop, ESC-to-
 * close, focus trapping, body-scroll lock, and the entrance animation for free.
 */
export default function AccountModal({ open, onClose }: Readonly<Props>) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { data: user, isLoading } = useCurrentUser();
  const { data: billing } = useBillingProfile();
  const { generatePortalUrl } = useKindeAuth();
  const updateProfile = useUpdateProfile();

  // Picture comes from the backend (which composes it from Kinde stock fields
  // server-side) rather than from `useKindeAuth().user`. Single source of truth — the
  // frontend never reads Kinde claims directly for profile data, only for auth state.
  const picture = user?.picture ?? null;

  // Loading state for the Kinde-portal button — the SDK call hits Kinde's API to mint
  // a one-time portal URL, so on a slow connection it can take a beat. Disabling the
  // button during the request keeps the user from firing multiple windows.
  const [portalOpening, setPortalOpening] = useState(false);

  // ─── DEBUG: meter push test ───────────────────────────────────────────────
  // Temporary button that fires the FULL recordGeneration flow on the backend
  // (Property counter +1 + meter push +1), exactly like a real wizard Generate
  // click but without the AI batch. The response is the freshly composed
  // BillingProfileResponse so we can see both counters move in one shot.
  // Remove once the wizard flow is reliable end-to-end.
  const [meterDebug, setMeterDebug] = useState<string | null>(null);
  const [meterDebugPending, setMeterDebugPending] = useState(false);
  async function debugMeterPush() {
    setMeterDebugPending(true);
    setMeterDebug(null);
    try {
      const res = await api.post<BillingProfileResponse>('/billing/_debug/push-meter');
      setMeterDebug(JSON.stringify(res.data, null, 2));
      // Make the modal's quota chip refresh too — TanStack Query won't know on its own
      // that this request mutated billing state.
      await queryClient.invalidateQueries({ queryKey: ['billing'] });
    } catch (err) {
      setMeterDebug('Request failed: ' + extractApiErrorMessage(err, 'unknown'));
    } finally {
      setMeterDebugPending(false);
    }
  }

  /**
   * Opens Kinde's hosted account page in a new tab. We bypass the SDK's
   * `<PortalLink>` component (which forces same-tab navigation) and call
   * `generatePortalUrl` directly, then `window.open(..., '_blank')`. New tab
   * keeps the user signed in on our side and preserves app state behind it.
   *
   * <p>{@code subNav} accepts Kinde's {@code PortalPage} enum values (typed via the
   * type-only import) to deep-link to a specific tab — e.g. {@code plan_details}
   * for the billing section. Default (omitted) lands on the profile page.
   * {@code returnUrl} only matters if the user navigates back via Kinde's in-page
   * "back" button rather than closing the tab; we pass the current href.
   */
  async function openKindePortal(subNav?: PortalPage) {
    if (portalOpening) return;
    setPortalOpening(true);
    try {
      const result = await generatePortalUrl({
        ...(subNav ? { subNav } : {}),
        returnUrl: window.location.href,
      });
      window.open(result.url.toString(), '_blank', 'noopener,noreferrer');
    } catch (err) {
      // Best-effort: log and reset; the user can retry. Don't surface as a modal
      // error banner because the modal's own Profile / Preferences forms have their
      // own message slots and we don't want to step on them.
      console.error('Failed to open Kinde portal:', err);
    } finally {
      setPortalOpening(false);
    }
  }

  // Language is the only editable field left in this modal. The Preferences
  // section's Save button pushes to the backend, which mirrors the value to
  // Kinde Property `language`.
  const [language, setLanguage] = useState<'es' | 'en' | 'ca'>('es');
  const [prefsMsg, setPrefsMsg] = useState<StatusMsg>(null);

  // Mirror the API-owned language into local state once it arrives, and whenever a
  // different user lands (logout → login as someone else without remount).
  useEffect(() => {
    if (user?.id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync API-owned preference into editable local state when the row identity changes
      setLanguage((user.language as 'es' | 'en' | 'ca') ?? 'es');
    }
  }, [user?.id, user?.language]);

  // Clear any lingering status message when the modal is dismissed and
  // reopened — keeps "Saved!" from a previous session from carrying over.
  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset transient status banner on close
      setPrefsMsg(null);
    }
  }, [open]);

  async function handlePrefsSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPrefsMsg(null);
    try {
      await updateProfile.mutateAsync({ language });
      await i18n.changeLanguage(language);
      setPrefsMsg({
        type: 'ok',
        text: i18n.t('account.preferences.successMsg', { lng: language }),
      });
    } catch (err) {
      setPrefsMsg({
        type: 'err',
        text: extractApiErrorMessage(
          err,
          i18n.t('account.preferences.errorMsg', { lng: language }),
        ),
      });
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      ariaLabel={t('account.title')}
      dialogClassName="modal-dialog--account"
    >
      <button
        type="button"
        className="account-modal-close"
        onClick={onClose}
        aria-label={t('common.close')}
      >
        <svg viewBox="0 0 16 16" aria-hidden fill="none" stroke="currentColor">
          <path d="M4 4l8 8M12 4l-8 8" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>
      {isLoading ? (
        <p className="account-modal-loading">{t('account.loading')}</p>
      ) : (
        <>
          {/* Identity block — just the avatar, centered. Name surfaces as a
              CSS-styled tooltip on hover (via `data-tooltip` on the wrapper).
              No role badge, no inline text — keeps the dialog dense. */}
          <div className="account-modal-identity">
            <span
              className="account-modal-avatar-tooltip"
              data-tooltip={user?.name?.trim() || null}
            >
              <Avatar src={picture} name={user?.name ?? null} size={96} />
            </span>
          </div>

          {/* BILLING — current plan + per-period usage, both read-only. The only CTA is
              "Manage in Kinde" (active plan → opens the portal on plan-details for cancel /
              change card / invoices). New subscriptions are handled by Kinde's hosted
              flow during sign-up; if a user somehow lands here with no active plan, the
              section just shows "no plan" without a CTA — they re-trigger the Kinde
              billing flow by signing out and back in. */}
          <section className="account-modal-section">
            <h3 className="account-modal-section-title">{t('account.billing.title')}</h3>
            <div className="account-modal-form">
              <div className="account-modal-field">
                <label htmlFor="account-modal-plan">{t('account.billing.plan')}</label>
                <input
                  id="account-modal-plan"
                  className="account-modal-input--readonly"
                  value={
                    billing?.plan
                      ? t(`account.billing.planNames.${billing.plan}`, {
                          defaultValue: billing.plan,
                        })
                      : t('account.billing.noPlan')
                  }
                  readOnly
                />
              </div>
              {billing?.plan && billing.reportsLimit != null && (
                <div className="account-modal-field">
                  <label htmlFor="account-modal-usage">{t('account.billing.usage')}</label>
                  <input
                    id="account-modal-usage"
                    className="account-modal-input--readonly"
                    value={t('account.billing.usageValue', {
                      used: billing.reportsUsed,
                      limit: billing.reportsLimit,
                    })}
                    readOnly
                  />
                </div>
              )}
              {/* DEV-only — bump the Kinde Properties counter + meter by one without
                  spending an AI batch. Useful for verifying the billing pipeline is
                  wired. Gated to UserRole.DEV so the button never leaks to real users. */}
              {billing?.plan && user?.role === 'DEV' && (
                <div className="account-modal-field">
                  <button
                    type="button"
                    className="modal-btn"
                    onClick={() => {
                      void debugMeterPush();
                    }}
                    disabled={meterDebugPending}
                    style={{ alignSelf: 'flex-start' }}
                  >
                    {meterDebugPending
                      ? t('account.billing.increasing')
                      : t('account.billing.increaseReports')}
                  </button>
                  {meterDebug && (
                    <pre
                      style={{
                        marginTop: 8,
                        padding: 10,
                        background: 'var(--surface-3)',
                        border: '1px solid var(--line)',
                        borderRadius: 4,
                        fontFamily: 'var(--mono)',
                        fontSize: 11,
                        color: 'var(--ink)',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        maxHeight: 200,
                        overflow: 'auto',
                      }}
                    >
                      {meterDebug}
                    </pre>
                  )}
                </div>
              )}
              {billing?.plan && (
                <div className="account-modal-section-actions">
                  <button
                    type="button"
                    className="modal-btn"
                    onClick={() => {
                      void openKindePortal('plan_details' as PortalPage);
                    }}
                    disabled={portalOpening}
                  >
                    {portalOpening ? t('account.billing.opening') : t('account.billing.manage')}
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* PREFERENCES — UI language. Placed after Billing because day-to-day use
              of the modal is more about checking quota than switching languages. */}
          <section className="account-modal-section">
            <h3 className="account-modal-section-title">{t('account.preferences.title')}</h3>
            <form onSubmit={handlePrefsSubmit} className="account-modal-form">
              <div className="account-modal-field">
                <label htmlFor="account-modal-language">{t('account.preferences.language')}</label>
                <select
                  id="account-modal-language"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as 'es' | 'en' | 'ca')}
                >
                  {LANGUAGE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              {prefsMsg && (
                <p className={`account-modal-msg account-modal-msg--${prefsMsg.type}`}>
                  {prefsMsg.text}
                </p>
              )}
              <div className="account-modal-section-actions">
                <button
                  type="submit"
                  className="modal-btn modal-btn--primary"
                  disabled={updateProfile.isPending || language === user?.language}
                >
                  {updateProfile.isPending
                    ? t('account.preferences.saving')
                    : t('account.preferences.save')}
                </button>
              </div>
            </form>
          </section>
        </>
      )}
    </Modal>
  );
}
