import { useState } from 'react';
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
  /* Email lives in Clerk, not in our DB. Read it from Clerk's useUser() so the field stays
     in sync with whatever the user updated in their Clerk profile (via <UserButton />). */
  const { user: clerkUser } = useUser();
  const updateProfile = useUpdateProfile();

  const [name, setName] = useState('');
  const [language, setLanguage] = useState<'es' | 'en'>('es');
  const [profileMsg, setProfileMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [preferencesMsg, setPreferencesMsg] = useState<{
    type: 'ok' | 'err';
    text: string;
  } | null>(null);

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
      // Profile form only owns the name. Language is owned by the
      // Preferences form below — sending both from here would let an
      // unsaved language change leak in, surprising the user.
      await updateProfile.mutateAsync({ name: name.trim() || undefined });
      setProfileMsg({ type: 'ok', text: t('account.profile.successMsg') });
    } catch (err) {
      setProfileMsg({ type: 'err', text: extractApiErrorMessage(err, t('account.profile.errorMsg')) });
    }
  }

  async function handlePreferencesSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPreferencesMsg(null);
    try {
      await updateProfile.mutateAsync({ language });
      await i18n.changeLanguage(language);
      // The hook's `t` is still bound to the previous render's language at
      // this point (the re-render hasn't fired yet). Use i18n.t with an
      // explicit `lng` so the success message renders in the language the
      // user just picked, not the one they came from.
      setPreferencesMsg({
        type: 'ok',
        text: i18n.t('account.preferences.successMsg', { lng: language }),
      });
    } catch (err) {
      setPreferencesMsg({
        type: 'err',
        text: extractApiErrorMessage(
          err,
          i18n.t('account.preferences.errorMsg', { lng: language }),
        ),
      });
    }
  }

  if (isLoading) return <div className="loading-screen">{t('account.loading')}</div>;

  return (
    <div className="account-page">
      <main className="account-main">
        <header className="account-header">
          <p className="eyebrow">{t('account.eyebrow')}</p>
          <h1 className="page-title">{t('account.title')}</h1>
        </header>

        {/* Avatar — Clerk's UserButton, centered and oversized so it reads
            as a profile photo rather than a tucked-away menu trigger.
            Clicking it still opens Clerk's account modal (email, password,
            2FA, etc.) — the title and descriptor were trimmed since the
            avatar itself is now obviously the entry point. */}
        <div className="account-avatar">
          <UserButton
            appearance={{
              elements: {
                avatarBox: {
                  width: 120,
                  height: 120,
                },
              },
            }}
          />
        </div>

        {/* Profile — local fields (name, role). Email is read-only (lives in Clerk). */}
        <section className="account-card card">
          <div className="card-label">{t('account.profile.title')}</div>
          <form onSubmit={handleProfileSubmit}>
            <div className="field">
              <label htmlFor="acct-email">{t('account.profile.email')}</label>
              <input
                id="acct-email"
                className="account-input--readonly"
                value={clerkUser?.primaryEmailAddress?.emailAddress ?? ''}
                readOnly
              />
            </div>
            <div className="field">
              <label htmlFor="acct-name">{t('account.profile.name')}</label>
              <input
                id="acct-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('account.profile.namePlaceholder')}
              />
            </div>
            <div className="field">
              <label htmlFor="acct-role">{t('account.profile.role')}</label>
              <input
                id="acct-role"
                className="account-input--readonly"
                value={t(`account.roles.${user?.role ?? 'USER'}`)}
                readOnly
              />
            </div>
            {profileMsg && (
              <p className={`account-msg account-msg--${profileMsg.type}`}>{profileMsg.text}</p>
            )}
            <div className="account-actions">
              <button type="submit" className="btn btn-primary" disabled={updateProfile.isPending}>
                {updateProfile.isPending ? t('account.profile.saving') : t('account.profile.save')}
              </button>
            </div>
          </form>
        </section>

        {/* Preferences — language. */}
        <section className="account-card card">
          <div className="card-label">{t('account.preferences.title')}</div>
          <form onSubmit={handlePreferencesSubmit}>
            <div className="field">
              <label htmlFor="acct-lang">{t('account.preferences.language')}</label>
              <select
                id="acct-lang"
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
            {preferencesMsg && (
              <p className={`account-msg account-msg--${preferencesMsg.type}`}>
                {preferencesMsg.text}
              </p>
            )}
            <div className="account-actions">
              <button type="submit" className="btn btn-primary" disabled={updateProfile.isPending}>
                {updateProfile.isPending ? t('account.preferences.saving') : t('account.preferences.save')}
              </button>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}
