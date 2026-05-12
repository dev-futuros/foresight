import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUpdateProfile } from '../../hooks/useAccount';
import { useCurrentUser } from '../../hooks/useAuth';
import { extractApiErrorMessage } from '../../lib/apiError';

const LANGUAGE_OPTIONS = [
  { value: 'es' as const, label: 'Español' },
  { value: 'en' as const, label: 'English' },
];

/**
 * App-specific preferences slotted into Clerk's UserProfile modal as a
 * custom page (label "Preferences", url segment "preferences"). Reuses
 * the same hooks the on-page Preferences card uses
 * ({@link useCurrentUser}, {@link useUpdateProfile}) — Clerk renders this
 * inside our React tree so providers and the query client resolve
 * normally. The save flow mirrors the on-page form: persist via the
 * API, then bounce the client-side i18n locale so the new language
 * takes effect without a reload.
 */
export default function ClerkPreferencesPage() {
  const { t, i18n } = useTranslation();
  const { data: user } = useCurrentUser();
  const updateProfile = useUpdateProfile();

  const [language, setLanguage] = useState<'es' | 'en'>(
    (user?.language as 'es' | 'en') ?? 'es',
  );
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  // Mirror updates from the API into local state when the row first lands.
  const [syncedUserId, setSyncedUserId] = useState<string | undefined>(undefined);
  if (user && user.id !== syncedUserId) {
    setSyncedUserId(user.id);
    setLanguage((user.language as 'es' | 'en') ?? 'es');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      await updateProfile.mutateAsync({ language });
      await i18n.changeLanguage(language);
      setMsg({
        type: 'ok',
        text: i18n.t('account.preferences.successMsg', { lng: language }),
      });
    } catch (err) {
      setMsg({
        type: 'err',
        text: extractApiErrorMessage(
          err,
          i18n.t('account.preferences.errorMsg', { lng: language }),
        ),
      });
    }
  }

  return (
    <div className="clerk-custom-page">
      <h1 className="clerk-custom-page-title">{t('account.preferences.title')}</h1>
      <form onSubmit={handleSubmit} className="clerk-custom-page-form">
        <div className="field">
          <label htmlFor="clerk-prefs-lang">{t('account.preferences.language')}</label>
          <select
            id="clerk-prefs-lang"
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
        {/* Role — read-only. Moved here from the retired /account page;
            still useful for the user to know which role grants them
            access to dev-only affordances (promote example, etc.). */}
        <div className="field">
          <label htmlFor="clerk-prefs-role">{t('account.profile.role')}</label>
          <input
            id="clerk-prefs-role"
            className="account-input--readonly"
            value={t(`account.roles.${user?.role ?? 'USER'}`)}
            readOnly
          />
        </div>
        {msg && <p className={`account-msg account-msg--${msg.type}`}>{msg.text}</p>}
        <div className="account-actions">
          <button type="submit" className="btn btn-primary" disabled={updateProfile.isPending}>
            {updateProfile.isPending
              ? t('account.preferences.saving')
              : t('account.preferences.save')}
          </button>
        </div>
      </form>
    </div>
  );
}
