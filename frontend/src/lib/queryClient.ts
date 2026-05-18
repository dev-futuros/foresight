import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';

/**
 * App-wide React Query client.
 *
 * Three-tier error handling per docs/REFACTOR_PROPOSAL.md:
 *   1. Local UI — components consume `error` / `isError` from a query and
 *      render inline messaging. The default.
 *   2. Global (this file) — every failing query/mutation hits the cache-
 *      level handler below. We log to the console here; once a toast lib
 *      lands this is where the user-visible "request failed" toast fires.
 *   3. Route-level <ErrorBoundary> — for render-time crashes, mounted at
 *      the top of <AppRoutes> in App.tsx.
 *
 * The default `staleTime` was already 60s on develop; left as-is. Per
 * TkDodo, a non-zero staleTime is the right knob for deduplicating burst
 * requests around remounts (locale switches, route transitions).
 */
export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      // eslint-disable-next-line no-console
      console.error('[react-query] query failed', {
        queryKey: query.queryKey,
        error,
      });
      // TODO(phase-2-followup): emit a toast here once a toast primitive
      // lands. The condition we want at that point is
      //   if (query.state.data === undefined) showToast(error);
      // — silently log background-refetch failures, only toast when the
      // user has no cached data to fall back on.
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      // eslint-disable-next-line no-console
      console.error('[react-query] mutation failed', {
        mutationKey: mutation.options.mutationKey,
        error,
      });
      // TODO(phase-2-followup): toast on mutation errors too. Mutations
      // are user-initiated so the toast is almost always appropriate,
      // unlike background-refetch query failures.
    },
  }),
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000 * 60,
    },
  },
});
