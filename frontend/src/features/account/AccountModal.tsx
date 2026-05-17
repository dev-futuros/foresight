import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useKindeAuth } from '@kinde-oss/kinde-auth-react';
import Modal from '../../components/Modal';
import { useUpdateProfile } from '../../hooks/useAccount';
import { useCurrentUser } from '../../hooks/useAuth';
import { extractApiErrorMessage } from '../../lib/apiError';
import Avatar from './Avatar';
import './account.css';

const LANGUAGE_OPTIONS = [
  { value: 'es' as const, label: 'Español' },
  { value: 'en' as const, label: 'English' },
];

type Props = {
  open: boolean;
  onClose: () => void;
};

type StatusMsg = { type: 'ok' | 'err'; text: string } | null;

/**
 * Modal overlay version of the account page — opened from the topbar avatar
 * dropdown's "Profile" item. Identity header on top (avatar + name + role
 * badge), then three independently-saveable sections below:
 *
 * <ol>
 *   <li><b>Profile</b> — editable display name + its Save button. Pushes the
 *       name to Kinde stock fields ({@code first_name}/{@code last_name}).</li>
 *   <li><b>Preferences</b> — UI language picker. Pushes to Kinde Property
 *       {@code language}.</li>
 *   <li><b>Sign-in</b> — email shown read-only + a single CTA that opens
 *       Kinde's hosted account page in a new tab so the user can change email,
 *       password, MFA and active sessions without losing app state. Kinde
 *       doesn't expose MFA via its Management or Account API (see
 *       {@code docs/MIGRATION_CLERK_TO_KINDE.md}), so this is the cleanest
 *       path — the user stays signed in throughout.</li>
 * </ol>
 *
 * <p>Each section's Save button is scoped to the field(s) directly above it.
 * The role isn't editable anywhere (not even in Kinde), so it lives as a
 * subtle badge in the identity header instead of as a read-only form field.
 * Sign-out lives in the avatar dropdown menu (see {@link AccountMenu}),
 * not in here.
 *
 * <p>Built on the generic {@link Modal} primitive so it gets backdrop, ESC-to-
 * close, focus trapping, body-scroll lock, and the entrance animation for free.
 */
