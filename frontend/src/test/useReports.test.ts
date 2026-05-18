import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { useReports, useCreateReport, useDeleteReport } from '../hooks/useReports';
import api from '../lib/api';

vi.mock('../lib/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

describe('useReports', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetches reports with correct params', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: { content: [], totalElements: 0, totalPages: 0, size: 20, number: 0 },
    });

    const { result } = renderHook(() => useReports(), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.get).toHaveBeenCalledWith('/reports', {
      params: { page: 0, size: 20, sort: 'createdAt,desc' },
    });
  });

  it('returns empty content when no reports', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: { content: [], totalElements: 0, totalPages: 0, size: 20, number: 0 },
    });

    const { result } = renderHook(() => useReports(), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.content).toHaveLength(0);
    expect(result.current.data?.totalElements).toBe(0);
  });

  it('returns reports list when data exists', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: {
        content: [
          {
            id: 'r1',
            title: 'Informe Q1',
            status: 'DRAFT',
            createdAt: '2026-04-01T00:00:00Z',
            updatedAt: '2026-04-01T00:00:00Z',
          },
        ],
        totalElements: 1,
        totalPages: 1,
        size: 20,
        number: 0,
      },
    });

    const { result } = renderHook(() => useReports(), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.content).toHaveLength(1);
    expect(result.current.data?.content[0].title).toBe('Informe Q1');
  });
});

describe('useCreateReport', () => {
  beforeEach(() => vi.clearAllMocks());

  it('posts to /reports with correct body', async () => {
    const mockReport = {
      id: 'new-uuid',
      title: 'Nuevo informe',
      status: 'DRAFT',
      inputData: {},
      resultData: null,
      createdAt: '2026-04-21T00:00:00Z',
      updatedAt: '2026-04-21T00:00:00Z',
    };
    vi.mocked(api.post).mockResolvedValue({ data: mockReport });
    vi.mocked(api.get).mockResolvedValue({
      data: { content: [], totalElements: 0, totalPages: 0, size: 20, number: 0 },
    });

    const { result } = renderHook(() => useCreateReport(), { wrapper: wrapper() });

    await result.current.mutateAsync({
      title: 'Nuevo informe',
      inputData: { companyProfile: { name: 'Test' } },
    });

    expect(api.post).toHaveBeenCalledWith('/reports', {
      title: 'Nuevo informe',
      inputData: { companyProfile: { name: 'Test' } },
    });
  });

  it('returns the created report with id', async () => {
    const mockReport = {
      id: 'new-uuid',
      title: 'Nuevo informe',
      status: 'DRAFT',
      inputData: {},
      resultData: null,
      createdAt: '2026-04-21T00:00:00Z',
      updatedAt: '2026-04-21T00:00:00Z',
    };
    vi.mocked(api.post).mockResolvedValue({ data: mockReport });
    vi.mocked(api.get).mockResolvedValue({
      data: { content: [], totalElements: 0, totalPages: 0, size: 20, number: 0 },
    });

    const { result } = renderHook(() => useCreateReport(), { wrapper: wrapper() });
    const created = await result.current.mutateAsync({
      title: 'Nuevo informe',
      inputData: {},
    });

    expect(created.id).toBe('new-uuid');
    expect(created.status).toBe('DRAFT');
  });
});

describe('useDeleteReport', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls DELETE /reports/:id', async () => {
    vi.mocked(api.delete).mockResolvedValue({});
    vi.mocked(api.get).mockResolvedValue({
      data: { content: [], totalElements: 0, totalPages: 0, size: 20, number: 0 },
    });

    const { result } = renderHook(() => useDeleteReport(), { wrapper: wrapper() });
    await result.current.mutateAsync('report-uuid');

    expect(api.delete).toHaveBeenCalledWith('/reports/report-uuid');
  });
});
