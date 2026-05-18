/**
 * Auth-session helpers (Kinde wrappers). Not strictly "API" code in
 * the React Query sense — there's no fetcher — but these live with the
 * account feature because they manage the same session/identity the
 * useCurrentUser query depends on.
 */
import { useKindeAuth } from '@kinde-oss/kinde-auth-react';

/**
 * sessionStorage flag set by useLogout, checked by ProtectedRoute.
 *
 * Why this exists — the race the SDK creates:
 *   The Kinde SDK's logout() flips `isAuthenticated` to false
 *   synchronously (via React setState) BEFORE the browser is
 *   redirected to Kinde's /logout endpoint. In that gap (one render
 *   frame), any consumer of useKindeAuth that reacts to
 *   `isAuthenticated === false` will fire. ProtectedRoute reacts by
 *   triggering login() — which races the SDK's /logout redirect and
 *   usually wins. Result: browser lands on Kinde's /oauth2/auth with
 *   the session cookie still active, Kinde silently re-authenticates,
 *   and the user bounces back into the app via /callback. From the
 *   user's POV, logout "doesn't work".
 *
 * Setting this flag before invoking logout() lets ProtectedRoute know
 * not to fire login() during the gap. LoggedOutRoute clears the flag
 * once the user actually lands on /logged-out. A 30s safety timeout
 * also clears it in case logout fails outright and never reaches
 * /logged-out (otherwise the flag would persist across reloads in
 * the same tab and permanently block ProtectedRoute).
 */
export const LOGOUT_IN_PROGRESS_KEY = 'fs_logout_in_progress';

/**
 * Returns a function that signs the user out of Kinde and redirects
 * to the configured logout URI (`VITE_KINDE_LOGOUT_REDIRECT_URI`).
 *
 * <p>Sets {@link LOGOUT_IN_PROGRESS_KEY} in sessionStorage so
 * ProtectedRoute can suppress the login() call it would otherwise
 * fire when the SDK synchronously flips `isAuthenticated` to false a
 * frame before the actual Kinde redirect lands.
 *
 * <p>Side effect: clears the per-session "onboarding seen" flag so
 * the next login re-shows the welcome dialog.
 */
export function useLogout() {
  const { logout } = useKindeAuth();
  return () => {
    try {
      sessionStorage.removeItem('fs_onboarding_seen_this_session');
      sessionStorage.setItem(LOGOUT_IN_PROGRESS_KEY, '1');
    } catch {
      /* private mode / quota — ignore */
    }
    // Safety: if logout fails outright and the user never reaches
    // /logged-out (where the flag is normally cleared), make sure
    // the flag doesn't permanently block ProtectedRoute on this tab.
    setTimeout(() => {
      try {
        sessionStorage.removeItem(LOGOUT_IN_PROGRESS_KEY);
      } catch {
        /* ignore */
      }
    }, 30_000);
    return logout();
  };
}
