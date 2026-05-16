import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PortalLink } from '@kinde-oss/kinde-auth-react/components';
import Modal from '../../components/Modal';
import { useUpdateProfile } from '../../hooks/useAccount';
import { useCurrentUser, useLogout } from '../../hooks/useAuth';
import { extractApiErrorMessage } from '../../lib/apiError';
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
 * button. Four sections, top to bottom:
 *
 * <ol>
 *   <li><b>Profile</b> — editable display name + role (readonly). Name change
 *       is pushed to Kinde via the Management API by the backend before the
 *       local row is saved (see {@code UserService.updateProfile}), so a
 *       Kinde failure surfaces here as a save error rather than silent
 *       eventual divergence.</li>
 *   <li><b>Manage account</b> — link out to Kinde's hosted portal for email,
 *       password, MFA, and active sessions (Kinde does not expose those
 *       flows via the SDK because they require verification UI).</li>
 *   <li><b>Preferences</b> — UI language picker. Saved separately from
 *       Profile so flipping language doesn't require touching the name field.</li>
 *   <li><b>Sign out</b> — calls Kinde's logout, which redirects to the
 *       configured logout URI.</li>
 * </ol>
 *
 * <p>Built on the generic {@link Modal} primitive so it gets backdrop, ESC-to-
 * close, focus trapping, body-scroll lock, and the entrance animation for free.
 */
export default function AccountModal({ open, onClose }: Readonly<Props>) {
  const { t, i18n } = useTranslation();
  const { data: user, isLoading } = useCurrentUser();
  const updateProfile = useUpdateProfile();
  const logout = useLogout();

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
      setName(user.name ?? '');
      setLanguage((user.language as 'es' | 'en') ?? 'es');
    }
  }, [user?.id, user?.name, user?.language]);

  // Clear any lingering status messages when the modal is dismissed and
  // reopened — keeps "Saved!" from a previous session from carrying over.
  useEffect(() => {
    if (!open) {
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
          {/* PROFILE — name (editable, pushed to Kinde) + role (readonly) */}
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
              <div className="account-modal-field">
                <label htmlFor="account-modal-role">{t('account.profile.role')}</label>
                <input
                  id="account-modal-role"
                  className="account-modal-input--readonly"
                  value={t(`account.roles.${user?.role ?? 'USER'}`)}
                  readOnly
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

          {/* MANAGE ACCOUNT — out to Kinde portal for email / password / MFA */}
          <section className="account-modal-section">
            <h3 className="account-modal-section-title">{t('account.manageAccount.title')}</h3>
            <p className="account-modal-section-desc">{t('account.manageAccount.description')}</p>
            <div className="account-modal-section-actions">
              <PortalLink className="modal-btn">
                {t('account.manageAccount.openPortal')}
              </PortalLink>
            </div>
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

          {/* SIGN OUT */}
          <section className="account-modal-section">
            <h3 className="account-modal-section-title">{t('account.signOut.title')}</h3>
            <p className="account-modal-section-desc">{t('account.signOut.description')}</p>
            <div className="account-modal-section-actions">
              <button
                type="button"
                className="modal-btn modal-btn--danger"
                onClick={() => {
                  onClose();
                  void logout();
                }}
              >
                {t('account.signOut.button')}
              </button>
            </div>
          </section>
        </>
      )}
    </Modal>
  );
}
