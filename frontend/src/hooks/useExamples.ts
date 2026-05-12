import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import type {
  ExampleResponse,
  ExampleSummary,
  PromoteToExampleRequest,
  TranslatedReport,
} from '../types/api';

/**
 * List every example. Read-only and global — every authenticated user
 * sees the same set, so the cache key has no per-user component. New
 * examples appear on the next query refresh after a DEV promotes one.
 */
export function useExamples() {
  return useQuery<ExampleSummary[]>({
    queryKey: ['examples'],
    queryFn: async () => {
      const res = await api.get<ExampleSummary[]>('/examples');
      return res.data;
    },
  });
}

/**
 * Fetch a single example by id. Used by the read-only report viewer at
 * {@code /examples/:id}.
 */
export function useExample(id: string) {
  return useQuery<ExampleResponse>({
    queryKey: ['examples', id],
    queryFn: async () => {
      const res = await api.get<ExampleResponse>(`/examples/${id}`);
      return res.data;
    },
    enabled: !!id,
  });
}

/**
 * Promote a report into an example. DEV-only (backend returns 403 for
 * other roles; the frontend additionally hides the trigger). Re-promoting
 * with the same slug overwrites the existing example.
 */
export function usePromoteToExample() {
  const qc = useQueryClient();
  return useMutation<
    ExampleResponse,
    Error,
    { reportId: string; body: PromoteToExampleRequest }
  >({
    mutationFn: async ({ reportId, body }) => {
      const res = await api.post<ExampleResponse>(
        `/reports/${reportId}/promote-to-example`,
        body,
      );
      return res.data;
    },
    onSuccess: (_data, vars) => {
      // Examples list gained a row; reports list LOST one because
      // promote now converts (deletes the source report). Invalidate
      // both so the dashboard reflects the move without a hard reload.
      // Detail row for the source report is also gone — wipe it so any
      // open viewer redirects via the example fallback.
      qc.invalidateQueries({ queryKey: ['examples'] });
      qc.invalidateQueries({ queryKey: ['reports'] });
      qc.removeQueries({ queryKey: ['reports', vars.reportId] });
    },
  });
}

/**
 * Demote an example back to a private report owned by the calling DEV.
 * The example row is removed; the new report is the dev's personal copy
 * (editable, deletable, re-promotable). DEV-only — the backend returns
 * 403 for other roles.
 *
 * <p>Returns the new report's id so the caller can navigate the user
 * straight to its viewer.
 */
export function useDemoteExample() {
  const qc = useQueryClient();
  return useMutation<{ reportId: string }, Error, string>({
    mutationFn: async (id) => {
      const res = await api.post<{ reportId: string }>(`/examples/${id}/demote`);
      return res.data;
    },
    onSuccess: () => {
      // Examples list lost a row, reports list gained one.
      qc.invalidateQueries({ queryKey: ['examples'] });
      qc.invalidateQueries({ queryKey: ['reports'] });
    },
  });
}

/** Delete an example. DEV-only. */
export function useDeleteExample() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      await api.delete(`/examples/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['examples'] });
    },
  });
}

/**
 * Translate an example (non-streaming). Cache-warm calls return instantly
 * for any user; cache-cold calls require DEV role (the backend will 403
 * non-DEV callers). The share / export flows go through this hook because
 * they only need the final payload.
 */
export function useTranslateExample() {
  const qc = useQueryClient();
  return useMutation<
    TranslatedReport,
    Error,
    { id: string; targetLanguage: 'es' | 'en'; force?: boolean }
  >({
    mutationFn: async ({ id, targetLanguage, force = false }) => {
      const res = await api.post<TranslatedReport>(
        `/examples/${id}/translate`,
        null,
        { params: { targetLanguage, force } },
      );
      return res.data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['examples'] });
      qc.invalidateQueries({ queryKey: ['examples', vars.id] });
    },
  });
}

/** Drop a cached translation from an example. DEV-only. */
export function useDeleteExampleTranslation() {
  const qc = useQueryClient();
  return useMutation<void, Error, { id: string; language: 'es' | 'en' }>({
    mutationFn: async ({ id, language }) => {
      await api.delete(`/examples/${id}/translations/${language}`);
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['examples'] });
      qc.invalidateQueries({ queryKey: ['examples', vars.id] });
    },
  });
}
