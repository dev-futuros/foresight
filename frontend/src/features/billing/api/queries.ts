import { useQuery } from '@tanstack/react-query';
import { useKindeAuth } from '@kinde-oss/kinde-auth-react';
import { getBillingEntitlements } from './fetchers';
import { billingKeys } from './queryKeys';

/**
 * Gated on Kinde's `isAuthenticated` flag — same pattern as
 * useCurrentUser so we never fire the request before the SDK has
 * decided whether there's a session. Stale time is short (10s)
 * because the value changes whenever the user creates a report
 * (usage++) or upgrades/cancels (plan changes).
 */
export function useBillingProfile() {
  const { isLoading, isAuthenticated } = useKindeAuth();
  return useQuery({
    queryKey: billingKeys.entitlements(),
    queryFn: getBillingEntitlements,
    enabled: !isLoading && isAuthenticated,
    staleTime: 10_000,
    retry: false,
  });
}
