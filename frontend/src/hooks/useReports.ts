import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import type { CreateReportRequest, Page, ReportResponse, ReportSummary } from '../types/api';

export function useReports(page = 0, size = 20) {
  return useQuery<Page<ReportSummary>>({
    queryKey: ['reports', page, size],
    queryFn: async () => {
      const res = await api.get<Page<ReportSummary>>('/reports', {
        params: { page, size, sort: 'createdAt,desc' },
      });
      return res.data;
    },
  });
}

export function useReport(id: string) {
  return useQuery<ReportResponse>({
    queryKey: ['reports', id],
    queryFn: async () => {
      const res = await api.get<ReportResponse>(`/reports/${id}`);
      return res.data;
    },
    enabled: !!id,
  });
}

export function useCreateReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateReportRequest) => {
      const res = await api.post<ReportResponse>('/reports', body);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reports'] }),
  });
}

export function useDeleteReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/reports/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reports'] }),
  });
}
