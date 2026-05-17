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
 *     branded (via the foresight-kinde custom-UI repo).
 *
 * Language is intentionally NOT forwarded here. The homepage is the
 * authoritative source for which language Kinde renders in — the app
 * doesn't (yet) participate in the language handoff. When the post-login
 * profile-read work lands, this guard may need to revisit that.
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
