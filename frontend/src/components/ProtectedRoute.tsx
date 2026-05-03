import { Navigate } from 'react-router-dom';
import { useAuth } from '@clerk/react';
import { useTranslation } from 'react-i18next';

/**
 * Route guard that defers to Clerk for the auth check.
 *
 * Three states:
 *   - Clerk hasn't finished hydrating: render a loading screen so we don't flicker the
 *     sign-in page on a hard reload while a valid session is being restored.
 *   - Hydrated and signed-in: render the children.
 *   - Hydrated and signed-out: redirect to /sign-in.
 */
export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) return <div className="loading-screen">{t('common.loading')}</div>;
  if (!isSignedIn) return <Navigate to="/sign-in" replace />;

  return <>{children}</>;
}
