import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from './renderWithProviders';
import ProtectedRoute from '../components/ProtectedRoute';

vi.mock('../hooks/useAuth', () => ({
  useCurrentUser: vi.fn(),
}));

import { useCurrentUser } from '../hooks/useAuth';

describe('ProtectedRoute', () => {
  it('shows loading state while fetching user', () => {
    vi.mocked(useCurrentUser).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof useCurrentUser>);

    renderWithProviders(
      <ProtectedRoute><div>Contenido protegido</div></ProtectedRoute>
    );

    expect(screen.getByText(/cargando/i)).toBeInTheDocument();
    expect(screen.queryByText(/contenido protegido/i)).not.toBeInTheDocument();
  });

  it('redirects to /login when no user', () => {
    vi.mocked(useCurrentUser).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useCurrentUser>);

    renderWithProviders(
      <ProtectedRoute><div>Contenido protegido</div></ProtectedRoute>,
      { initialEntries: ['/dashboard'] }
    );

    expect(screen.queryByText(/contenido protegido/i)).not.toBeInTheDocument();
  });

  it('renders children when user is authenticated', () => {
    vi.mocked(useCurrentUser).mockReturnValue({
      data: {
        id: 'uuid-1',
        email: 'alice@example.com',
        name: 'Alice',
        role: 'USER',
        language: 'es',
        emailVerified: true,
      },
      isLoading: false,
    } as ReturnType<typeof useCurrentUser>);

    renderWithProviders(
      <ProtectedRoute><div>Contenido protegido</div></ProtectedRoute>
    );

    expect(screen.getByText(/contenido protegido/i)).toBeInTheDocument();
  });
});
