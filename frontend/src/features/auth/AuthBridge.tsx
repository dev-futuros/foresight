import { useEffect } from 'react';
import { useKindeAuth } from '@kinde-oss/kinde-auth-react';
import { setTokenGetter } from '../../lib/api';
import * as posthog from '../../lib/posthog';

/**
 * Connects Kinde's session token to the standalone axios instance used across the app
 * and ties the active Kinde user id to PostHog as the analytics distinct_id.
 *
 * <p>Mounted once inside `<KindeProvider>`, this component grabs the `getToken`
 * function from Kinde's `useKindeAuth()` hook and hands it to the axios request
 * interceptor. Every API call from then on injects a fresh, automatically-refreshed
 * Kinde access token in the `Authorization` header.
 *
 * <p>It also calls {@link posthog.identify} whenever a Kinde user is present and
 * {@link posthog.reset} when they sign out, so backend `$ai_generation` events
 * (which use the same Kinde id as their `distinct_id`) line up with frontend
 * pageviews and UI events on a single person in PostHog.
 *
 * <p>Renders nothing — its only purpose is the side effect.
 */
export default function AuthBridge() {
  const { getToken, isLoading, isAuthenticated, user } = useKindeAuth();

  // Wire Kinde's async getToken into the axios interceptor. Re-binds whenever the
  // function identity changes (e.g. after a fresh sign-in) so a stale closure can't
  // hand axios an outdated token getter. Kinde returns `string | undefined`; the
  // axios layer expects `string | null`, so map at the boundary.
  useEffect(() => {
    setTokenGetter(async () => (await getToken()) ?? null);
    return () => setTokenGetter(null);
  }, [getToken]);

  // Identify (and reset) follow the auth state. We guard on !isLoading so we don't
  // call identify before Kinde knows whether there's a session.
  //
  // We do NOT guard on consent here. `posthog.identify` doesn't capture an
  // event on its own — it just sets the identity used by subsequent captures.
  // Calling it before opt-in is harmless: PostHog drops captures until the
  // user accepts, then attributes everything after that point to the right
  // person row.
  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated && user?.id) {
      posthog.identify(user.id);
    } else {
      posthog.reset();
    }
  }, [isLoading, isAuthenticated, user?.id]);

  return null;
}
