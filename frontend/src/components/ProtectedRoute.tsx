import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCurrentUser } from '../hooks/useAuth';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { data: user, isLoading } = useCurrentUser();

  if (isLoading) return <div className="loading-screen">{t('common.loading')}</div>;
  if (!user) return <Navigate to="/login" replace />;

  return <>{children}</>;
}
