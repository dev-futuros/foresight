import { useEffect } from 'react';
import { useKindeAuth } from '@kinde-oss/kinde-auth-react';
import * as Sentry from '@sentry/react';
import { setTokenGetter } from '../../lib/api';

/**
 * Connects Kinde's session token to the standalone axios instance used
 * across the app, and mirrors the active Kinde user id into Sentry so
 * captured errors carry a {@code user.id} field.
 *
 * <p>Mounted once inside `<KindeProvider>`. Two side effects:
 *
 * <ol>
 *   <li>Hands Kinde's async {@code getToken} to the axios request
 *       interceptor so every API call carries a fresh, automatically-
 *       refreshed bearer token.</li>
 *   <li>Calls {@link Sentry.setUser} with the Kinde id whenever a user
 *       is present, and {@link Sentry.setUser}(null) on sign-out, so
 *       error events carry the user dimension without picking up any
 *       email/name/etc. (id only — Sentry's PII-minimal default).</li>
 * </ol>
 *
 * <p>When a product-analytics SDK (Mixpanel/Amplitude) lands, add an
 * {@code analytics.identify(user.id)} / {@code analytics.reset()}
 * pair to the same effect.
 *
 * <p>Renders nothing — its only purpose is the side effects.
 */
export default function AuthBridge() {
  const { getToken, isLoading, isAuthenticated, user } = useKindeAuth();

  // Wire Kinde's async getToken into the axios interceptor. Re-binds
  // whenever the function identity changes (e.g. after a fresh
  // sign-in) so a stale closure can't hand axios an outdated token
  // getter. Kinde returns `string | undefined`; the axios layer
  // expects `string | null`, so map at the boundary.
  useEffect(() => {
    setTokenGetter(async () => (await getToken()) ?? null);
    return () => setTokenGetter(null);
  }, [getToken]);

  // Sentry identity. Guard on !isLoading so we don't flip user → null
  // during the brief hydration window before Kinde knows whether
  // there's a session. Sentry.setUser is a no-op when Sentry wasn't
  // initialised (no DSN), so this stays safe in local dev.
  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated && user?.id) {
      Sentry.setUser({ id: user.id });
    } else {
      Sentry.setUser(null);
    }
  }, [isLoading, isAuthenticated, user?.id]);

  return null;
}
