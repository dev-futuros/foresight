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
import { getReport, listReports } from './fetchers';
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
 */
export function useReport(id: string) {
  return useQuery({
    queryKey: reportKeys.detail(id),
    queryFn: () => getReport(id),
    enabled: !!id,
  });
}
