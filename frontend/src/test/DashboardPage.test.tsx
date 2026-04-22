import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from './renderWithProviders';
import DashboardPage from '../features/dashboard/DashboardPage';
import type { ReportSummary } from '../types/api';

const mockLogout = vi.fn();
const mockMutate = vi.fn();

vi.mock('../hooks/useAuth', () => ({
  useCurrentUser: () => ({
    data: { id: 'uuid-1', email: 'alice@example.com', name: 'Alice', role: 'USER', language: 'es', emailVerified: true },
    isLoading: false,
  }),
  useLogout: () => mockLogout,
}));

vi.mock('../hooks/useReports', () => ({
  useReports: vi.fn(),
  useDeleteReport: () => ({ mutate: mockMutate }),
}));

import { useReports } from '../hooks/useReports';

const mockPage = (reports: ReportSummary[] = []) => ({
  data: { content: reports, totalElements: reports.length, totalPages: 1, size: 20, number: 0 },
  isLoading: false,
  isError: false,
// eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any;

describe('DashboardPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders nav with user name and logout button', () => {
    vi.mocked(useReports).mockReturnValue(mockPage() as ReturnType<typeof useReports>);
    renderWithProviders(<DashboardPage />);

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cerrar sesión/i })).toBeInTheDocument();
  });

  it('shows empty state when no reports', () => {
    vi.mocked(useReports).mockReturnValue(mockPage([]) as ReturnType<typeof useReports>);
    renderWithProviders(<DashboardPage />);

    expect(screen.getByText(/aún no tienes informes/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /crear informe/i })).toBeInTheDocument();
  });

  it('shows loading state', () => {
    vi.mocked(useReports).mockReturnValue({ data: undefined, isLoading: true, isError: false } as ReturnType<typeof useReports>);
    renderWithProviders(<DashboardPage />);

    expect(screen.getByText(/cargando informes/i)).toBeInTheDocument();
  });

  it('shows error state', () => {
    vi.mocked(useReports).mockReturnValue({ data: undefined, isLoading: false, isError: true } as ReturnType<typeof useReports>);
    renderWithProviders(<DashboardPage />);

    expect(screen.getByText(/error al cargar/i)).toBeInTheDocument();
  });

  it('renders report list with title and status badge', () => {
    vi.mocked(useReports).mockReturnValue(mockPage([
      { id: 'r1', title: 'Informe Q1 2026', status: 'COMPLETED', createdAt: '2026-04-01T10:00:00Z', updatedAt: '2026-04-01T10:00:00Z' },
      { id: 'r2', title: 'Informe Q2 2026', status: 'DRAFT',     createdAt: '2026-04-10T10:00:00Z', updatedAt: '2026-04-10T10:00:00Z' },
    ]) as ReturnType<typeof useReports>);

    renderWithProviders(<DashboardPage />);

    expect(screen.getByText('Informe Q1 2026')).toBeInTheDocument();
    expect(screen.getByText('Informe Q2 2026')).toBeInTheDocument();
    expect(screen.getByText('Completado')).toBeInTheDocument();
    expect(screen.getByText('Borrador')).toBeInTheDocument();
  });

  it('calls logout when clicking cerrar sesión', () => {
    vi.mocked(useReports).mockReturnValue(mockPage() as ReturnType<typeof useReports>);
    renderWithProviders(<DashboardPage />);

    fireEvent.click(screen.getByRole('button', { name: /cerrar sesión/i }));
    expect(mockLogout).toHaveBeenCalled();
  });

  it('nuevo informe link points to /reports/new', () => {
    vi.mocked(useReports).mockReturnValue(mockPage() as ReturnType<typeof useReports>);
    renderWithProviders(<DashboardPage />);

    expect(screen.getByRole('link', { name: /nuevo informe/i })).toHaveAttribute('href', '/reports/new');
  });
});
