/**
 * Write-side React Query hooks for the examples feature.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { reportKeys } from '../../report/api';
import {
  deleteExample,
  deleteExampleTranslation,
  demoteExample,
  promoteToExample,
  translateExample,
} from './fetchers';
import { exampleKeys } from './queryKeys';

/**
 * Promote a report → example. Examples list gains a row; the source
 * report disappears from the reports list AND its detail entry is
 * removed (so any open viewer redirects via the example fallback).
 */
export function usePromoteToExample() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: promoteToExample,
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: exampleKeys.lists() });
      qc.invalidateQueries({ queryKey: reportKeys.lists() });
      qc.removeQueries({ queryKey: reportKeys.detail(vars.reportId) });
    },
  });
}

/** Demote example → private report. Examples list loses a row, reports
 *  list gains one. */
export function useDemoteExample() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: demoteExample,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: exampleKeys.lists() });
      return qc.invalidateQueries({ queryKey: reportKeys.lists() });
    },
  });
}

export function useDeleteExample() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteExample,
    onSuccess: () => qc.invalidateQueries({ queryKey: exampleKeys.lists() }),
  });
}

export function useTranslateExample() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: translateExample,
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: exampleKeys.lists() });
      return qc.invalidateQueries({ queryKey: exampleKeys.detail(vars.id) });
    },
  });
}

export function useDeleteExampleTranslation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteExampleTranslation,
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: exampleKeys.lists() });
      return qc.invalidateQueries({ queryKey: exampleKeys.detail(vars.id) });
    },
  });
}
