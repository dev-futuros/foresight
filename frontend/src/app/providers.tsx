import { type PropsWithChildren } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { KindeProvider } from '@kinde-oss/kinde-auth-react';
import { queryClient } from '../lib/queryClient';
import ErrorFallback from '../components/ErrorFallback';
import { env } from '../env';

/**
 * App-wide provider stack.
 *
 * <p>Order matters:
 * <ol>
 *   <li>{@link KindeProvider} — outermost so the auth context is
 *       available everywhere, including inside React Query callbacks
 *       that need the bearer token.</li>
 *   <li>{@link QueryClientProvider} — needed by both data hooks and
 *       the ErrorBoundary fallback (the fallback can fire on a query
 *       error, and the fallback may want to invalidate).</li>
 *   <li>{@link ErrorBoundary} — innermost provider, outermost render
 *       guard. Tier-3 error handling per docs/REFACTOR_PROPOSAL.md.
 *       Note it lives in {@link AppRouter} (inside the BrowserRouter)
 *       NOT here, so the fallback can use router hooks.</li>
 * </ol>
 */

// Optional Kinde URIs default to {@code origin}-derived values. Computed
// inside the component so SSR / non-browser hosts don't trip on the
// {@code globalThis.location} read at module-eval time.
export default function AppProviders({ children }: PropsWithChildren) {
  const redirectUri = env.kinde.redirectUri ?? `${globalThis.location.origin}/callback`;
  const logoutUri = env.kinde.logoutUri ?? globalThis.location.origin;
  return (
    <KindeProvider
      clientId={env.kinde.clientId}
      domain={env.kinde.domain}
      redirectUri={redirectUri}
      logoutUri={logoutUri}
    >
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </KindeProvider>
  );
}

export { ErrorFallback };
