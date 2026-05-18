import { useEffect } from 'react';
import { useKindeAuth } from '@kinde-oss/kinde-auth-react';
import { useTranslation } from 'react-i18next';
import { LOGOUT_IN_PROGRESS_KEY } from '../features/account/api';

/**
 * Route guard that defers to Kinde for the auth check.
 *
 * Three states:
 *   - Kinde hasn't finished hydrating: render a loading screen so we
 *     don't flicker through anything visible while a valid session is
 *     being restored on a hard reload.
 *   - Hydrated and signed-in: render the children.
 *   - Hydrated and signed-out: trigger Kinde's hosted login flow
 *     directly — UNLESS a logout is in progress (see below).
 *
 * <p><b>Language forwarding:</b> if the URL has `?lang=`, pass it
 * through to Kinde's `login()` so the hosted auth page renders in the
 * requested language. Catalan → Polish hijack matches the
 * foresight-kinde reverse mapping.
 *
 * <p><b>Logout-in-progress guard:</b> the Kinde SDK's `logout()` flips
 * `isAuthenticated` to false synchronously, a render frame before its
 * actual `/logout` redirect lands. Without the flag check, this effect
 * would fire `login()` in that gap, win the race against the logout
 * redirect, and Kinde would silently re-authenticate the user from the
 * still-active session cookie — making logout appear broken. The flag
 * is set in `useLogout` and cleared in `LoggedOutRoute`. See the
 * comment on `LOGOUT_IN_PROGRESS_KEY` for the full story.
 */
export default function ProtectedRoute({ children }: Readonly<{ children: React.ReactNode }>) {
  const { t } = useTranslation();
  const { isLoading, isAuthenticated, login } = useKindeAuth();

  useEffect(() => {
    if (isLoading || isAuthenticated) return;
    if (sessionStorage.getItem(LOGOUT_IN_PROGRESS_KEY)) return;
    const urlLang = new URLSearchParams(globalThis.location.search).get('lang');
    const kindeLang = urlLang === 'ca' ? 'pl' : urlLang;
    void login(kindeLang ? { lang: kindeLang } : undefined);
  }, [isLoading, isAuthenticated, login]);

  if (isLoading || !isAuthenticated) {
    return <div className="loading-screen">{t('common.loading')}</div>;
  }

  return <>{children}</>;
}
