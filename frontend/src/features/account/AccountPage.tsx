import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCurrentUser, useResendVerificationEmail } from '../../hooks/useAuth';
import { useUpdateProfile, useChangePassword } from '../../hooks/useAccount';
import { extractApiErrorMessage } from '../../lib/apiError';
import './account.css';

const LANGUAGE_OPTIONS = [
  { value: 'es', label: 'Español' },
  { value: 'en', label: 'English' },
];

export default function AccountPage() {
  const { t, i18n } = useTranslation();
  const { data: user, isLoading } = useCurrentUser();
  const updateProfile = useUpdateProfile();
  const changePassword = useChangePassword();
  const resendVerification = useResendVerificationEmail();
  const [verifyMsg, setVerifyMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  async function handleResendVerification() {
    setVerifyMsg(null);
    try {
      await resendVerification.mutateAsync();
      setVerifyMsg({ type: 'ok', text: t('account.verify.resendSuccess') });
    } catch (err) {
      setVerifyMsg({ type: 'err', text: extractApiErrorMessage(err, t('account.verify.resendError')) });
    }
  }

  const [name, setName] = useState('');
  const [language, setLanguage] = useState<'es' | 'en'>('es');
  const [profileMsg, setProfileMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [syncedUserId, setSyncedUserId] = useState<string | undefined>(undefined);
  if (user && user.id !== syncedUserId) {
    setSyncedUserId(user.id);
    setName(user.name ?? '');
    setLanguage((user.language as 'es' | 'en') ?? 'es');
  }

  async function handleProfileSubmit(e: React.FormEvent) {
    e.preventDefault();
    setProfileMsg(null);
    try {
      await updateProfile.mutateAsync({ name: name.trim() || undefined, language });
      i18n.changeLanguage(language);
      setProfileMsg({ type: 'ok', text: t('account.profile.successMsg') });
    } catch (err) {
      setProfileMsg({ type: 'err', text: extractApiErrorMessage(err, t('account.profile.errorMsg')) });
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPasswordMsg(null);
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: 'err', text: t('account.security.mismatchMsg') });
      return;
    }
    try {
      await changePassword.mutateAsync({ currentPassword, newPassword });
      setPasswordMsg({ type: 'ok', text: t('account.security.successMsg') });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPasswordMsg({ type: 'err', text: extractApiErrorMessage(err, t('account.security.errorMsg')) });
    }
  }

  if (isLoading) return <div className="loading-screen">{t('account.loading')}</div>;

  return (
    <div className="account-page">
      <nav className="account-nav">
        <div className="account-nav-left">
          <Link to="/dashboard" className="btn-back-nav">{t('account.backToDashboard')}</Link>
          <span className="account-nav-title">{t('account.title')}</span>
        </div>
      </nav>

      <div className="account-content">
        {/* Banner cuando el correo no está verificado */}
        {user && !user.emailVerified && (
          <div className="account-verify-banner" role="status">
            <p className="account-verify-banner-text">{t('account.verify.bannerText')}</p>
            <div className="account-verify-banner-actions">
              <button
                type="button"
                className="btn-verify-resend"
                onClick={handleResendVerification}
                disabled={resendVerification.isPending}
              >
                {resendVerification.isPending ? t('account.verify.resending') : t('account.verify.resendBtn')}
              </button>
              {verifyMsg && (
                <p className={`account-verify-feedback account-verify-feedback--${verifyMsg.type}`}>
                  {verifyMsg.text}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Perfil */}
        <section className="account-section">
          <h2 className="account-section-title">{t('account.profile.title')}</h2>
          <form className="account-form" onSubmit={handleProfileSubmit}>
            <div className="account-field">
              <label className="account-label">{t('account.profile.email')}</label>
              <input
                className="account-input account-input--readonly"
                value={user?.email ?? ''}
                readOnly
                aria-label={t('account.profile.email')}
              />
              {user && (
                <div className="account-verify-row">
                  <span
                    className={`account-verify-pill account-verify-pill--${user.emailVerified ? 'ok' : 'pending'}`}
                  >
                    {user.emailVerified ? t('account.verify.statusVerified') : t('account.verify.statusPending')}
                  </span>
                </div>
              )}
            </div>
            <div className="account-field">
              <label className="account-label">{t('account.profile.name')}</label>
              <input
                className="account-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('account.profile.namePlaceholder')}
                aria-label={t('account.profile.name')}
              />
            </div>
            <div className="account-field">
              <label className="account-label">{t('account.profile.role')}</label>
              <input
                className="account-input account-input--readonly"
                value={t(`account.roles.${user?.role ?? 'USER'}`)}
                readOnly
                aria-label={t('account.profile.role')}
              />
            </div>
            {profileMsg && (
              <p className={`account-msg account-msg--${profileMsg.type}`}>{profileMsg.text}</p>
            )}
            <button type="submit" className="btn-account-save" disabled={updateProfile.isPending}>
              {updateProfile.isPending ? t('account.profile.saving') : t('account.profile.save')}
            </button>
          </form>
        </section>

        {/* Preferencias */}
        <section className="account-section">
          <h2 className="account-section-title">{t('account.preferences.title')}</h2>
          <form className="account-form" onSubmit={handleProfileSubmit}>
            <div className="account-field">
              <label className="account-label">{t('account.preferences.language')}</label>
              <select
                className="account-input account-select"
                value={language}
                onChange={(e) => setLanguage(e.target.value as 'es' | 'en')}
                aria-label={t('account.preferences.language')}
              >
                {LANGUAGE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn-account-save" disabled={updateProfile.isPending}>
              {updateProfile.isPending ? t('account.preferences.saving') : t('account.preferences.save')}
            </button>
          </form>
        </section>

        {/* Seguridad */}
        <section className="account-section">
          <h2 className="account-section-title">{t('account.security.title')}</h2>
          <form className="account-form" onSubmit={handlePasswordSubmit}>
            <div className="account-field">
              <label className="account-label">{t('account.security.currentPassword')}</label>
              <input
                type="password"
                className="account-input"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="••••••••"
                aria-label={t('account.security.currentPassword')}
                required
              />
            </div>
            <div className="account-field">
              <label className="account-label">{t('account.security.newPassword')}</label>
              <input
                type="password"
                className="account-input"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={t('account.security.newPasswordPlaceholder')}
                aria-label={t('account.security.newPassword')}
                minLength={8}
                required
              />
            </div>
            <div className="account-field">
              <label className="account-label">{t('account.security.confirmPassword')}</label>
              <input
                type="password"
                className="account-input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t('account.security.confirmPasswordPlaceholder')}
                aria-label={t('account.security.confirmPassword')}
                required
              />
            </div>
            {passwordMsg && (
              <p className={`account-msg account-msg--${passwordMsg.type}`}>{passwordMsg.text}</p>
            )}
            <button type="submit" className="btn-account-save" disabled={changePassword.isPending}>
              {changePassword.isPending ? t('account.security.saving') : t('account.security.save')}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
