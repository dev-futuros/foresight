import { useQuery } from '@tanstack/react-query';
import { useAuth as useClerkAuth, useClerk } from '@clerk/react';
import api from '../lib/api';
import type { UserResponse } from '../types/api';

/**
 * Fetches the local user profile (`/api/users/me`).
 *
 * Disabled until Clerk has confirmed a signed-in session — that prevents the brief 401
 * we'd otherwise hit between mount and the first time `getToken()` resolves, and avoids
 * fetching for signed-out users altogether.
 */
export function useCurrentUser() {
  const { isLoaded, isSignedIn } = useClerkAuth();
  return useQuery<UserResponse>({
    queryKey: ['me'],
    enabled: isLoaded && isSignedIn === true,
    queryFn: async () => {
      const res = await api.get<UserResponse>('/users/me');
      return res.data;
    },
    retry: false,
  });
}

/**
 * True iff the currently-signed-in user has the {@code DEV} role.
 *
 * <p>Used to gate the Promote-to-Example button, the Delete-Example
 * affordance on dashboard cards, and the translate-example flow. The
 * backend re-checks every DEV-only endpoint with HTTP 403, so this hook
 * is just for hiding UI — never for enforcing security.
 *
 * <p>Returns {@code false} while the user query is still loading; DEV-
 * scoped affordances only appear once we're sure the role is DEV.
 */
export function useIsDev(): boolean {
  const { data } = useCurrentUser();
  return data?.role === 'DEV';
}

/**
 * Returns a function that signs the user out of Clerk and redirects to the sign-in page.
 * Replaces the previous JWT-based logout that just dropped the token from localStorage.
 *
 * <p>Side effect: clears the per-session "onboarding seen" flag so the next
 * login re-shows the welcome dialog. Without this, a user who logs out and
 * back in within the same browser tab keeps the sessionStorage flag and
 * never sees onboarding again — only persistent dismissal (the "don't
 * show again" checkbox) should silence it across logins.
 */
export function useLogout() {
  const { signOut } = useClerk();
  return () => {
    try {
      sessionStorage.removeItem('fs_onboarding_seen_this_session');
    } catch {
      /* private mode / quota — ignore */
    }
    return signOut({ redirectUrl: '/sign-in' });
  };
}
