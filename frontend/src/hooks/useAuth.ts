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
 * Returns a function that signs the user out of Clerk and redirects to the sign-in page.
 * Replaces the previous JWT-based logout that just dropped the token from localStorage.
 */
export function useLogout() {
  const { signOut } = useClerk();
  return () => signOut({ redirectUrl: '/sign-in' });
}
