/**
 * Write-side React Query hooks for the report feature.
 *
 * Per docs/REFACTOR_PROPOSAL.md (TkDodo):
 *   • cache invalidation lives in `onSuccess` here
 *   • UI side-effects (toast, navigate, close modal) live on the
 *     `mutate(...)` call at the consumer site so they're skipped when
 *     the component unmounts mid-flight
 *   • we `return` the invalidate promise from `onSuccess` so `isPending`
 *     stays true until the refetched data lands
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { billingKeys } from '../../billing/api';
import type { UpdateReportRequest } from '../../../types/api';
import {
  createReport,
  deleteReport,
  deleteTranslation,
  startGeneration,
  translateReport,
  updateReport,
} from './fetchers';
import { reportKeys } from './queryKeys';

export function useCreateReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createReport,
    onSuccess: () => qc.invalidateQueries({ queryKey: reportKeys.lists() }),
  });
}

export function useUpdateReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateReportRequest }) =>
      updateReport(id, body),
    onSuccess: (data) => {
      qc.setQueryData(reportKeys.detail(data.id), data);
      return qc.invalidateQueries({ queryKey: reportKeys.lists() });
    },
  });
}

/**
 * Records a "click Generate" event — gates the user's per-period quota
 * on the Kinde plan and increments the counter on success. Called by
 * the wizard's Generate handler RIGHT BEFORE the parallel Anthropic
 * batch fires, so no AI tokens are spent when the gate rejects (HTTP
 * 429 or 402).
 *
 * <p>On success, invalidates the billing cache so the AccountModal's
 * usage chip refreshes.
 */
export function useStartGeneration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: startGeneration,
    onSuccess: () => qc.invalidateQueries({ queryKey: billingKeys.all }),
  });
}

export function useDeleteReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteReport,
    onSuccess: () => qc.invalidateQueries({ queryKey: reportKeys.lists() }),
  });
}

/**
 * Translate a report into a target language. Cached per (report ×
 * language) on the backend — the first call for a given pair takes
 * 10–30s, subsequent calls return the stored payload instantly. The
 * mutation invalidates the report detail cache so the new
 * `availableLanguages` entry shows up immediately in any open dialog.
 */
export function useTranslateReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: translateReport,
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: reportKeys.detail(vars.id) }),
  });
}

/**
 * Drop a cached translation from a report. On success the dashboard
 * list AND the report detail are invalidated so the badge flips back
 * to `+ EN` everywhere it's rendered.
 */
export function useDeleteTranslation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteTranslation,
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: reportKeys.lists() });
      return qc.invalidateQueries({ queryKey: reportKeys.detail(vars.id) });
    },
  });
}
