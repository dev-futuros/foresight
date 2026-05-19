import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import * as Sentry from '@sentry/react';

/**
 * App-wide React Query client.
 *
 * Three-tier error handling per docs/REFACTOR_PROPOSAL.md:
 *   1. Local UI — components consume `error` / `isError` from a query
 *      and render inline messaging. The default.
 *   2. Global (this file) — every failing query/mutation hits the
 *      cache-level handler below. Errors are reported to Sentry with
 *      tags identifying the kind (query vs mutation) and the key as
 *      extra context so the dashboard groups related failures.
 *   3. Route-level <ErrorBoundary> — for render-time crashes, mounted
 *      at the top of <AppRoutes> in app/router.tsx.
 *
 * <p>Sentry is a no-op when VITE_SENTRY_DSN isn't set (see
 * lib/sentry.ts) — local dev shows errors in the browser console as
 * before. When the DSN is set (prod, staging), the SDK swallows the
 * captureException without logging.
 *
 * <p>The default `staleTime` was already 60s on develop; left as-is.
 * Per TkDodo, a non-zero staleTime is the right knob for deduplicating
 * burst requests around remounts (locale switches, route transitions).
 */
export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      Sentry.captureException(error, {
        tags: { kind: 'query' },
        extra: { queryKey: query.queryKey },
      });
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      Sentry.captureException(error, {
        tags: { kind: 'mutation' },
        extra: { mutationKey: mutation.options.mutationKey },
      });
    },
  }),
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000 * 60,
    },
  },
});
