import { Navigate } from 'react-router-dom';
import { useCurrentUser } from '../hooks/useAuth';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading } = useCurrentUser();

  if (isLoading) return <div className="loading-screen">Cargando...</div>;
  if (!user) return <Navigate to="/login" replace />;

  return <>{children}</>;
}
