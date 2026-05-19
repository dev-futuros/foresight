/**
 * Read-side React Query hooks for the report feature. Thin wrappers
 * around the fetchers in ./fetchers.ts — components should always go
 * through these (or the mutation hooks in ./mutations.ts), never call
 * the raw fetchers from a render path.
 *
 * Per docs/REFACTOR_PROPOSAL.md (TkDodo's pattern): query keys come from
 * ./queryKeys.ts, fetcher return types drive the inference, and we do
 * NOT pass generics to useQuery manually.
 */
import { useQuery } from '@tanstack/react-query';
import { getReport, listReports, type ReportWithSource } from './fetchers';
import { reportKeys } from './queryKeys';

export function useReports(page = 0, size = 20) {
  return useQuery({
    queryKey: reportKeys.list({ page, size }),
    queryFn: () => listReports({ page, size }),
  });
}

/**
 * Fetch a single report row. Includes the example-fallback inside the
 * fetcher (see getReport in ./fetchers.ts) — the returned object's
 * `source` field tells consumers which kind they got.
 *
 * <p>Accepts an optional {@code select} callback (TkDodo's pattern) so
 * consumers that only need a slice can subscribe to that slice and
 * skip re-renders when other fields change. The selector should be
 * defined at module scope (or wrapped in useCallback) so its
 * reference is stable — fresh references on every render re-run
 * select even when nothing else changed.
 *
 * <p>Example:
 * <pre>
 *   const selectLanguages = (r: ReportWithSource) => ({
 *     primary: r.primaryLanguage,
 *     available: r.availableLanguages,
 *   });
 *   const { data } = useReport(id, selectLanguages);
 * </pre>
 */
export function useReport<TSelected = ReportWithSource>(
  id: string,
  select?: (data: ReportWithSource) => TSelected,
) {
  return useQuery({
    queryKey: reportKeys.detail(id),
    queryFn: () => getReport(id),
    enabled: !!id,
    select,
  });
}
