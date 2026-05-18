import { type PropsWithChildren } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from 'react-error-boundary';
import { KindeProvider } from '@kinde-oss/kinde-auth-react';
import { queryClient } from '../lib/queryClient';
import ErrorFallback from '../components/ErrorFallback';

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

// Kinde-required env vars. We trust that the dev/CI env supplies them;
// if either is missing at runtime Kinde itself throws a clearer error
// than we'd emit here. The cast keeps the JSX prop types happy without
// importing a global env.d.ts shim.
const KINDE_DOMAIN = import.meta.env.VITE_KINDE_DOMAIN as string;
const KINDE_CLIENT_ID = import.meta.env.VITE_KINDE_CLIENT_ID as string;
const KINDE_REDIRECT_URI =
  (import.meta.env.VITE_KINDE_REDIRECT_URI as string | undefined) ??
  `${globalThis.location.origin}/callback`;
const KINDE_LOGOUT_URI =
  (import.meta.env.VITE_KINDE_LOGOUT_REDIRECT_URI as string | undefined) ??
  globalThis.location.origin;

export default function AppProviders({ children }: PropsWithChildren) {
  return (
    <KindeProvider
      clientId={KINDE_CLIENT_ID}
      domain={KINDE_DOMAIN}
      redirectUri={KINDE_REDIRECT_URI}
      logoutUri={KINDE_LOGOUT_URI}
    >
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </KindeProvider>
  );
}

export { ErrorFallback };
