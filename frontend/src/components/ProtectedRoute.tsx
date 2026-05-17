import { useEffect } from 'react';
import { useKindeAuth } from '@kinde-oss/kinde-auth-react';
import { useTranslation } from 'react-i18next';
import { toKindeLang } from '../lib/kindeLang';

/**
 * Route guard that defers to Kinde for the auth check.
 *
 * Three states:
 *   - Kinde hasn't finished hydrating: render a loading screen so we don't
 *     flicker through anything visible while a valid session is being
 *     restored on a hard reload.
 *   - Hydrated and signed-in: render the children.
 *   - Hydrated and signed-out: trigger Kinde's hosted login flow directly.
 *     No intermediate React splash — Kinde's own pages are themselves
 *     branded (via the foresight-kinde custom-UI repo), so a buffer route
 *     would just be a needless extra click.
 *
 * `authUrlParams.lang` threads the user's current language across the
 * origin boundary into the Kinde-hosted sign-in page so it renders in the
 * locale i18next currently has selected (URL `?lang=`, localStorage, or
 * the browser default — whichever the detector resolved).
 */
export default function ProtectedRoute({ children }: Readonly<{ children: React.ReactNode }>) {
  const { t, i18n } = useTranslation();
  const { isLoading, isAuthenticated, login } = useKindeAuth();

  useEffect(() => {
    if (isLoading || isAuthenticated) return;
    // toKindeLang maps app 'ca' → Kinde 'pl' (our Polish-slot-as-Catalan
    // hijack); other languages pass through unchanged. See kindeLang.ts.
    void login({ authUrlParams: { lang: toKindeLang(i18n.language) } });
  }, [isLoading, isAuthenticated, login, i18n.language]);

  if (isLoading || !isAuthenticated) {
    return <div className="loading-screen">{t('common.loading')}</div>;
  }

  return <>{children}</>;
}
