import { useEffect } from 'react';
import { useKindeAuth } from '@kinde-oss/kinde-auth-react';
import { useTranslation } from 'react-i18next';

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
 * Language passing is deliberately *not* done here. The futuros_lang cookie
 * (scoped to .futuros.io and written by i18next's languagedetector) is the
 * cross-subdomain carrier — Kinde reads it (or falls back to the browser's
 * Accept-Language). Threading authUrlParams.lang through every login() call
 * adds complexity for a marginal edge case (session expiring while the user
 * is mid-flow in a non-default language) and we accept that briefly seeing
 * Kinde in the wrong language is fine, because they'll bounce back to the
 * app where the cookie still carries the correct language.
 */
export default function ProtectedRoute({ children }: Readonly<{ children: React.ReactNode }>) {
  const { t } = useTranslation();
  const { isLoading, isAuthenticated, login } = useKindeAuth();

  useEffect(() => {
    if (isLoading || isAuthenticated) return;
    void login();
  }, [isLoading, isAuthenticated, login]);

  if (isLoading || !isAuthenticated) {
    return <div className="loading-screen">{t('common.loading')}</div>;
  }

  return <>{children}</>;
}
