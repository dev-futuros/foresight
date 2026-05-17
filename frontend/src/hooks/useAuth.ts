import { useQuery } from '@tanstack/react-query';
import { useKindeAuth } from '@kinde-oss/kinde-auth-react';
import { useTranslation } from 'react-i18next';
import api from '../lib/api';
import type { UserResponse } from '../types/api';

/**
 * Fetches the local user profile (`/api/users/me`).
 *
 * Disabled until Kinde has confirmed a signed-in session — that prevents the brief 401
 * we'd otherwise hit between mount and the first time `getToken()` resolves, and avoids
 * fetching for signed-out users altogether.
 */
export function useCurrentUser() {
  const { isLoading, isAuthenticated } = useKindeAuth();
  return useQuery<UserResponse>({
    queryKey: ['me'],
    enabled: !isLoading && isAuthenticated === true,
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
 * Returns a function that signs the user out of Kinde and redirects to the
 * configured logout URI with `?lang=<current-language>` appended, so the
 * branded /logged-out page can render in the user's current language.
 *
 * <p>The Kinde React SDK's `logout({ redirectUrl })` option overrides the
 * static `logoutUri` prop on KindeProvider for this single call. The base
 * URL still comes from `VITE_KINDE_LOGOUT_REDIRECT_URI` so prod/dev paths
 * stay configurable; we just append the language at call time.
 *
 * <p>Side effect: clears the per-session "onboarding seen" flag so the next
 * login re-shows the welcome dialog. Without this, a user who logs out and
 * back in within the same browser tab keeps the sessionStorage flag and
 * never sees onboarding again — only persistent dismissal (the "don't
 * show again" checkbox) should silence it across logins.
 */
export function useLogout() {
  const { logout } = useKindeAuth();
  const { i18n } = useTranslation();
  return () => {
    try {
      sessionStorage.removeItem('fs_onboarding_seen_this_session');
    } catch {
      /* private mode / quota — ignore */
    }
    const base =
      import.meta.env.VITE_KINDE_LOGOUT_REDIRECT_URI ?? globalThis.location.origin;
    return logout({ redirectUrl: `${base}?lang=${i18n.language}` });
  };
}
