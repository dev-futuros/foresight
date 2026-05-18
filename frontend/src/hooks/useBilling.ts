import { useQuery } from '@tanstack/react-query';
import { useKindeAuth } from '@kinde-oss/kinde-auth-react';
import api from '../lib/api';
import type { BillingProfileResponse } from '../types/api';

/**
 * Fetches the caller's billing snapshot (plan + per-period quota + usage) from
 * `GET /api/billing/entitlements`. The backend composes it from Kinde's Account API
 * (plan/limit) and our local report count (usage).
 *
 * <p>Gated on Kinde's `isAuthenticated` flag — same pattern as {@link useCurrentUser}
 * so we never fire the request before the SDK has decided whether there's a session.
 * Stale time is short (10s) because the value changes whenever the user creates a
 * report (usage++) or upgrades/cancels (plan changes).
 */
export function useBillingProfile() {
  const { isLoading, isAuthenticated } = useKindeAuth();
  return useQuery<BillingProfileResponse>({
    queryKey: ['billing', 'entitlements'],
    enabled: !isLoading && isAuthenticated,
    queryFn: async () => {
      const res = await api.get<BillingProfileResponse>('/billing/entitlements');
      return res.data;
    },
    staleTime: 10_000,
    retry: false,
  });
}
