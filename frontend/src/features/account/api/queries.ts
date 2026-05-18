import { useQuery } from '@tanstack/react-query';
import { useKindeAuth } from '@kinde-oss/kinde-auth-react';
import { getCurrentUser } from './fetchers';
import { accountKeys } from './queryKeys';

/**
 * Fetches the local user profile.
 *
 * Disabled until Kinde has confirmed a signed-in session — that
 * prevents the brief 401 between mount and the first time getToken()
 * resolves, and avoids fetching for signed-out users altogether.
 */
export function useCurrentUser() {
  const { isLoading, isAuthenticated } = useKindeAuth();
  return useQuery({
    queryKey: accountKeys.me(),
    queryFn: getCurrentUser,
    enabled: !isLoading && isAuthenticated,
    retry: false,
  });
}

/**
 * True iff the currently-signed-in user has the DEV role.
 *
 * <p>Used to gate the Promote-to-Example button, the Delete-Example
 * affordance, and translate-example. The backend re-checks every
 * DEV-only endpoint with HTTP 403, so this is just for hiding UI —
 * never for enforcing security.
 *
 * <p>Returns false while the user query is still loading.
 */
export function useIsDev(): boolean {
  const { data } = useCurrentUser();
  return data?.role === 'DEV';
}