export default function AccountModal({ open, onClose }: Readonly<Props>) {
  const { t, i18n } = useTranslation();
  const { data: user, isLoading } = useCurrentUser();
  const { generatePortalUrl } = useKindeAuth();
  const updateProfile = useUpdateProfile();

  // Email + picture come from the backend (which composes them from Kinde stock fields
  // server-side) rather than from `useKindeAuth().user`. Single source of truth — the
  // frontend never reads Kinde claims directly for profile data, only for auth state.
  const email = user?.email ?? '';
  const picture = user?.picture ?? null;

  // Loading state for the Kinde-portal button — the SDK call hits Kinde's API to mint
  // a one-time portal URL, so on a slow connection it can take a beat. Disabling the
  // button during the request keeps the user from firing multiple windows.
  const [portalOpening, setPortalOpening] = useState(false);

  /**
   * Opens Kinde's hosted account page in a new tab so the user can manage password,
   * MFA, and active sessions without losing app state. We bypass the SDK's
   * `<PortalLink>` component (which forces same-tab navigation) and call
   * `generatePortalUrl` directly, then `window.open(..., '_blank')`.
   *
   * <p>{@code subNav} is omitted on purpose: Kinde's enum only exposes {@code profile}
   * as a useful target and lands on the same page as the default anyway, so passing
   * it adds a typed-enum import for no behavioural gain. {@code returnUrl} only
   * matters if the user returns via Kinde's in-page "back" button rather than
   * closing the tab; we pass the current href as a sensible default.
   */
  async function openKindePortal() {
    if (portalOpening) return;
    setPortalOpening(true);
    try {
      const result = await generatePortalUrl({
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

  // Two independent forms (Profile + Preferences) → two pieces of state +
  // two status messages. They share the same `useUpdateProfile` mutation
  // because the backend endpoint accepts both fields, but the UX is
  // cleaner with separate save buttons that only touch the section's own
  // concern.
  const [name, setName] = useState('');
  const [profileMsg, setProfileMsg] = useState<StatusMsg>(null);
  const [language, setLanguage] = useState<'es' | 'en'>('es');
  const [prefsMsg, setPrefsMsg] = useState<StatusMsg>(null);

  // Mirror the API row into local state once it arrives, and whenever a
  // different user lands (logout → login as someone else without remount).
  useEffect(() => {
    if (user?.id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync API-owned profile fields into editable local state when the row identity changes
      setName(user.name ?? '');
      setLanguage((user.language as 'es' | 'en') ?? 'es');
    }
  }, [user?.id, user?.name, user?.language]);

  // Clear any lingering status messages when the modal is dismissed and
  // reopened — keeps "Saved!" from a previous session from carrying over.
  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset transient status banners on close
      setProfileMsg(null);
      setPrefsMsg(null);
    }
  }, [open]);

  async function handleProfileSubmit(e: React.FormEvent) {
    e.preventDefault();
    setProfileMsg(null);
    try {
      await updateProfile.mutateAsync({ name: name.trim() });
      setProfileMsg({ type: 'ok', text: t('account.profile.successMsg') });
    } catch (err) {
      setProfileMsg({
        type: 'err',
        text: extractApiErrorMessage(err, t('account.profile.errorMsg')),
      });
    }
  }

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
      <header className="account-modal-header">
        <p className="account-modal-eyebrow">{t('account.eyebrow')}</p>
        <h2 className="modal-title">{t('account.title')}</h2>
      </header>

      {isLoading ? (
        <p className="account-modal-loading">{t('account.loading')}</p>
      ) : (
        <>
          {/* Identity block — avatar + name + role badge. No editable inputs
              here: this is just "who you are". Email used to live as a small
              subtitle under the name; it now has its own field in the sign-in
              section below, so keeping it here too would be duplicate. */}
          <div className="account-modal-identity">
            <Avatar src={picture} name={user?.name ?? null} size={64} />
            <div className="account-modal-identity-text">
              <p className="account-modal-identity-name">
                {user?.name?.trim() || t('account.profile.namePlaceholder')}
                {user?.role && (
                  <span className="account-modal-role-badge">
                    {t(`account.roles.${user.role}`)}
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* PROFILE — just the editable name field + its save button, so the
              CTA's scope is obvious (it only affects what's directly above it). */}
          <section className="account-modal-section">
            <h3 className="account-modal-section-title">{t('account.profile.title')}</h3>
            <form onSubmit={handleProfileSubmit} className="account-modal-form">
              <div className="account-modal-field">
                <label htmlFor="account-modal-name">{t('account.profile.name')}</label>
                <input
                  id="account-modal-name"
                  type="text"
                  value={name}
                  placeholder={t('account.profile.namePlaceholder')}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={255}
                />
              </div>
              {profileMsg && (
                <p className={`account-modal-msg account-modal-msg--${profileMsg.type}`}>
                  {profileMsg.text}
                </p>
              )}
              <div className="account-modal-section-actions">
                <button
                  type="submit"
                  className="modal-btn modal-btn--primary"
                  disabled={updateProfile.isPending || name.trim() === (user?.name ?? '').trim()}
                >
                  {updateProfile.isPending
                    ? t('account.profile.saving')
                    : t('account.profile.save')}
                </button>
              </div>
            </form>
          </section>

          {/* PREFERENCES — UI language */}
          <section className="account-modal-section">
            <h3 className="account-modal-section-title">{t('account.preferences.title')}</h3>
            <form onSubmit={handlePrefsSubmit} className="account-modal-form">
              <div className="account-modal-field">
                <label htmlFor="account-modal-language">
                  {t('account.preferences.language')}
                </label>
                <select
                  id="account-modal-language"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as 'es' | 'en')}
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

          {/* SIGN-IN — email shown read-only (it's Kinde-managed) + a single
              CTA that opens Kinde's hosted account page in a new tab to change
              email / password / MFA / sessions. Grouping email with the Kinde
              button (instead of in the Profile section above) keeps each
              section's CTA scoped to what's directly above it. */}
          <section className="account-modal-section">
            <h3 className="account-modal-section-title">{t('account.signIn.title')}</h3>
            <div className="account-modal-form">
              <div className="account-modal-field">
                <label htmlFor="account-modal-email">{t('account.signIn.email')}</label>
                <input
                  id="account-modal-email"
                  className="account-modal-input--readonly"
                  value={email}
                  placeholder={t('account.signIn.emailPlaceholder')}
                  readOnly
                />
              </div>
              <div className="account-modal-section-actions">
                <button
                  type="button"
                  className="modal-btn"
                  onClick={() => {
                    void openKindePortal();
                  }}
                  disabled={portalOpening}
                >
                  {portalOpening
                    ? t('account.signIn.opening')
                    : t('account.signIn.openPortal')}
                </button>
              </div>
            </div>
          </section>
        </>
      )}
    </Modal>
  );
}
