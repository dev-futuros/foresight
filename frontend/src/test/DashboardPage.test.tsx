import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from './renderWithProviders';
import DashboardPage from '../features/dashboard/DashboardPage';
import type { ReportSummary } from '../types/api';

// Tests render DashboardPage in isolation (no shell). Brand / topbar / logout
// live in features/shell and are exercised by their own tests.

const mockMutate = vi.fn();

// DashboardPage pulls a handful of hooks from useReports / useExamples / useAuth /
// TranslationsContext. We mock the surface area each one needs so the component
// renders without standing up a real query client / Kinde provider. Inlined
// `{ mutate, mutateAsync, isPending }` stubs because vi.mock factories are hoisted
// above top-level const declarations and can't reference local helpers.
vi.mock('../features/report/api', () => ({
  useReports: vi.fn(),
  useReport: () => ({ data: undefined, isLoading: false }),
  useCreateReport: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useUpdateReport: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useDeleteReport: () => ({ mutate: mockMutate }),
  useDeleteTranslation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useTranslateReport: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  translateReportStream: vi.fn(),
}));
vi.mock('../features/examples/api', () => ({
  useExamples: () => ({ data: undefined, isLoading: false, isError: false }),
  useExample: () => ({ data: undefined, isLoading: false }),
  usePromoteToExample: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useDemoteExample: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useDeleteExample: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useTranslateExample: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useDeleteExampleTranslation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('../hooks/useAuth', () => ({
  useIsDev: () => false,
  useCurrentUser: () => ({ data: undefined, isLoading: false }),
  useLogout: () => vi.fn(),
}));

import { useReports } from '../features/report/api';

/** Default the new ReportSummary translation fields so individual tests
 *  don't have to spell them out. Every fixture is treated as a Spanish
 *  primary, no extra translations. */
const summary = (
  s: Omit<ReportSummary, 'primaryLanguage' | 'availableLanguages'>,
): ReportSummary => ({
  ...s,
  primaryLanguage: 'es',
  availableLanguages: ['es'],
});

const mockPage = (reports: ReportSummary[] = []) =>
  ({
    data: { content: reports, totalElements: reports.length, totalPages: 1, size: 20, number: 0 },
    isLoading: false,
    isError: false,
     
  }) as any;

describe('DashboardPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows empty state when no reports', () => {
    vi.mocked(useReports).mockReturnValue(mockPage() as ReturnType<typeof useReports>);
    renderWithProviders(<DashboardPage />);

    expect(screen.getByText(/aún no hay informes guardados/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /nuevo informe/i })).toBeInTheDocument();
  });

  it('shows loading state', () => {
    vi.mocked(useReports).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as ReturnType<typeof useReports>);
    renderWithProviders(<DashboardPage />);

    expect(screen.getByText(/cargando informes/i)).toBeInTheDocument();
  });

  it('shows error state', () => {
    vi.mocked(useReports).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as ReturnType<typeof useReports>);
    renderWithProviders(<DashboardPage />);

    expect(screen.getByText(/error al cargar/i)).toBeInTheDocument();
  });

  it('renders report cards with title and status', () => {
    vi.mocked(useReports).mockReturnValue(
      mockPage([
        summary({
          id: 'r1',
          title: 'Informe Q1 2026',
          status: 'COMPLETED',
          createdAt: '2026-04-01T10:00:00Z',
          updatedAt: '2026-04-01T10:00:00Z',
        }),
        summary({
          id: 'r2',
          title: 'Informe Q2 2026',
          status: 'DRAFT',
          createdAt: '2026-04-10T10:00:00Z',
          updatedAt: '2026-04-10T10:00:00Z',
        }),
      ]) as ReturnType<typeof useReports>,
    );

    renderWithProviders(<DashboardPage />);

    expect(screen.getByText('Informe Q1 2026')).toBeInTheDocument();
    expect(screen.getByText('Informe Q2 2026')).toBeInTheDocument();
    expect(screen.getByText('Completado')).toBeInTheDocument();
    expect(screen.getByText('Borrador')).toBeInTheDocument();
  });

  it('renders the four stat cards once data is loaded', () => {
    vi.mocked(useReports).mockReturnValue(
      mockPage([
        summary({
          id: 'r1',
          title: 'A',
          status: 'COMPLETED',
          createdAt: '2026-04-01T10:00:00Z',
          updatedAt: '2026-04-01T10:00:00Z',
        }),
        summary({
          id: 'r2',
          title: 'B',
          status: 'DRAFT',
          createdAt: '2026-04-10T10:00:00Z',
          updatedAt: '2026-04-10T10:00:00Z',
        }),
        summary({
          id: 'r3',
          title: 'C',
          status: 'PROCESSING',
          createdAt: '2026-04-11T10:00:00Z',
          updatedAt: '2026-04-11T10:00:00Z',
        }),
        summary({
          id: 'r4',
          title: 'D',
          status: 'FAILED',
          createdAt: '2026-04-12T10:00:00Z',
          updatedAt: '2026-04-12T10:00:00Z',
        }),
      ]) as ReturnType<typeof useReports>,
    );

    renderWithProviders(<DashboardPage />);

    // Labels for the four stats
    expect(screen.getByText(/informes generados/i)).toBeInTheDocument();
    expect(screen.getByText(/^completados$/i)).toBeInTheDocument();
    expect(screen.getByText(/en progreso/i)).toBeInTheDocument();
    expect(screen.getByText(/con error/i)).toBeInTheDocument();
  });

  it('nuevo informe link points to /reports/new', () => {
    vi.mocked(useReports).mockReturnValue(mockPage() as ReturnType<typeof useReports>);
    renderWithProviders(<DashboardPage />);

    expect(screen.getByRole('link', { name: /nuevo informe/i })).toHaveAttribute(
      'href',
      '/reports/new',
    );
  });
});
