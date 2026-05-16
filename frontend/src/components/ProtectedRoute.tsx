import { Navigate } from 'react-router-dom';
import { useKindeAuth } from '@kinde-oss/kinde-auth-react';
import { useTranslation } from 'react-i18next';

/**
 * Route guard that defers to Kinde for the auth check.
 *
 * Three states:
 *   - Kinde hasn't finished hydrating: render a loading screen so we don't flicker the
 *     sign-in page on a hard reload while a valid session is being restored.
 *   - Hydrated and signed-in: render the children.
 *   - Hydrated and signed-out: redirect to /sign-in.
 */
export default function ProtectedRoute({ children }: Readonly<{ children: React.ReactNode }>) {
  const { t } = useTranslation();
  const { isLoading, isAuthenticated } = useKindeAuth();

  if (isLoading) return <div className="loading-screen">{t('common.loading')}</div>;
  if (!isAuthenticated) return <Navigate to="/sign-in" replace />;

  return <>{children}</>;
}
