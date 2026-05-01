import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from './renderWithProviders';
import RegisterPage from '../features/auth/RegisterPage';

const mockMutateAsync = vi.fn();
vi.mock('../hooks/useAuth', () => ({
  useRegister: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
    error: null,
  }),
  useCurrentUser: () => ({ data: null, isLoading: false }),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

describe('RegisterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMutateAsync.mockResolvedValue({});
  });

  it('renders all fields', () => {
    renderWithProviders(<RegisterPage />);
    expect(screen.getByLabelText(/nombre/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/correo electrónico/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Contraseña')).toBeInTheDocument();
  });

  it('submits with required fields and defaults language to es', async () => {
    renderWithProviders(<RegisterPage />);

    fireEvent.change(screen.getByLabelText(/correo electrónico/i), {
      target: { value: 'bob@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Contraseña'), {
      target: { value: 'securepass' },
    });
    fireEvent.click(screen.getByRole('button', { name: /crear cuenta/i }));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        name: '',
        email: 'bob@example.com',
        password: 'securepass',
        language: 'es',
      });
    });
  });

  it('navigates to /dashboard on success', async () => {
    renderWithProviders(<RegisterPage />);

    fireEvent.change(screen.getByLabelText(/correo electrónico/i), {
      target: { value: 'bob@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Contraseña'), {
      target: { value: 'securepass' },
    });
    fireEvent.click(screen.getByRole('button', { name: /crear cuenta/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('shows link to login page', () => {
    renderWithProviders(<RegisterPage />);
    expect(screen.getByRole('link', { name: /iniciar sesión/i })).toBeInTheDocument();
  });
});
