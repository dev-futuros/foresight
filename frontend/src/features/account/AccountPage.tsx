import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { UserButton, useUser } from '@clerk/react';
import { useCurrentUser } from '../../hooks/useAuth';
import { useUpdateProfile } from '../../hooks/useAccount';
import { extractApiErrorMessage } from '../../lib/apiError';
import './account.css';

const LANGUAGE_OPTIONS = [
  { value: 'es', label: 'Español' },
  { value: 'en', label: 'English' },
];

export default function AccountPage() {
  const { t, i18n } = useTranslation();
  const { data: user, isLoading } = useCurrentUser();
  // Email lives in Clerk, not in our DB. Read it from Clerk's useUser() so the field stays
  // in sync with whatever the user updated in their Clerk profile (via <UserButton />).
  const { user: clerkUser } = useUser();
  const updateProfile = useUpdateProfile();

  const [name, setName] = useState('');
  const [language, setLanguage] = useState<'es' | 'en'>('es');
  const [profileMsg, setProfileMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

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

  if (isLoading) return <div className="loading-screen">{t('account.loading')}</div>;

  return (
    <div className="account-page">
      <nav className="account-nav">
        <div className="account-nav-left">
          <Link to="/dashboard" className="btn-back-nav">{t('account.backToDashboard')}</Link>
          <span className="account-nav-title">{t('account.title')}</span>
        </div>
        <div className="account-nav-right">
          <UserButton />
        </div>
      </nav>

      <div className="account-content">
        {/* Perfil — campos locales (nombre, idioma, rol). Email y contraseña se gestionan en el menú de Clerk (UserButton). */}
        <section className="account-section">
          <h2 className="account-section-title">{t('account.profile.title')}</h2>
          <form className="account-form" onSubmit={handleProfileSubmit}>
            <div className="account-field">
              <label className="account-label">{t('account.profile.email')}</label>
              <input
                className="account-input account-input--readonly"
                value={clerkUser?.primaryEmailAddress?.emailAddress ?? ''}
                readOnly
                aria-label={t('account.profile.email')}
              />
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
      </div>
    </div>
  );
}
