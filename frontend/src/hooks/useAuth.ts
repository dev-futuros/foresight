import { useQuery } from '@tanstack/react-query';
import { useKindeAuth } from '@kinde-oss/kinde-auth-react';
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
 * configured logout URI (`VITE_KINDE_LOGOUT_REDIRECT_URI`).
 *
 * <p>Language carrying across the logout hop is handled by the
 * `futuros_lang` cookie scoped to `.futuros.io` — i18next-browser-languagedetector
 * keeps it in sync with `i18n.language` automatically (see i18n/index.ts).
 * When /logged-out loads, the detector reads the cookie and renders in the
 * right language.
 *
 * <p>We intentionally do *not* pass `?lang=` on the redirect URL via the
 * SDK's `redirectUrl` override — Kinde validates the URL against the
 * "Allowed Logout Redirect URLs" list in the dashboard, and a per-call URL
 * with query params won't match an entry without them. The cookie does the
 * same job without that constraint.
 *
 * <p>Side effect: clears the per-session "onboarding seen" flag so the next
 * login re-shows the welcome dialog.
 */
export function useLogout() {
  const { logout } = useKindeAuth();
  return () => {
    try {
      sessionStorage.removeItem('fs_onboarding_seen_this_session');
    } catch {
      /* private mode / quota — ignore */
    }
    return logout();
  };
}
