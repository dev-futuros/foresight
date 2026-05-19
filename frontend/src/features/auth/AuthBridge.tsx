import { useEffect } from 'react';
import { useKindeAuth } from '@kinde-oss/kinde-auth-react';
import { setTokenGetter } from '../../lib/api';

/**
 * Connects Kinde's session token to the standalone axios instance used
 * across the app.
 *
 * <p>Mounted once inside `<KindeProvider>`, this component grabs the
 * `getToken` function from Kinde's `useKindeAuth()` hook and hands it
 * to the axios request interceptor. Every API call from then on
 * injects a fresh, automatically-refreshed Kinde access token in the
 * `Authorization` header.
 *
 * <p>Previously also called `posthog.identify` / `posthog.reset` to
 * tie the Kinde user id to the analytics distinct_id. That side
 * effect went away with the PostHog removal; when a successor
 * analytics SDK (Mixpanel/Amplitude) lands, re-introduce the
 * identify/reset call here against the new client.
 *
 * <p>Renders nothing — its only purpose is the side effect.
 */
export default function AuthBridge() {
  const { getToken } = useKindeAuth();

  // Wire Kinde's async getToken into the axios interceptor. Re-binds
  // whenever the function identity changes (e.g. after a fresh
  // sign-in) so a stale closure can't hand axios an outdated token
  // getter. Kinde returns `string | undefined`; the axios layer expects
  // `string | null`, so map at the boundary.
  useEffect(() => {
    setTokenGetter(async () => (await getToken()) ?? null);
    return () => setTokenGetter(null);
  }, [getToken]);

  return null;
}
